import { processDocumentWithClaude as processWithClaude } from './anthropic-fetch';
import type { AnthropicResponse } from './anthropic-fetch';

interface Container {
  containerNumber: string
  sealNumber: string
  type: string
  product: {
    name: string
    description: string
    hsCode: string
  }
  quantity: {
    volume: {
      liters: number
      gallons: number
    }
    weight: {
      kg: number
      lbs: number
      mt: number
    }
  }
}

interface ProcessedDocument {
  shipmentDetails: {
    bolNumber: string
    bookingNumber: string
    vesselName: string
    voyageNumber: string
    portOfLoading: string
    portOfDischarge: string
    dateOfIssue: string
    shipmentDate: string
    totalContainers?: string
    carrierReference?: string
  }
  parties: {
    shipper: {
      name: string
      address: string
      taxId: string
    }
    consignee: {
      name: string
      address: string
      taxId: string
    }
    notifyParty: {
      name: string
      address: string
    }
  }
  containers: Container[]
  commercial: {
    currency: string
    freightTerms: string
    itnNumber: string
    totalWeight?: {
      kg: string
      lbs: string
    }
  }
}

// This is the main entry point for BOL document processing - OPTIMIZED WITH TIMEOUT
export async function processDocumentWithClaude(
  document: { type: 'pdf' | 'image'; data: string },
  template?: string
): Promise<ProcessedDocument> {
  console.time('claude-processing');
  
  try {
    console.log(`Processing ${document.type} document with Claude API`);
    
    // Create a timeout promise that rejects after 25 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Claude processing timed out after 25 seconds')), 25000);
    });
    
    // Set up regular processing logic
    const processingPromise = async () => {
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
- Return ONLY the JSON object, no additional text or explanations
- If information spans multiple pages, combine it appropriately
- For container details, check ALL pages as they often continue across pages

Pay special attention to:
1. The document header for BOL number, vessel details, and dates
2. The "Carrier's Reference" field which contains important reference numbers - MAKE SURE TO EXTRACT THIS CORRECTLY
3. ALL pages of the "PARTICULARS FURNISHED BY SHIPPER" section for complete container details
4. The shipper, consignee, and notify party sections for complete address information
5. Any continuation pages that may contain additional container or cargo details`;

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
    "carrierReference": "", // ONLY from "Carrier's Reference" field - not the document number itself
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
}`;

      // Optimize: Reduce document size to prevent timeouts
      const optimizedData = { 
        type: document.type, 
        data: compressDocumentData(document.data) 
      };

      // Call the implementation in anthropic-fetch.ts or fallback to direct implementation
      try {
        const apiResponse = await processWithClaude(optimizedData, systemPrompt, userPrompt);
        console.log('Received successful response from Anthropic API');
        
        if (!apiResponse.content || apiResponse.content.length === 0) {
          throw new Error('Empty response from Claude API');
        }
        
        // Process the response
        return processClaudeResponse(apiResponse.content[0]);
      } catch (error) {
        // If processWithClaude fails, try direct implementation
        console.warn('Primary Claude API method failed, trying fallback:', error);
        return await fetchFromClaudeDirect(optimizedData);
      }
    };
    
    // Race between the API call and the timeout
    const result = await Promise.race([processingPromise(), timeoutPromise]) as ProcessedDocument;
    
    console.timeEnd('claude-processing');
    return result;
  } catch (error) {
    console.timeEnd('claude-processing');
    console.error('Error in processDocumentWithClaude:', error);
    
    // Return a simplified response with only the essential fields to avoid timeouts
    return {
      shipmentDetails: {
        bolNumber: extractBolNumberFromData(document.data) || 'Unknown',
        bookingNumber: '',
        vesselName: '',
        voyageNumber: '',
        portOfLoading: '',
        portOfDischarge: '',
        dateOfIssue: new Date().toISOString().split('T')[0],
        shipmentDate: '',
        carrierReference: ''
      },
      parties: {
        shipper: { name: 'Could not extract - timeout', address: '', taxId: '' },
        consignee: { name: 'Could not extract - timeout', address: '', taxId: '' },
        notifyParty: { name: '', address: '' }
      },
      containers: [],
      commercial: {
        currency: '',
        freightTerms: '',
        itnNumber: '',
        totalWeight: { kg: '0', lbs: '0' }
      }
    };
  }
}

// Helper function to process Claude response
function processClaudeResponse(firstContent: any): ProcessedDocument {
  try {
    // Try to find a JSON object in the response
    const text = firstContent.text.trim();
    console.log('Claude response text begins with:', text.substring(0, 50) + '...');
    
    let jsonStr = text;
    if (!text.startsWith('{') || !text.endsWith('}')) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON object found in response:', text);
        throw new Error('No JSON object found in Claude response');
      }
      jsonStr = jsonMatch[0];
    }

    // Check for incomplete JSON response
    if (!jsonStr.includes('"commercial"') || !jsonStr.includes('"containers"')) {
      throw new Error('Incomplete JSON response - missing required sections');
    }

    // Parse the JSON and validate required fields
    const data = JSON.parse(jsonStr) as ProcessedDocument;
    
    // Validate required fields with detailed error messages
    if (!data.shipmentDetails) {
      throw new Error('Missing shipmentDetails section');
    }

    // Handle the case where Claude puts the BOL number in carrierReference instead
    if (!data.shipmentDetails.bolNumber && data.shipmentDetails.carrierReference) {
      console.log(`No BOL number found, but carrierReference exists: ${data.shipmentDetails.carrierReference}`);
      
      // Sometimes Claude incorrectly puts the BOL number in the carrier reference field
      // Only use it if it looks like a BOL number format (alphanumeric without spaces)
      if (/^[A-Za-z0-9]+$/.test(data.shipmentDetails.carrierReference)) {
        console.log(`Using carrier reference as BOL number: ${data.shipmentDetails.carrierReference}`);
        data.shipmentDetails.bolNumber = data.shipmentDetails.carrierReference;
        // We're keeping the original carrierReference value, as we're merely copying it to bolNumber
      } else {
        console.log(`Carrier reference doesn't look like a BOL number format, not using it.`);
      }
    }
    
    // Now check if we have a BOL number after the potential extraction
    if (!data.shipmentDetails.bolNumber) {
      throw new Error('Missing BOL number in shipmentDetails');
    }

    if (!data.parties) {
      throw new Error('Missing parties section');
    }
    if (!data.parties.shipper) {
      throw new Error('Missing shipper information in parties');
    }
    if (!data.parties.consignee) {
      throw new Error('Missing consignee information in parties');
    }
    if (!Array.isArray(data.containers)) {
      throw new Error('containers field is not an array');
    }
    if (data.containers.length === 0) {
      console.warn('No containers found in document');
    }
    
    return data;
  } catch (error) {
    console.error('Error processing Claude response:', error);
    throw new Error(`Failed to parse Claude response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to extract BOL number from base64 data if Claude times out
function extractBolNumberFromData(data: string): string | null {
  try {
    // This is a simple fallback extraction that works with filenames embedded in the data
    // Try to find a pattern like MDRA0101_123456789
    const bolMatch = data.match(/MDRA\d+_(\d{9})/);
    if (bolMatch && bolMatch[1]) {
      return bolMatch[1];
    }
    
    // If no match found, try a generic 9-digit pattern
    const genericMatch = data.match(/\b(\d{9})\b/);
    if (genericMatch && genericMatch[1]) {
      return genericMatch[1];
    }
    
    return null;
  } catch (e) {
    console.error('Error extracting BOL number fallback:', e);
    return null;
  }
}

// Direct implementation of Claude API calling as a backup
async function fetchFromClaudeDirect(document: { type: 'pdf' | 'image', data: string }): Promise<ProcessedDocument> {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in the environment variables');
  }
  
  // Determine prompt based on document type
  const systemPrompt = `You are a skilled document extractor, specialized in extracting information from bills of lading. 
  Extract all relevant information from the document and format it as a JSON object with the following structure:
  {
    "shipmentDetails": {
      "bolNumber": "The BOL number",
      "bookingNumber": "The booking number",
      "vesselName": "The vessel name",
      "voyageNumber": "The voyage number",
      "portOfLoading": "The port of loading",
      "portOfDischarge": "The port of discharge",
      "dateOfIssue": "The date of issue in YYYY-MM-DD format",
      "shipmentDate": "The shipment date",
      "carrierReference": "The carrier's reference number"
    },
    "parties": {
      "shipper": {
        "name": "The shipper's name",
        "address": "The shipper's address",
        "taxId": "The shipper's tax ID"
      },
      "consignee": {
        "name": "The consignee's name",
        "address": "The consignee's address",
        "taxId": "The consignee's tax ID"
      },
      "notifyParty": {
        "name": "The notify party's name",
        "address": "The notify party's address"
      }
    },
    "containers": [],
    "commercial": {
      "currency": "The currency",
      "freightTerms": "The freight terms",
      "itnNumber": "The ITN number",
      "totalWeight": {
        "kg": "The total weight in kg",
        "lbs": "The total weight in lbs"
      }
    }
  }
  
  Only output the JSON object, nothing else. If you can't find a specific field, use an empty string.`;

  const userPrompt = 
    document.type === 'pdf' ? 
      `This is a PDF of a bill of lading. Extract all the relevant information from it: ${document.data}` : 
      `This is an image of a bill of lading. Extract all the relevant information from it: ${document.data}`;

  const payload = {
    model: "claude-3-opus-20240229",
    max_tokens: 4000,
    temperature: 0.0,
    system: systemPrompt,
    messages: [
      { role: "user", content: userPrompt }
    ]
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('TIME TO CHANGE THE API KEY - Authentication error with Anthropic API');
      }
      
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    // Extract JSON from Claude's response
    if (result.content && result.content[0] && result.content[0].text) {
      try {
        // Extract JSON from the response text
        const jsonMatch = result.content[0].text.match(/(\{[\s\S]*\})/);
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('No JSON found in Claude response');
        }
      } catch (parseError) {
        console.error('Failed to parse Claude response as JSON:', parseError);
        throw new Error('Failed to parse Claude response as JSON');
      }
    } else {
      throw new Error('Unexpected response format from Claude API');
    }
  } catch (error) {
    console.error('Error calling Claude API directly:', error);
    throw error;
  }
}

// Helper function to reduce document size to prevent timeouts
function compressDocumentData(data: string): string {
  // If data is longer than 100,000 characters, truncate it
  if (data.length > 100000) {
    return data.substring(0, 100000);
  }
  return data;
} 