import Anthropic from '@anthropic-ai/sdk';
import * as logger from 'firebase-functions/logger';
import * as dotenv from 'dotenv';
import * as functions from 'firebase-functions';

dotenv.config();

// Get API key from environment variable or Firebase config
const API_KEY = process.env.ANTHROPIC_API_KEY || 
  (functions.config().anthropic?.apikey || '');

// Initialize Anthropic client with proper error handling
const anthropic = new Anthropic({
  apiKey: API_KEY,
  maxRetries: 3, // Add retries for resilience
});

// Log API key status (without revealing the actual key)
if (!API_KEY) {
  console.error('Anthropic API key is not configured. Check environment variables or Firebase config.');
} else {
  console.log('Anthropic API key is configured.');
}

// Define interfaces for document processing
interface DocumentRequest {
  type: 'pdf' | 'image';
  data: string; // Base64 encoded document data
  mimeType?: string;
}

export interface ShipmentDetails {
  bolNumber: string;
  bookingNumber: string;
  vesselName: string;
  voyageNumber: string;
  portOfLoading: string;
  portOfDischarge: string;
  dateOfIssue: string;
  shipmentDate: string;
  carrierReference?: string;
}

export interface Party {
  name: string;
  address: string;
  taxId: string;
}

export interface Container {
  containerNumber: string;
  sealNumber: string;
  type: string;
  product: {
    name: string;
    description: string;
    hsCode: string;
  };
  quantity: {
    volume: {
      liters: number;
      gallons: number;
    };
    weight: {
      kg: number;
      lbs: number;
      mt: number;
    };
  };
}

export interface ProcessedDocument {
  shipmentDetails: ShipmentDetails;
  parties: {
    shipper: Party;
    consignee: Party;
    notifyParty: {
      name: string;
      address: string;
    };
  };
  containers: Container[];
  commercial: {
    currency: string;
    freightTerms: string;
    itnNumber: string;
    totalWeight?: {
      kg: string;
      lbs: string;
    };
  };
}

export type AnthropicImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export function stripDataUri(data: string): string {
  return data.replace(/^data:[^,]*,/, '');
}

export function normalizeImageMime(mime: string): AnthropicImageMime {
  const cleaned = (mime || '').split(';')[0].trim().toLowerCase();
  if (cleaned === 'image/jpg') return 'image/jpeg';
  const valid: AnthropicImageMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return valid.includes(cleaned as AnthropicImageMime) ? cleaned as AnthropicImageMime : 'image/jpeg';
}

/**
 * Process a document with Claude AI
 * @param document Document to process
 * @returns Processed document information
 */
export async function processDocumentWithClaude(document: DocumentRequest): Promise<ProcessedDocument> {
  try {
    logger.info(`Processing ${document.type} document with Claude`);

    // Start processing timer for performance tracking
    const startTime = Date.now();

    // System prompt for Claude
    const systemPrompt = `You are a logistics document parser specializing in Bills of Lading (BOL).
Your task is to analyze ALL PAGES of the provided Bill of Lading ${document.type} and extract specific information in a structured JSON format.

CRITICAL RULES:
- IMPORTANT: Read and analyze ALL PAGES of the document thoroughly
- Extract ALL information EXACTLY as shown in the document
- For the BOL number:
  * Use ONLY the number shown in "B/L No." field
  * This is usually in the header or top section of the document
  * Do NOT use the document identifier as the BOL number unless it is explicitly labeled as B/L No.
- For the carrier's reference:
  * Use ONLY the number shown in the "Carrier's Reference" field if it exists
  * This is a specific field distinct from the BOL number
  * Leave it as an empty string "" if not found
- Convert measurements to all requested units
- Create separate entries for each container/item
- Use empty string "" for missing text fields
- Use 0 for missing numerical values
- Preserve exact formatting of numbers, dates, and identifiers
- Return ONLY the JSON object, no additional text or explanations`;

    // User prompt with the document to analyze
    const userPrompt = `I'm providing you with a Bill of Lading (BOL) document that may have multiple pages.
Please analyze ALL PAGES thoroughly and extract the information into the following JSON structure.

IMPORTANT: Make sure to:
1. Read and analyze every page of the document
2. Combine information that spans across pages
3. Include ALL containers and their details from ALL pages
4. For "bolNumber", use ONLY the actual Bill of Lading number (B/L No.)  
5. For "carrierReference", use ONLY the actual Carrier's Reference number if present
6. Verify totals match the sum of all items across all pages

Return this EXACT JSON structure with the values found:
{
  "shipmentDetails": {
    "bolNumber": "",        // ONLY from "B/L No." field in header
    "bookingNumber": "",    // From booking reference if available
    "carrierReference": "", // ONLY from "Carrier's Reference" field
    "vesselName": "",       // Vessel name only
    "voyageNumber": "",     // Voyage number if available
    "portOfLoading": "",    // Port of loading
    "portOfDischarge": "",  // Port of discharge
    "dateOfIssue": "",     // Date of issue
    "shipmentDate": ""     // Shipment/onboard date
  },
  "parties": {
    "shipper": {
      "name": "",          // Company name from shipper section
      "address": "",       // Complete address
      "taxId": ""         // Tax ID/RIF if shown
    },
    "consignee": {
      "name": "",         // Company name from consignee section
      "address": "",      // Complete address
      "taxId": ""        // Tax ID/RIF if shown
    },
    "notifyParty": {
      "name": "",        // From notify party section
      "address": ""     // Complete address
    }
  },
  "containers": [
    {
      "containerNumber": "",  // Container number from cargo details
      "sealNumber": "",      // Seal number
      "type": "",           // Container type (e.g., "DRY")
      "product": {
        "name": "",         // Product name
        "description": "",  // Full product description
        "hsCode": ""       // HS Code if available
      },
      "quantity": {
        "volume": {
          "liters": 0,     // Convert to liters if needed
          "gallons": 0     // Convert to gallons if needed
        },
        "weight": {
          "kg": 0,         // Weight in KG
          "lbs": 0,        // Convert to pounds
          "mt": 0          // Convert to metric tons
        }
      }
    }
  ],
  "commercial": {
    "currency": "",        // Currency code if shown
    "freightTerms": "",    // Freight/shipping terms
    "itnNumber": "",      // ITN number if available
    "totalWeight": {
      "kg": "",          // Total weight in KG
      "lbs": ""          // Total weight in pounds
    }
  }
}
`;

    // Call Claude API with timeout handling - increased to 120 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Claude API request timed out after 120 seconds')), 120000);
    });

    const docBlock = document.type === 'pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: stripDataUri(document.data) } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: normalizeImageMime(document.mimeType || 'image/jpeg'), data: stripDataUri(document.data) } };

    const apiPromise = anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 0.0,
      system: systemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text' as const, text: userPrompt }, docBlock] }]
    });

    // Race between API call and timeout
    const response = await Promise.race([apiPromise, timeoutPromise]);

    // Process Claude's response
    const result = processClaudeResponse(response);

    // Log processing time
    const processingTime = Date.now() - startTime;
    logger.info(`Claude processing completed in ${processingTime}ms`);

    return result;
  } catch (error: any) {
    logger.error('Error processing document with Claude:', error);
    
    // Provide a more detailed error with helpful information
    if (error.status === 401) {
      throw new Error('Authentication error: Invalid or expired Anthropic API key');
    } else if (error.status === 429) {
      throw new Error('Rate limit exceeded: Too many requests to Anthropic API');
    } else if (error.status === 500) {
      throw new Error('Anthropic API server error. Please try again later.');
    } else if (error.message?.includes('timeout')) {
      throw new Error('Claude processing timed out. Document may be too complex.');
    } else if (!API_KEY) {
      throw new Error('Anthropic API key is not configured. Please check your environment variables.');
    }
    
    // Generic error handling
    throw new Error(`Failed to process document: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Process Claude's response to extract the JSON object
 * @param response Claude API response
 * @returns Processed document data
 */
function processClaudeResponse(response: any): ProcessedDocument {
  try {
    // Extract text from response
    const text = response.content[0].text || '';
    
    // Find JSON in the response text
    let jsonStr = text;
    
    // Log the first 100 characters of the response for debugging
    console.log(`Claude response (first 100 chars): ${text.substring(0, 100)}...`);
    
    // If the response isn't a pure JSON object, try to extract it
    if (!text.startsWith('{') || !text.endsWith('}')) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in Claude response');
      }
      jsonStr = jsonMatch[0];
    }
    
    // Parse the JSON
    const data = JSON.parse(jsonStr) as ProcessedDocument;
    
    // Validate required fields - more thorough validation
    if (!data.shipmentDetails) {
      throw new Error('Missing shipmentDetails in Claude response');
    }
    
    if (!data.shipmentDetails.bolNumber) {
      // If BOL number is missing but carrier reference exists, use it as fallback
      if (data.shipmentDetails.carrierReference) {
        logger.warn('No BOL number found. Using carrier reference as fallback.');
        data.shipmentDetails.bolNumber = data.shipmentDetails.carrierReference;
      } else {
        throw new Error('Missing BOL number in Claude response');
      }
    }
    
    // Ensure all required objects exist
    if (!data.parties) data.parties = {
      shipper: { name: '', address: '', taxId: '' },
      consignee: { name: '', address: '', taxId: '' },
      notifyParty: { name: '', address: '' }
    };
    
    if (!data.parties.shipper) data.parties.shipper = { name: '', address: '', taxId: '' };
    if (!data.parties.consignee) data.parties.consignee = { name: '', address: '', taxId: '' };
    if (!data.parties.notifyParty) data.parties.notifyParty = { name: '', address: '' };
    
    // Ensure commercial object exists
    if (!data.commercial) data.commercial = {
      currency: '',
      freightTerms: '',
      itnNumber: '',
      totalWeight: { kg: '0', lbs: '0' }
    };
    
    // Ensure containers is an array
    if (!Array.isArray(data.containers)) {
      data.containers = [];
      logger.warn('No containers found in document');
    }
    
    // Log successful extraction
    logger.info(`Successfully extracted BOL data: ${data.shipmentDetails.bolNumber} with ${data.containers.length} containers`);
    
    return data;
  } catch (error) {
    logger.error('Error processing Claude response:', error);
    throw error;
  }
}

/**
 * Helper function to extract BOL number from file name
 * @param fileName The document file name
 * @returns Extracted BOL number or null
 */
export function extractBolNumberFromFileName(fileName: string): string | null {
  // Try to match common BOL number patterns
  const patterns = [
    /(\d{9})/, // Basic 9-digit pattern
    /MDRA\d+_(\d{9})/, // MDRA pattern
    /BOL[_]?(\d{9})/, // BOL prefix pattern with underscore
    /BOL[-]?(\d{9})/, // BOL prefix pattern with hyphen
    /[_](\d{9})[_\.]/, // Surrounded by underscore or dot
    /[-](\d{9})[-\.]/ // Surrounded by hyphen or dot
  ];
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
} 