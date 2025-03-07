import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { Document } from '@/models/Document'
import { processDocumentWithClaude } from '@/lib/claude'
import mongoose from 'mongoose'
import { Readable } from 'stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  id: string
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
function verifyClientMatch(consignee: { name: string; taxId?: string }, client: any): boolean {
  // First validate the input data
  const { isValid, errors } = validateConsigneeData(consignee);
  if (!isValid) {
    console.error('Invalid consignee data:', errors);
    return false;
  }
  
  // Normalize names for comparison
  const normalizedConsigneeName = normalizeText(consignee.name);
  const normalizedClientName = normalizeText(client.name);
  
  // Log the normalized values for debugging
  console.log('Comparing normalized names:', {
    originalConsignee: consignee.name,
    originalClient: client.name,
    normalizedConsignee: normalizedConsigneeName,
    normalizedClient: normalizedClientName,
  });
  
  // Check for empty values after normalization
  if (!normalizedConsigneeName || !normalizedClientName) {
    console.error('Empty normalized name(s):', {
      normalizedConsignee: normalizedConsigneeName,
      normalizedClient: normalizedClientName
    });
    return false;
  }
  
  // First try exact match after normalization
  if (normalizedConsigneeName === normalizedClientName) {
    console.log('Exact name match found');
    return true;
  }
  
  // Try for substring match but be cautious - partial matches are risky
  if (normalizedConsigneeName.includes(normalizedClientName) || 
      normalizedClientName.includes(normalizedConsigneeName)) {
    
    // If it's just a substring match, it needs to be substantial
    const shorterLength = Math.min(normalizedConsigneeName.length, normalizedClientName.length);
    const longerLength = Math.max(normalizedConsigneeName.length, normalizedClientName.length);
    
    // If the shorter string is less than 50% of the longer one, it's too risky
    if (shorterLength < longerLength * 0.5) {
      console.error('Substring match found but too weak:', {
        shorterLength,
        longerLength,
        ratio: shorterLength / longerLength
      });
      return false;
    }
    
    console.log('Strong substring match found');
    return true;
  }
  
  // Then try RIF/Tax ID match if available
  if (consignee.taxId && client.rif) {
    const normalizedConsigneeTaxId = normalizeText(consignee.taxId);
    const normalizedClientRif = normalizeText(client.rif);
    
    console.log('Comparing tax IDs:', {
      consigneeTaxId: normalizedConsigneeTaxId,
      clientRif: normalizedClientRif
    });
    
    if (normalizedConsigneeTaxId === normalizedClientRif) {
      console.log('Tax ID match found');
      return true;
    }
  }
  
  // Log the comparison failure details
  console.log('Client verification failed:', {
    consigneeName: normalizedConsigneeName,
    clientName: normalizedClientName,
    consigneeTaxId: consignee.taxId,
    clientRif: client.rif,
    rawConsigneeData: consignee
  });
  
  return false;
}

// Helper function to clean up old files
async function cleanupOldFiles(bucket: any, fileName: string, bolNumber?: string) {
  try {
    // Find all files with the same name or associated with the same BOL number
    const cursor = bucket.find({
      $or: [
        { filename: fileName },
        // Only include BOL number if it's provided
        ...(bolNumber ? [{ 'metadata.bolNumber': bolNumber }] : [])
      ]
    });
    
    const files = await cursor.toArray();
    
    if (files.length <= 1) {
      // No duplicates to clean up
      return;
    }
    
    console.log(`Found ${files.length} potentially duplicate files`);
    
    // Get a list of all file IDs currently referenced by documents in the database
    const db = mongoose.connection.db;
    if (!db) {
      console.error('Database connection not established, skipping file reference check');
      return;
    }
    
    const documentsCollection = db.collection('documents');
    
    // Find all documents that reference any of these files
    const fileIds = files.map((file: any) => file._id);
    const referencingDocuments = await documentsCollection.find({ 
      fileId: { $in: fileIds } 
    }).toArray();
    
    // Create a map of fileId -> documentIds that reference it
    const fileReferences = new Map();
    referencingDocuments.forEach((doc: any) => {
      const fileId = doc.fileId.toString();
      if (!fileReferences.has(fileId)) {
        fileReferences.set(fileId, []);
      }
      fileReferences.get(fileId).push(doc._id.toString());
    });
    
    console.log(`Found ${referencingDocuments.length} documents referencing these files`);
    
    // Sort files by uploadedAt to keep the most recent
    files.sort((a: { metadata?: { uploadedAt?: Date } }, b: { metadata?: { uploadedAt?: Date } }) => {
      const dateA = new Date(a.metadata?.uploadedAt || 0);
      const dateB = new Date(b.metadata?.uploadedAt || 0);
      return dateB.getTime() - dateA.getTime();
    });
    
    // Keep track of the most recent file (we'll always keep this one)
    const mostRecentFile = files[0];
    
    // For each file (except the most recent), check if it's referenced and decide whether to delete
    let deletedCount = 0;
    for (let i = 1; i < files.length; i++) {
      const fileId = files[i]._id.toString();
      const documentIds = fileReferences.get(fileId) || [];
      
      if (documentIds.length === 0) {
        // File is not referenced by any document, safe to delete
        try {
          await bucket.delete(files[i]._id);
          console.log(`Deleted unreferenced file: ${fileId}, uploaded at ${files[i].metadata?.uploadedAt}`);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete file ${fileId}:`, error);
        }
      } else {
        // File is still referenced by documents, DO NOT DELETE
        console.log(`Keeping referenced file: ${fileId}, used by ${documentIds.length} documents`);
        for (const docId of documentIds) {
          console.log(`  - Referenced by document: ${docId}`);
        }
      }
    }
    
    console.log(`Cleanup summary: kept ${files.length - deletedCount} files, deleted ${deletedCount} unreferenced files`);
  } catch (error) {
    console.error('Error cleaning up old files:', error);
  }
}

// Utility function to extract product and packaging information from description
function extractProductAndPackaging(description: string): { product: string, packaging: string } {
  if (!description) return { product: '', packaging: '' };
  
  // Remove common phrases that precede the actual product description
  const phrasesToRemove = [
    /^\d+\s+container(?:s)?\s+said\s+to\s+contain\s+/i,
    /^\d+\s+container(?:s)?\s+containing\s+/i,
    /^said\s+to\s+contain\s+/i,
    /^container(?:s)?\s+with\s+/i,
    /^container(?:s)?\s+containing\s+/i,
    /^containing\s+/i,
    /^content(?:s)?:\s+/i
  ];
  
  let cleanedDescription = description;
  
  // Apply each regex pattern to remove unwanted phrases
  phrasesToRemove.forEach(pattern => {
    cleanedDescription = cleanedDescription.replace(pattern, '');
  });
  
  // Trim any extra whitespace
  cleanedDescription = cleanedDescription.trim();
  
  // Common packaging terms to look for
  const packagingTerms = [
    'flexitank', 'flexi tank', 'flexi-tank',
    'iso tank', 'isotank', 'iso-tank',
    'drum', 'drums', 'barrel', 'barrels',
    'container', 'bulk', 'ibc', 'tote'
  ];
  
  // Default values
  let product = cleanedDescription;
  let packaging = '';
  
  // Check for packaging terms in the description
  for (const term of packagingTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(cleanedDescription)) {
      packaging = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();
      
      // Remove the packaging term from the product description
      product = cleanedDescription.replace(regex, '').trim();
      
      // Remove "in" or "in a" before the packaging term if present
      product = product.replace(/\s+in\s+a\s*$/i, '').replace(/\s+in\s*$/i, '').trim();
      break;
    }
  }
  
  // If no packaging term was found, check for common patterns
  if (!packaging) {
    // Check for "in [packaging]" pattern
    const inPackagingMatch = cleanedDescription.match(/\s+in\s+(\w+)$/i);
    if (inPackagingMatch) {
      packaging = inPackagingMatch[1];
      product = cleanedDescription.replace(/\s+in\s+\w+$/i, '').trim();
    }
  }
  
  return { product, packaging };
}

// For backward compatibility
function cleanProductDescription(description: string): string {
  const { product } = extractProductAndPackaging(description);
  return product;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  let uploadStream: any
  let bucket: any

  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Get client ID from params
    const { id } = await params

    // Find client
    const client = await Client.findById(id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const documentStr = formData.get('document') as string

    if (!file || !documentStr) {
      return NextResponse.json({ error: 'Missing file or document data' }, { status: 400 })
    }

    const documentData = JSON.parse(documentStr) as { 
      type: 'pdf' | 'image'; 
      data: string;
      overwriteExisting?: boolean;
      existingDocumentId?: string;
      forceExtract?: boolean;
    }
    
    // Check if this is a document replacement request
    const isReplacement = documentData.overwriteExisting && documentData.existingDocumentId;
    const forceExtract = documentData.forceExtract === true;
    
    // Define the type for processed data
    let processedData: {
      shipmentDetails: {
        bolNumber: string;
        bookingNumber: string;
        carrierReference?: string;
        vesselName: string;
        voyageNumber: string;
        portOfLoading: string;
        portOfDischarge: string;
        dateOfIssue: string;
        shipmentDate: string;
        totalContainers?: string;
      };
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
      containers: any[];
      commercial: {
        currency: string;
        freightTerms: string;
        itnNumber: string;
      };
    } | undefined;
    
    try {
      // If this is a replacement request, let's check if we need to bypass Claude processing
      if (isReplacement) {
        console.log(`Replacement request for document ID: ${documentData.existingDocumentId}`)
        
        try {
          // Find the existing document to get its BOL data
          const existingDocument = await Document.findById(documentData.existingDocumentId)
          
          if (!existingDocument) {
            console.error('Existing document not found for replacement:', documentData.existingDocumentId)
            return NextResponse.json(
              { error: 'Existing document not found for replacement' },
              { status: 404 }
            )
          }
          
          console.log('Found existing document for replacement:', existingDocument._id);
          console.log('Existing document bolData structure:', JSON.stringify({
            bolNumber: existingDocument.bolData?.bolNumber,
            carrierReference: existingDocument.bolData?.carrierReference,
            totalWeight: existingDocument.bolData?.totalWeight,
            hasContainers: Boolean(existingDocument.bolData?.containers?.length)
          }));
          
          // Even if we have BOL data, we should still process with Claude to get the carrier's reference
          // Continue with the normal processing flow, but save the existing document for reference
          // We'll extract the current data with Claude, then merge with existing data where needed
          
          // Make sure the DB connection is established
          if (!mongoose.connection.db) {
            await mongoose.connection.asPromise()
          }
          
          // Set up GridFS bucket with proper type safety
          const db = mongoose.connection.db
          if (!db) {
            throw new Error('Database connection not available')
          }
          
          // Use properly typed bucket
          const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'documents' })
          
          // Process with Claude first to extract all data including the carrier's reference
          console.log('Processing replacement document with Claude to extract all data')
          if (!documentData.data) {
            console.error('Document data is missing for Claude processing on replacement')
            throw new Error('Document data is required for processing')
          }
          
          let newProcessedData
          try {
            newProcessedData = await processDocumentWithClaude(documentData)
            console.log('Successfully extracted data from replacement document')
          } catch (claudeError) {
            console.error('Error extracting data from replacement document:', claudeError)
            
            // Upload the file but keep existing BOL data
            const uploadStream = bucket.openUploadStream(file.name)
            
            const arrayBuffer = await file.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            
            // Write the file data to the stream
            const writePromise = new Promise<void>((resolve, reject) => {
              uploadStream.on('finish', () => resolve())
              uploadStream.on('error', (error) => reject(error))
              
              // Write the buffer and end the stream
              uploadStream.write(buffer)
              uploadStream.end()
            })
            
            await writePromise
            console.log('File uploaded successfully for replacement, ID:', uploadStream.id)
            
            // Update the document with the new file ID
            existingDocument.fileId = uploadStream.id
            existingDocument.updatedAt = new Date()
            await existingDocument.save()
            
            return NextResponse.json({
              success: true,
              message: 'Document replaced successfully (kept existing data)',
              documentId: existingDocument._id,
              document: existingDocument
            })
          }
          
          if (newProcessedData && existingDocument.bolData) {
            // Create a clean object for totalWeight that matches the expected schema format
            let totalWeight;

            // Make sure we preserve the existing totalWeight structure if it exists
            if (existingDocument.bolData && existingDocument.bolData.totalWeight && 
                typeof existingDocument.bolData.totalWeight === 'object' &&
                existingDocument.bolData.totalWeight.kg && 
                existingDocument.bolData.totalWeight.lbs) {
              // Create a clean object to avoid any schema validation issues
              totalWeight = {
                kg: existingDocument.bolData.totalWeight.kg,
                lbs: existingDocument.bolData.totalWeight.lbs
              };
              console.log('Using existing totalWeight structure');
            } else if (newProcessedData && newProcessedData.containers && newProcessedData.containers.length > 0) {
              // Calculate totalWeight from containers if needed
              totalWeight = {
                kg: newProcessedData.containers.reduce((sum, container) => 
                  sum + container.quantity.weight.kg, 0).toFixed(3),
                lbs: newProcessedData.containers.reduce((sum, container) => 
                  sum + container.quantity.weight.lbs, 0).toFixed(2)
              };
              console.log('Calculated new totalWeight from containers');
            } else {
              // Default fallback
              totalWeight = {
                kg: "0.000",
                lbs: "0.00"
              };
              console.log('Using default totalWeight values');
            }

            console.log('Using properly structured totalWeight:', totalWeight);
            
            // Upload the file
            const uploadStream = bucket.openUploadStream(file.name)
            
            const arrayBuffer = await file.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            
            // Write the file data to the stream
            const writePromise = new Promise<void>((resolve, reject) => {
              uploadStream.on('finish', () => resolve())
              uploadStream.on('error', (error) => reject(error))
              
              // Write the buffer and end the stream
              uploadStream.write(buffer)
              uploadStream.end()
            })
            
            await writePromise
            console.log('File uploaded successfully for replacement, ID:', uploadStream.id)
            
            // Log the carrier reference from the newly extracted data
            console.log('Extracted carrier reference from replacement document:', {
              carrierReference: newProcessedData.shipmentDetails.carrierReference,
              existingCarrierReference: existingDocument.bolData.carrierReference
            })
            
            // Merge the new processed data with existing data, prioritizing the new data
            const updatedBolData = {
              ...existingDocument.bolData,
              // Prioritize newly extracted data for these fields
              carrierReference: newProcessedData.shipmentDetails.carrierReference || existingDocument.bolData.carrierReference,
              bookingNumber: newProcessedData.shipmentDetails.bookingNumber || existingDocument.bolData.bookingNumber,
              vessel: newProcessedData.shipmentDetails.vesselName || existingDocument.bolData.vessel,
              voyage: newProcessedData.shipmentDetails.voyageNumber || existingDocument.bolData.voyage,
              // Use the clean totalWeight object
              totalWeight: totalWeight
            }
            
            console.log('Updated BOL data with newly extracted carrier reference:', updatedBolData.carrierReference)
            console.log('Preserved totalWeight structure:', updatedBolData.totalWeight)
            
            // Make sure carrier reference is explicitly set on the document
            existingDocument.bolData = updatedBolData;
            existingDocument.markModified('bolData'); // Explicitly mark the field as modified
            
            // Update the document with the new file ID
            existingDocument.fileId = uploadStream.id
            existingDocument.updatedAt = new Date()
            
            try {
              await existingDocument.save()
              
              // Do a double-check to validate the carrier reference field
              const verifyDoc = await Document.findById(existingDocument._id) as any;
              console.log('Verification check - carrier reference value:', 
                verifyDoc?.bolData?.carrierReference || 'NOT FOUND');
              
              return NextResponse.json({
                success: true,
                message: 'Document replaced successfully with updated data',
                documentId: existingDocument._id,
                document: existingDocument
              })
            } catch (saveError) {
              console.error('Error saving updated document:', saveError)
              
              // If there's a validation error, let's try a simpler approach
              // Just update the file ID and carrier reference directly
              try {
                console.log('Attempting direct update with findByIdAndUpdate...');
                console.log('Setting carrier reference to:', newProcessedData.shipmentDetails.carrierReference);
                
                // Use a direct update to set just the carrier reference field
                // This avoids schema validation issues
                const updatedDoc = await Document.findByIdAndUpdate(
                  existingDocument._id,
                  { 
                    $set: { 
                      fileId: uploadStream.id,
                      updatedAt: new Date(),
                      'bolData.carrierReference': newProcessedData.shipmentDetails.carrierReference 
                    } 
                  },
                  { new: true }
                );
                
                // Verify the update was successful
                console.log('Direct update result - carrier reference:', 
                  updatedDoc?.bolData?.carrierReference || 'NOT FOUND');
                
                return NextResponse.json({
                  success: true,
                  message: 'Document replaced and carrier reference updated',
                  documentId: existingDocument._id,
                  document: updatedDoc
                });
              } catch (finalError) {
                console.error('Final attempt to update document failed:', finalError)
                throw finalError
              }
            }
          }
        } catch (error) {
          console.error('Error during document replacement:', error)
          // Continue with normal processing if we can't replace directly
        }
      }

      // Process document with Claude FIRST to verify the client match
      console.log('Processing document with Claude to verify client match')
      
      try {
        // If document data is missing, we can't process with Claude
        if (!documentData.data) {
          console.error('Document data is missing for Claude processing')
          throw new Error('Document data is required for processing')
        }
        
        console.log('Sending document to Claude for processing, file name:', file.name);
        processedData = await processDocumentWithClaude(documentData)
        
        // Log critical fields for debugging
        console.log('Claude extraction results:');
        console.log('  - BOL Number:', processedData.shipmentDetails.bolNumber || 'NOT FOUND');
        console.log('  - Carrier Reference:', processedData.shipmentDetails.carrierReference || 'NOT FOUND');
        console.log('  - Document Type:', file.name.includes('PL') ? 'Likely Packing List' : 'Likely BOL');
        console.log('  - Shipper:', processedData.parties?.shipper?.name || 'NOT FOUND');
        console.log('  - Consignee:', processedData.parties?.consignee?.name || 'NOT FOUND');
        console.log('  - Container Count:', processedData.containers?.length || 0);
      } catch (error) {
        console.error('Error in processDocumentWithClaude:', error)
        
        // If this is a replacement, we could bypass Claude processing and just upload the file
        if (isReplacement) {
          console.log('Bypassing Claude processing for replacement document')
          return NextResponse.json(
            { error: 'Failed to process replacement document. Please try again.' },
            { status: 500 }
          )
        } else {
          throw error
        }
      }
      
      if (!processedData || !processedData.shipmentDetails || !processedData.shipmentDetails.bolNumber) {
        console.error('Failed to extract required information:', JSON.stringify(processedData || {}, null, 2))
        throw new Error('Failed to extract required information from document')
      }

      // CRITICAL: Verify that the consignee matches the selected client
      if (!processedData.parties?.consignee) {
        console.error('No consignee data found in the document')
        return NextResponse.json(
          { error: 'Failed to extract consignee information from the document' },
          { status: 400 }
        )
      }

      // Log the extracted data for debugging
      console.log('Extracted consignee data:', {
        name: processedData.parties.consignee.name,
        taxId: processedData.parties.consignee.taxId,
        address: processedData.parties.consignee.address
      })
      console.log('Selected client:', {
        name: client.name,
        rif: client.rif
      })

      // Validate that the consignee information matches this client
      const validation = validateConsigneeData(processedData.parties.consignee)
      console.log('Consignee validation:', {
        consignee: processedData.parties.consignee,
        errors: validation.errors,
        isValid: validation.isValid
      })

      // Verify client match
      const isClientMatch = processedData && verifyClientMatch(processedData.parties.consignee, client)
      if (!isClientMatch) {
        // Find other clients with the same consignee name
        const allClients = await Client.find({})
        
        // Check if the consignee better matches a different client
        const matchingClient = allClients.find(c => 
          c._id.toString() !== client._id.toString() && 
          processedData && verifyClientMatch(processedData.parties.consignee, c)
        )
        
        const errorMessage = matchingClient
          ? `This document appears to belong to ${matchingClient.name} instead of ${client.name}. Please select the correct client.`
          : 'The client in the document does not match the selected client.'
        
        console.error(errorMessage)
        return NextResponse.json(
          { 
            error: errorMessage,
            status: 'client_mismatch',
            suggestedClient: matchingClient ? {
              id: matchingClient._id.toString(),
              name: matchingClient.name,
              rif: matchingClient.rif
            } : null
          },
          { status: 400 }
        )
      }
      
      // Log successful document processing
      console.log('Successfully processed document:', {
        bolNumber: processedData.shipmentDetails.bolNumber,
        containerCount: processedData.containers.length,
        carrierReference: processedData.shipmentDetails.carrierReference || 'Not found'
      })

      // If verification passed, proceed with storing the document
      // Store file in MongoDB GridFS
      const db = mongoose.connection.db
      if (!db) {
        throw new Error('Database connection not established')
      }
      
      bucket = new mongoose.mongo.GridFSBucket(db, {
        bucketName: 'documents'
      })

      // Clean up any existing files with the same name before uploading
      await cleanupOldFiles(bucket, file.name)

      // Create a buffer from the file
      const buffer = Buffer.from(await file.arrayBuffer())
      
      // Create a readable stream from the buffer
      const readableStream = Readable.from(buffer)

      // Upload to GridFS
      uploadStream = bucket.openUploadStream(file.name, {
        metadata: {
          clientId: id,
          contentType: file.type,
          uploadedBy: session.user.email,
          uploadedAt: new Date(),
          fileName: file.name
        }
      })

      // Wait for the upload to complete
      await new Promise((resolve, reject) => {
        readableStream
          .pipe(uploadStream)
          .on('error', reject)
          .on('finish', resolve)
      })

      // Clean up any existing files with the same BOL number
      await cleanupOldFiles(bucket, file.name, processedData.shipmentDetails.bolNumber)

      // Validate container data
      if (!Array.isArray(processedData.containers) || processedData.containers.length === 0) {
        console.error('No containers found in processed data')
        throw new Error('No container information found in document')
      }

      // Map the processed data to our document schema
      const dbDocumentData = {
        clientId: id,
        fileName: file.name,
        fileId: uploadStream.id,
        type: 'BOL' as const,
        items: processedData.containers.map((container, index) => {
          // Use product.name from Claude's response for the product
          // and extract packaging from product.description 
          const productName = container.product.name || ''; // Get product name directly
          const { product: descriptionProduct, packaging } = extractProductAndPackaging(container.product.description);
          
          // Log the fields for debugging
          console.log(`Container ${index+1} mapping:`, {
            claudeProductName: container.product.name,
            claudeProductDescription: container.product.description,
            extractedProduct: productName || descriptionProduct,
            extractedPackaging: packaging
          });
          
          return {
            itemNumber: index + 1,
            containerNumber: container.containerNumber,
            seal: container.sealNumber || '',
            description: container.product.description, // Keep original description
            product: productName || descriptionProduct, // Prefer the name field, fallback to extracted
            packaging, // Store extracted packaging
            quantity: {
              litros: container.quantity.volume.liters.toFixed(2),
              kg: container.quantity.weight.kg.toFixed(3)
            }
          };
        }),
        bolData: {
          bolNumber: processedData.shipmentDetails.bolNumber,
          bookingNumber: processedData.shipmentDetails.bookingNumber || '',
          shipper: processedData.parties.shipper.name,
          carrierReference: processedData.shipmentDetails.carrierReference || '',
          vessel: processedData.shipmentDetails.vesselName || '',
          voyage: processedData.shipmentDetails.voyageNumber || '',
          portOfLoading: processedData.shipmentDetails.portOfLoading,
          portOfDischarge: processedData.shipmentDetails.portOfDischarge,
          dateOfIssue: processedData.shipmentDetails.dateOfIssue || '',
          totalContainers: processedData.containers.length.toString(),
          totalWeight: {
            kg: processedData.containers.reduce((sum, container) => 
              sum + container.quantity.weight.kg, 0).toFixed(3),
            lbs: processedData.containers.reduce((sum, container) => 
              sum + container.quantity.weight.lbs, 0).toFixed(2)
          }
        }
      }

      // Check if document with same BOL number exists
      let existingDocument = await Document.findOne({
        clientId: id,
        'bolData.bolNumber': processedData.shipmentDetails.bolNumber
      })

      if (existingDocument && !documentData.overwriteExisting) {
        // Return a warning that the BOL already exists
        console.log('BOL already exists:', processedData.shipmentDetails.bolNumber);
        return NextResponse.json({
          warning: true,
          message: `A Bill of Lading with number ${processedData.shipmentDetails.bolNumber} has already been uploaded for this client.`,
          existingDocumentId: existingDocument._id.toString(),
          duplicate: true,
          document: {
            id: existingDocument._id,
            bolData: existingDocument.bolData,
            items: existingDocument.items
          }
        }, { status: 200 });
      }

      // If overwriteExisting is true and document exists, update the existing document
      if (existingDocument && documentData.overwriteExisting) {
        console.log('Overwriting existing document:', existingDocument._id);
        
        // If updating, delete the old file from GridFS
        if (existingDocument.fileId) {
          try {
            await bucket.delete(new mongoose.Types.ObjectId(existingDocument.fileId))
            console.log('Deleted old file:', existingDocument.fileId)
          } catch (error) {
            console.error('Error deleting old file:', error)
          }
        }
        
        // Update existing document with new file ID and data
        existingDocument.fileId = uploadStream.id;
        existingDocument.set(dbDocumentData);
        await existingDocument.save();

    return NextResponse.json({
          success: true,
          documentId: existingDocument._id.toString(),
          document: {
            id: existingDocument._id,
            bolData: existingDocument.bolData,
            items: existingDocument.items
          }
        });
      }

      // Create new document record
      const newDocument = await Document.create(dbDocumentData);

      // Update client's last document date
      await Client.findByIdAndUpdate(
        id,
        { lastDocumentDate: new Date() },
        { new: true }
      )

      return NextResponse.json({
        success: true,
        documentId: newDocument._id.toString(),
        document: {
          id: newDocument._id,
          bolData: newDocument.bolData,
          items: newDocument.items
        }
      })
    } catch (error) {
      console.error('Error processing document:', error)
      
      // Delete the uploaded file from GridFS if it exists
      if (uploadStream?.id) {
        try {
          await bucket.delete(uploadStream.id)
          console.log('Deleted failed upload:', uploadStream.id)
        } catch (deleteError) {
          console.error('Error deleting failed upload:', deleteError)
        }
      }

      throw error
    }
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save document' },
      { status: 500 }
    )
  }
} 