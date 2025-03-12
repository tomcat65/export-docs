import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'
import { GridFSBucket } from 'mongodb'
import { processDocumentWithClaude } from '@/lib/claude'

// Add type definition for Client
interface ClientDocument {
  _id: mongoose.Types.ObjectId;
  name: string;
  rif: string;
  // Add other client fields as needed
}

// Define the structure of Claude's response with carriersReference
interface ShipmentDetails {
  bolNumber: string;
  bookingNumber: string;
  vesselName: string;
  voyageNumber: string;
  portOfLoading: string;
  portOfDischarge: string;
  dateOfIssue: string;
  shipmentDate: string;
  totalContainers?: string;
  carrierReference?: string; // Fixed the field name to match the rest of the application
}

interface ProcessedDocument {
  shipmentDetails: ShipmentDetails;
  parties: {
    shipper: {
      name: string;
      address: string;
      taxId: string;
    };
    consignee: {
      name: string;
      address: string;
      taxId: string;
    };
    notifyParty: {
      name: string;
      address: string;
    };
  };
  containers: Array<any>;
  commercial: {
    currency: string;
    freightTerms: string;
    itnNumber: string;
  };
}

// Helper function to normalize text for comparison
function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    console.warn('Invalid text provided for normalization:', text);
    return '';
  }
  
  const normalized = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
    
  console.log('Text normalization:', { original: text, normalized });
  return normalized;
}

// Helper function to validate consignee data
function validateConsigneeData(consignee: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!consignee) {
    errors.push('No consignee data found');
    return { isValid: false, errors };
  }
  
  if (!consignee.name || typeof consignee.name !== 'string' || consignee.name.trim().length === 0) {
    errors.push('Invalid or missing consignee name');
  }
  
  if (consignee.name && consignee.name.length < 3) {
    errors.push('Consignee name is suspiciously short');
  }
  
  // Log the validation results
  console.log('Consignee validation:', {
    consignee,
    errors,
    isValid: errors.length === 0
  });
  
  return { isValid: errors.length === 0, errors };
}

// Helper function to verify client match
async function verifyClientMatch(consignee: { name: string; taxId?: string }, clientId: string): Promise<{isMatch: boolean; matchedClient?: ClientDocument; allClients?: any[]}> {
  try {
    // First validate the input data
    const { isValid, errors } = validateConsigneeData(consignee);
    if (!isValid) {
      console.error('Invalid consignee data:', errors);
      return { isMatch: false };
    }
    
    // Normalize consignee name
    const normalizedConsigneeName = normalizeText(consignee.name);
    if (!normalizedConsigneeName) {
      console.error('Empty normalized consignee name');
      return { isMatch: false };
    }
    
    // Get selected client
    const selectedClient = await Client.findById(clientId).lean() as unknown as ClientDocument;
    if (!selectedClient) {
      console.error('Selected client not found');
      return { isMatch: false };
    }
    
    const normalizedClientName = normalizeText(selectedClient.name);
    
    // Log the normalized values for debugging
    console.log('Comparing normalized names:', {
      originalConsignee: consignee.name,
      originalClient: selectedClient.name,
      normalizedConsignee: normalizedConsigneeName,
      normalizedClient: normalizedClientName,
    });
    
    // Get all clients to find potential matches (this could be optimized with a search index)
    const allClients = await Client.find({}).lean();
    
    // Find potential matching clients
    const potentialMatches = allClients.filter(client => {
      const clientNormalizedName = normalizeText(client.name);
      
      // Check for exact match
      if (normalizedConsigneeName === clientNormalizedName) {
        return true;
      }
      
      // Check for strong substring match
      if (normalizedConsigneeName.includes(clientNormalizedName) || 
          clientNormalizedName.includes(normalizedConsigneeName)) {
        
        // If it's just a substring match, it needs to be substantial
        const shorterLength = Math.min(normalizedConsigneeName.length, clientNormalizedName.length);
        const longerLength = Math.max(normalizedConsigneeName.length, clientNormalizedName.length);
        
        // If the shorter string is less than 50% of the longer one, it's too risky
        if (shorterLength < longerLength * 0.5) {
          return false;
        }
        
        return true;
      }
      
      // Check tax ID if available
      if (consignee.taxId && client.rif) {
        const normalizedConsigneeTaxId = normalizeText(consignee.taxId);
        const normalizedClientRif = normalizeText(client.rif);
        return normalizedConsigneeTaxId === normalizedClientRif;
      }
      
      return false;
    });
    
    console.log('Potential client matches:', potentialMatches.map(c => c.name));
    
    // Check if the selected client is among the potential matches
    const isClientMatch = potentialMatches.some(client => 
      client._id && selectedClient._id && 
      client._id.toString() === selectedClient._id.toString()
    );
    
    if (isClientMatch) {
      console.log('Selected client matches consignee');
      return { isMatch: true, matchedClient: selectedClient };
    }
    
    // If we have potential matches but selected client is not among them
    if (potentialMatches.length > 0) {
      console.error('BOL matches a different client than selected');
      return { 
        isMatch: false, 
        matchedClient: potentialMatches[0] as unknown as ClientDocument,
        allClients: potentialMatches.map(c => ({ id: c._id, name: c.name }))
      };
    }
    
    // If no matches at all
    console.error('No client match found for consignee:', consignee.name);
    return { isMatch: false, allClients: allClients.map(c => ({ id: c._id, name: c.name })) };
    
  } catch (error) {
    console.error('Error in client verification:', error);
    return { isMatch: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the uploaded file and form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string
    const relatedBolId = formData.get('relatedBolId') as string
    const subType = formData.get('subType') as string | null
    
    // For BOL uploads, we need clientId and bolNumber
    const clientId = formData.get('clientId') as string
    const bolNumber = formData.get('bolNumber') as string
    
    // Validate required fields based on document type
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }
    
    if (type === 'BOL' && (!clientId || !bolNumber)) {
      return NextResponse.json({ error: 'Missing required fields for BOL upload' }, { status: 400 })
    }
    
    if (type !== 'BOL' && !relatedBolId) {
      return NextResponse.json({ error: 'Missing relatedBolId for related document' }, { status: 400 })
    }

    await connectDB()
    
    let documentClientId = clientId;
    
    // If this is a related document, get the client ID from the related BOL
    if (relatedBolId && !clientId) {
      const relatedBol = await Document.findById(relatedBolId);
      if (!relatedBol) {
        return NextResponse.json({ error: 'Related BOL not found' }, { status: 404 })
      }
      documentClientId = relatedBol.clientId.toString();
    }

    // For related documents, we don't need client verification
    if (type !== 'BOL') {
      try {
        console.log('Uploading related document:', {
          type,
          relatedBolId,
          documentClientId
        });
        
        // Upload related document directly
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
          bucketName: 'documents'
        })

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Upload file to GridFS
        const uploadStream = bucket.openUploadStream(file.name, {
          contentType: file.type,
          metadata: {
            clientId: documentClientId,
            uploadedBy: session.user?.email,
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            documentType: type,
            relatedBolId: relatedBolId
          }
        })

        await new Promise((resolve, reject) => {
          const readStream = require('stream').Readable.from(buffer)
          readStream.pipe(uploadStream)
            .on('error', reject)
            .on('finish', resolve)
        })

        console.log('File uploaded to GridFS, creating document record with type:', type);
        
        // Create document record for related document
        const documentData = {
          clientId: documentClientId,
          fileName: file.name,
          fileId: uploadStream.id,
          type: type,  // We'll handle type validation below
          relatedBolId: new mongoose.Types.ObjectId(relatedBolId),
          createdAt: new Date(),
          updatedAt: new Date(),
          subType: subType || (type === 'INVOICE_EXPORT' ? 'EXPORT' : undefined)
        };
        
        console.log('Document data:', JSON.stringify(documentData));
        
        // Force the type to be one of the enum values if needed
        // This is a temporary fix if the model validation is too strict
        const validTypes = ['BOL', 'PL', 'COO', 'INVOICE_EXPORT', 'INVOICE', 'COA', 'SED', 'DATA_SHEET', 'SAFETY_SHEET'];
        if (!validTypes.includes(type)) {
          console.warn(`Invalid document type: ${type}, defaulting to 'BOL'`);
          documentData.type = 'BOL';
        }
        
        // Fix for INVOICE type
        if (type === 'INVOICE') {
          // Ensure we're using a valid enum value that matches the schema
          documentData.type = 'INVOICE_EXPORT';
          // Set subType to distinguish regular invoices from export invoices
          documentData.subType = documentData.subType || 'REGULAR';
        }
        
        const newDocument = await Document.create(documentData);
        
        console.log('Document created successfully:', newDocument._id);

        return NextResponse.json({
          success: true,
          document: {
            _id: newDocument._id,
            fileName: newDocument.fileName,
            type: newDocument.type
          }
        })
      } catch (error) {
        console.error('Error in related document upload:', error);
        throw error;
      }
    }
    
    // If we reach here, this is a BOL upload, continue with the existing BOL processing
    // Get the selected client's details
    const selectedClient = await Client.findById(documentClientId).lean() as unknown as ClientDocument
    if (!selectedClient) {
      return NextResponse.json({ error: 'Selected client not found' }, { status: 400 })
    }

    // Log the selected client details
    console.log('Selected client:', {
      id: selectedClient._id,
      name: selectedClient.name,
      rif: selectedClient.rif
    });

    // Convert File to Buffer for Claude processing
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Always process with Claude first to verify the client
    console.log('Processing BOL with Claude for client verification:', bolNumber)
    const documentType = file.type.includes('pdf') ? 'pdf' : 'image'
    const claudeData = await processDocumentWithClaude({
      type: documentType,
      data: buffer.toString('base64')
    }) as ProcessedDocument;

    // SECURITY CHECK: Log the entire Claude response for debugging critical issues
    console.log('---------- CLAUDE FULL RESPONSE ----------');
    console.log(JSON.stringify(claudeData, null, 2));
    console.log('------------------------------------------');

    // Fix any naming inconsistencies with carrier reference
    // @ts-ignore - Check for misnamed field
    if (claudeData.shipmentDetails.carriersReference !== undefined && claudeData.shipmentDetails.carrierReference === undefined) {
      // @ts-ignore - Access misnamed field
      claudeData.shipmentDetails.carrierReference = claudeData.shipmentDetails.carriersReference;
      // @ts-ignore - Delete misnamed field
      delete claudeData.shipmentDetails.carriersReference;
      console.log('Fixed carrier reference field name in upload route');
    }

    // Log Claude's response for debugging
    console.log('Claude extracted data:', {
      bolNumber: claudeData.shipmentDetails.bolNumber,
      carrierReference: claudeData.shipmentDetails.carrierReference, // Fixed the field name
      consignee: claudeData.parties.consignee,
      shipper: claudeData.parties.shipper
    });

    // SECURITY CHECK: Validate the data structure is complete
    if (!claudeData || !claudeData.parties) {
      console.error('Claude response is missing critical fields:', claudeData);
      return NextResponse.json(
        { error: 'Failed to process document - missing data structure' },
        { status: 400 }
      );
    }

    // Validate Claude's response
    if (!claudeData.parties?.consignee) {
      console.error('Claude failed to extract consignee data');
      return NextResponse.json(
        { error: 'Failed to extract consignee information from the document' },
        { status: 400 }
      );
    }

    // SECURITY CHECK: Ensure consignee name is not suspiciously short
    if (!claudeData.parties.consignee.name || claudeData.parties.consignee.name.length < 3) {
      console.error('Consignee name is missing or suspiciously short:', claudeData.parties.consignee.name);
      return NextResponse.json(
        { error: 'The consignee name could not be properly extracted from the document' },
        { status: 400 }
      );
    }

    // SECURITY CHECK: Verify both shipper and consignee are present
    if (!claudeData.parties.shipper || !claudeData.parties.shipper.name) {
      console.error('Shipper information is missing, which is suspicious');
      return NextResponse.json(
        { error: 'Complete shipping information could not be extracted. Please check the document.' },
        { status: 400 }
      );
    }

    // Verify the consignee matches the selected client
    const consignee = claudeData.parties.consignee
    const verificationResult = await verifyClientMatch(consignee, documentClientId);
    
    if (!verificationResult.isMatch) {
      const errorMessage = verificationResult.matchedClient 
        ? `This BOL appears to belong to ${verificationResult.matchedClient.name}. Please check the selected client and try again.`
        : 'This BOL belongs to a different client. Please check the selected client and try again.';
        
      return NextResponse.json(
        { 
          error: errorMessage,
          details: {
            detectedClient: consignee.name,
            selectedClient: selectedClient.name,
            detectedTaxId: consignee.taxId || 'Not found',
            selectedTaxId: selectedClient.rif || 'Not found',
            potentialMatches: verificationResult.allClients
          }
        },
        { status: 400 }
      )
    }

    // Check if we already have a document with this BOL number
    const existingDoc = await Document.findOne({ 
      'bolData.bolNumber': claudeData.shipmentDetails.bolNumber,
      type: 'BOL'
    })

    // If we have an existing document, update it
    if (existingDoc) {
      console.log('Updating existing document for BOL:', claudeData.shipmentDetails.bolNumber)
      existingDoc.updatedAt = new Date()
      existingDoc.bolData = {
        ...claudeData.shipmentDetails,
        status: 'processed',
        containers: claudeData.containers,
        parties: claudeData.parties,
        commercial: claudeData.commercial
      }
      await existingDoc.save()
      
      return NextResponse.json({
        success: true,
        document: {
          _id: existingDoc._id,
          fileName: existingDoc.fileName,
          type: existingDoc.type
        }
      })
    }

    // Upload file to GridFS for new documents
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })

    const uploadStream = bucket.openUploadStream(file.name, {
      contentType: file.type,
      metadata: {
        clientId: documentClientId,
        bolNumber,
        uploadedBy: session.user?.email,
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        relatedBolId: relatedBolId
      }
    })

    await new Promise((resolve, reject) => {
      const readStream = require('stream').Readable.from(buffer)
      readStream.pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve)
    })

    // Create new document record with Claude's extracted data
    const newDocument = await Document.create({
      clientId: documentClientId,
      fileName: file.name,
      fileId: uploadStream.id,
      type: 'BOL',
      bolData: {
        ...claudeData.shipmentDetails,
        status: 'processed',
        containers: claudeData.containers,
        parties: claudeData.parties,
        commercial: claudeData.commercial
      },
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return NextResponse.json({
      success: true,
      document: {
        _id: newDocument._id,
        fileName: newDocument.fileName,
        type: newDocument.type
      }
    })

  } catch (error) {
    console.error('Error uploading document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error uploading document' },
      { status: 500 }
    )
  }
} 