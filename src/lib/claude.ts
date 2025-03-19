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
  }
}

// This is the main entry point for BOL document processing
export async function processDocumentWithClaude(
  document: { type: 'pdf' | 'image'; data: string },
  template?: string
): Promise<ProcessedDocument> {
  try {
    console.log(`Processing ${document.type} document with Claude API`);
    
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
    "itnNumber": ""       // ITN number if available
  }
}`;

    // Call the implementation in anthropic-fetch.ts
    const apiResponse = await processWithClaude(document, systemPrompt, userPrompt);
    console.log('Received successful response from Anthropic API');
    
    if (!apiResponse.content || apiResponse.content.length === 0) {
      throw new Error('Empty response from Claude API');
    }
    
    // Process the response
    return processClaudeResponse(apiResponse.content[0]);
    
  } catch (error) {
    console.error('Error in processDocumentWithClaude:', error);
    throw error;
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
      throw new Error('No containers found in document');
    }

    // Validate container data
    data.containers.forEach((container, index) => {
      if (!container.containerNumber) {
        throw new Error(`Missing containerNumber in container ${index + 1}`);
      }
      if (!container.product) {
        throw new Error(`Missing product information in container ${index + 1}`);
      }
    });

    // Additional validation for container count
    if (data.containers.length < parseInt(data.shipmentDetails.totalContainers || '0')) {
      throw new Error(`Missing containers: found ${data.containers.length} but expected ${data.shipmentDetails.totalContainers}`);
    }

    // Trim whitespace from string fields
    data.shipmentDetails.bolNumber = data.shipmentDetails.bolNumber.trim();
    
    console.log('Successfully processed document:', {
      bolNumber: data.shipmentDetails.bolNumber,
      containerCount: data.containers.length
    });

    // Ensure carrier reference field exists and has the correct name
    // @ts-ignore - Check for misnamed field
    if (data.shipmentDetails.carriersReference !== undefined && data.shipmentDetails.carrierReference === undefined) {
      // Fix naming inconsistency if present
      // @ts-ignore - Access misnamed field
      data.shipmentDetails.carrierReference = data.shipmentDetails.carriersReference;
      // @ts-ignore - Delete misnamed field
      delete data.shipmentDetails.carriersReference;
      console.log('Fixed carrier reference field name in Claude response');
    }

    return data;
  } catch (error) {
    console.error('Error parsing Claude response:', error);
    console.error('Response text:', firstContent.text);
    throw new Error(`Failed to parse Claude response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 