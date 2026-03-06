// Server-side implementation of Claude document processing
import { processBolWithFirebase } from '../lib/firebase-client';

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

export interface ProcessedDocument {
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

// Define Firebase function response type
interface FirebaseBolResponse {
  success: boolean;
  error?: string;
  document: ProcessedDocument;
  storageError?: string;
}

/**
 * Process a document with Claude AI via Firebase Functions
 * This server-side function delegates document processing to Firebase
 * @param document Document to process
 * @returns Processed document information
 */
export async function processDocumentWithClaude(
  document: { type: 'pdf' | 'image'; data: string; mimeType?: string },
  clientId: string
): Promise<ProcessedDocument> {
  try {
    console.log(`Delegating ${document.type} document processing to Firebase`);

    // Use provided mimeType or derive from type field
    const fileType = document.mimeType
      || (document.type === 'pdf' ? 'application/pdf' : 'image/jpeg');

    // Call Firebase function to process the document
    const result = await processBolWithFirebase({
      fileContent: document.data,
      fileName: `document.${document.type === 'pdf' ? 'pdf' : 'jpg'}`, // Default filename
      fileType,
      clientId
    }) as FirebaseBolResponse;
    
    // Check for success and extract document data
    if (!result.success) {
      throw new Error(result.error || 'Document processing failed in Firebase');
    }
    
    // Return the processed document
    return result.document;
  } catch (error: any) {
    console.error('Error in server-side document processing:', error);
    
    // Return a simplified error response
    throw new Error(`Firebase document processing failed: ${error.message}`);
  }
}

/**
 * Extract BOL number from document filename
 * @param fileName Filename to extract BOL number from
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