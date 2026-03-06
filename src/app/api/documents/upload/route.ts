import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document, VALID_DOCUMENT_TYPES, IDocument } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'
import { GridFSBucket } from 'mongodb'
import { processBolWithFirebase, processBolDocument } from '@/lib/firebase-client'

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
  shipper?: string; // Added shipper property to match usage
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
    totalWeight?: { // Added totalWeight property to match usage
      kg: string;
      lbs: string;
    };
  };
}

// Add type definition for Firebase function response
interface FirebaseBolResponse {
  success: boolean;
  document?: {
    bolNumber: string;
    fileName: string;
    clientId: string;
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
      totalWeight?: {
        kg: string;
        lbs: string;
      };
    };
  };
  error?: string;
  storageError?: string;
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

// Helper function to extract BOL number from filename
function extractBolNumberFromFilename(filename: string): string | null {
  // Try to find common BOL number patterns in the filename
  const patterns = [
    /(\d{9})/, // Basic 9-digit pattern
    /MDRA\d+_(\d{9})/, // MDRA pattern
    /BOL[_]?(\d{9})/, // BOL prefix pattern with underscore
    /BOL[-]?(\d{9})/, // BOL prefix pattern with hyphen
    /[_](\d{9})[_\.]/, // Surrounded by underscore or dot
    /[-](\d{9})[-\.]/ // Surrounded by hyphen or dot
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the uploaded file and relevant metadata
    const formData = await request.formData()
    const file = formData.get('file') as File
    let clientId = formData.get('clientId') as string
    const bolNumber = formData.get('bolNumber') as string
    const relatedBolId = formData.get('relatedBolId') as string
    const docType = formData.get('documentType') as string || formData.get('type') as string
    const subType = formData.get('subType') as string
    
    // Check required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!clientId && !relatedBolId) {
      return NextResponse.json({ error: 'No client selected and no related BOL provided' }, { status: 400 })
    }

    // Check file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File must be a PDF or image (JPEG, PNG)' }, { status: 400 })
    }

    // Log essential info for debugging
    console.log('==== DOCUMENT UPLOAD REQUEST ====')
    console.log(`Environment: ${process.env.NODE_ENV || 'unknown'}`)
    console.log(`File: ${file.name} (${file.type}, ${Math.round(file.size / 1024)}KB)`)
    console.log(`Client ID: ${clientId || 'not provided'}`)
    console.log(`BOL Number: ${bolNumber || 'not provided'}`)
    console.log(`Related BOL ID: ${relatedBolId || 'not provided'}`)
    console.log(`Document Type: ${docType || 'not provided'}`)
    console.log('=================================')
    
    await connectDB()

    // If this is a related document, get the client ID from the related BOL
    if (relatedBolId && !clientId) {
      const relatedBol = await Document.findById(relatedBolId);
      if (!relatedBol) {
        return NextResponse.json({ error: 'Related BOL not found' }, { status: 400 })
      }
      clientId = relatedBol.clientId.toString();
    }

    // For related documents, we don't need client verification
    if (docType !== 'BOL') {
      try {
        console.log('Uploading related document:', {
          type: docType,
          relatedBolId,
          clientId
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
            clientId: clientId,
            uploadedBy: session.user?.email,
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            documentType: docType,
            relatedBolId: relatedBolId
          }
        })

        await new Promise((resolve, reject) => {
          const readStream = require('stream').Readable.from(buffer)
          readStream.pipe(uploadStream)
            .on('error', reject)
            .on('finish', resolve)
        })

        console.log('File uploaded to GridFS, creating document record with type:', docType);
        
        // Create document record for related document
        const documentData = {
          clientId: clientId,
          fileName: file.name,
          fileId: uploadStream.id,
          type: docType,  // We'll handle type validation below
          relatedBolId: new mongoose.Types.ObjectId(relatedBolId),
          createdAt: new Date(),
          updatedAt: new Date(),
          subType: docType === 'INVOICE_EXPORT' ? 'EXPORT' : undefined
        };
        
        console.log('Document data:', JSON.stringify(documentData));
        
        // Force the type to be one of the enum values if needed
        // This is a temporary fix if the model validation is too strict
        if (!VALID_DOCUMENT_TYPES.includes(docType as any)) {
          console.warn(`Invalid document type: ${docType}, defaulting to 'BOL'`);
          documentData.type = 'BOL';
        }
        
        // Fix for INVOICE type
        if (docType === 'INVOICE') {
          // Ensure we're using a valid enum value that matches the schema
          documentData.type = 'INVOICE_EXPORT';
          // Set subType to distinguish regular invoices from export invoices
          documentData.subType = documentData.subType || 'REGULAR';
        }
        
        try {
          console.log('Creating document with final data:', JSON.stringify({
            clientId: documentData.clientId,
            type: documentData.type,
            subType: documentData.subType,
            relatedBolId: documentData.relatedBolId?.toString(),
            fileName: documentData.fileName
          }));
          
          const newDocument = await Document.create(documentData);
          console.log('Document created successfully:', newDocument._id);
          
          return NextResponse.json({
            success: true,
            document: {
              _id: newDocument._id,
              fileName: newDocument.fileName,
              type: newDocument.type
            }
          });
        } catch (error) {
          console.error('Error creating document:', error);
          // Handle mongoose validation errors more explicitly
          if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError' && 'errors' in error) {
            console.error('Validation error details:', error.errors);
            // Type assertion for mongoose validation error
            const validationError = error as { errors: Record<string, { message: string }> };
            return NextResponse.json({
              error: 'Document validation failed: ' + Object.values(validationError.errors).map(err => err.message).join(', ')
            }, { status: 400 });
          }
          throw error;
        }
      } catch (error) {
        console.error('Error in related document upload:', error);
        throw error;
      }
    }
    
    // If we reach here, this is a BOL upload
    // We'll use a different approach that leverages Firebase for processing
    
    try {
      console.log('Uploading BOL document and sending to Firebase for processing:', {
        fileName: file.name,
        clientId,
        fileSize: `${Math.round(file.size / 1024)}KB`
      });
      
      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      // First, extract a BOL number from the filename if possible
      // This will be used for initial storage before processing
      const extractedBolNumber = extractBolNumberFromFilename(file.name) || bolNumber || 'unidentified';
      
      // Upload file to GridFS first to store the original document
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
        bucketName: 'documents'
      });
      
      const uploadStream = bucket.openUploadStream(file.name, {
        contentType: file.type,
        metadata: {
          clientId: clientId,
          bolNumber: extractedBolNumber,
          uploadedBy: session.user?.email,
          uploadedAt: new Date().toISOString(),
          fileName: file.name,
          documentType: 'BOL',
          status: 'processing' // Mark as processing until Firebase completes
        }
      });
      
      await new Promise((resolve, reject) => {
        const readStream = require('stream').Readable.from(buffer)
        readStream.pipe(uploadStream)
          .on('error', reject)
          .on('finish', resolve)
      });
      
      console.log('Document uploaded to GridFS, creating initial document record');
      
      // Create initial document record in MongoDB
      const initialDocument = await Document.create({
        clientId: clientId,
        fileName: file.name,
        fileId: uploadStream.id,
        type: 'BOL',
        status: 'processing',
        bolData: {
          bolNumber: extractedBolNumber,
          status: 'processing'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('Initial document record created, sending to Firebase for processing');
      
      // Now send the document to Firebase for processing
      try {
        const result = await processBolWithFirebase({
          fileContent: buffer.toString('base64'),
          fileName: file.name,
          fileType: file.type,
          clientId: clientId
        }) as FirebaseBolResponse;
        
        console.log('Firebase function returned result:', {
          success: result.success,
          hasDocument: !!result.document,
          error: result.error || 'none'
        });
        
        // If Firebase processing succeeded, update the document record
        if (result.success && result.document) {
          const { bolNumber, shipmentDetails, parties, containers, commercial } = result.document;
          
          // Check if we already have a document with this BOL number before updating
          const existingDoc = await Document.findOne({ 
            'bolData.bolNumber': bolNumber,
            type: 'BOL'
          });
          
          // If we have an existing document, update it rather than creating a new one
          if (existingDoc) {
            console.log('Found existing document with same BOL number:', bolNumber);
            
            // Update the existing document with the new data from Firebase
            existingDoc.updatedAt = new Date();
            existingDoc.set('status', 'processed');
            
            // Create a bolData object that conforms to the schema
            existingDoc.bolData = {
              bolNumber: bolNumber,
              bookingNumber: shipmentDetails?.bookingNumber || '',
              shipper: shipmentDetails?.shipper || parties?.shipper?.name || '',
              carrierReference: shipmentDetails?.carrierReference || '',
              vessel: shipmentDetails?.vesselName || '',
              voyage: shipmentDetails?.voyageNumber || '',
              portOfLoading: shipmentDetails?.portOfLoading || '',
              portOfDischarge: shipmentDetails?.portOfDischarge || '',
              dateOfIssue: shipmentDetails?.dateOfIssue || new Date().toISOString().split('T')[0],
              totalContainers: containers?.length?.toString() || '0',
              totalWeight: commercial?.totalWeight || { kg: '0', lbs: '0' }
            };
            
            // Store additional extracted data in custom fields
            existingDoc.set('extractedData', {
              containers: containers || [],
              parties: parties || {},
              commercial: commercial || {}
            });
            
            await existingDoc.save();
            
            // Keep the initial document or we might lose documents in the UI
            // Instead of deleting, mark it as a duplicate
            await Document.findByIdAndUpdate(initialDocument._id, {
              status: 'duplicate',
              duplicateOf: existingDoc._id
            });
            
            // Return the existing document data for UI display
            return NextResponse.json({
              success: true,
              document: {
                _id: existingDoc._id,
                fileName: existingDoc.fileName,
                type: existingDoc.type,
                bolNumber,
                // Include these extra fields to help the UI display the document
                status: 'processed',
                clientId: clientId,
                bolData: existingDoc.bolData,
                // Include all extracted data to ensure UI has complete information
                extractedData: {
                  containers: containers || [],
                  parties: parties || {},
                  commercial: commercial || {}
                }
              }
            });
          }
          
          // Verify the consignee matches the selected client
          let verificationPassed = true;
          if (parties && parties.consignee) {
            const verificationResult = await verifyClientMatch(parties.consignee, clientId);
            
            if (!verificationResult.isMatch) {
              console.error('Client verification failed:', {
                detected: parties.consignee.name,
                selected: clientId,
                bolNumber
              });
              
              verificationPassed = false;
              
              // Update document status but don't fail the request
              await Document.findByIdAndUpdate(initialDocument._id, {
                status: 'verification_failed',
                verificationError: `Document appears to belong to ${parties.consignee.name}, not ${verificationResult.matchedClient?.name || 'the selected client'}`
              });
              
              return NextResponse.json({
                success: false,
                error: `This BOL appears to belong to ${parties.consignee.name}. Please check the selected client and try again.`,
                document: {
                  _id: initialDocument._id,
                  fileName: initialDocument.fileName,
                  type: initialDocument.type,
                  status: 'verification_failed'
                }
              }, { status: 400 });
            }
          }
          
          // If verification passed, update document with the extracted data
          await Document.findByIdAndUpdate(initialDocument._id, {
            status: 'processed',
            bolData: {
              bolNumber: bolNumber,
              bookingNumber: shipmentDetails?.bookingNumber || '',
              shipper: shipmentDetails?.shipper || parties?.shipper?.name || '',
              carrierReference: shipmentDetails?.carrierReference || '',
              vessel: shipmentDetails?.vesselName || '',
              voyage: shipmentDetails?.voyageNumber || '',
              portOfLoading: shipmentDetails?.portOfLoading || '',
              portOfDischarge: shipmentDetails?.portOfDischarge || '',
              dateOfIssue: shipmentDetails?.dateOfIssue || new Date().toISOString().split('T')[0],
              totalContainers: containers?.length?.toString() || '0',
              totalWeight: commercial?.totalWeight || { kg: '0', lbs: '0' }
            },
            extractedData: {
              containers: containers || [],
              parties: parties || {},
              commercial: commercial || {}
            }
          });
          
          // Return the new document data for UI display
          return NextResponse.json({
            success: true,
            document: {
              _id: initialDocument._id,
              fileName: initialDocument.fileName,
              type: initialDocument.type,
              bolNumber,
              // Include these extra fields for consistency
              status: 'processed',
              clientId: clientId,
              bolData: {
                bolNumber: bolNumber,
                bookingNumber: shipmentDetails?.bookingNumber || '',
                shipper: shipmentDetails?.shipper || parties?.shipper?.name || '',
                carrierReference: shipmentDetails?.carrierReference || '',
                vessel: shipmentDetails?.vesselName || '',
                voyage: shipmentDetails?.voyageNumber || '',
                portOfLoading: shipmentDetails?.portOfLoading || '',
                portOfDischarge: shipmentDetails?.portOfDischarge || '',
                dateOfIssue: shipmentDetails?.dateOfIssue || new Date().toISOString().split('T')[0],
                totalContainers: containers?.length?.toString() || '0',
                totalWeight: commercial?.totalWeight || { kg: '0', lbs: '0' }
              },
              // Include all extracted data to ensure UI has complete information
              extractedData: {
                containers: containers || [],
                parties: parties || {},
                commercial: commercial || {}
              }
            }
          });
        } else if (result.error) {
          // Firebase function returned an error
          console.error('Firebase processing error:', result.error);
          
          await Document.findByIdAndUpdate(initialDocument._id, {
            status: 'error',
            processingError: result.error
          });
          
          return NextResponse.json({
            success: false,
            error: `Document processing failed: ${result.error}`,
            document: {
              _id: initialDocument._id,
              fileName: initialDocument.fileName,
              type: initialDocument.type,
              status: 'error'
            }
          }, { status: 500 });
        } else {
          // No result or error from Firebase
          console.error('Firebase processing returned no result or error');
          
          await Document.findByIdAndUpdate(initialDocument._id, {
            status: 'error',
            processingError: 'No result or error returned from processing'
          });
          
          return NextResponse.json({
            success: false,
            error: 'Document processing failed: No result returned',
            document: {
              _id: initialDocument._id,
              fileName: initialDocument.fileName,
              type: initialDocument.type,
              status: 'error'
            }
          }, { status: 500 });
        }
      } catch (firebaseError) {
        // Error calling the Firebase function
        console.error('Error calling Firebase function:', firebaseError);
        
        await Document.findByIdAndUpdate(initialDocument._id, {
          status: 'error',
          processingError: firebaseError instanceof Error ? firebaseError.message : 'Unknown firebase error'
        });
        
        return NextResponse.json({
          success: false,
          error: `Error calling document processing service: ${firebaseError instanceof Error ? firebaseError.message : 'Unknown error'}`,
          document: {
            _id: initialDocument._id,
            fileName: initialDocument.fileName,
            type: initialDocument.type,
            status: 'error'
          }
        }, { status: 500 });
      }
    } catch (error) {
      console.error('Error in BOL upload process:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error processing upload:', error)
    
    // Ensure we always return a properly formatted JSON response
    return NextResponse.json({
      error: error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred during document upload'
    }, { 
      status: 500
    })
  }
} 