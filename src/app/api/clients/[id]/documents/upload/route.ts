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
        { 'metadata.bolNumber': bolNumber }
      ]
    })
    
    const files = await cursor.toArray()
    console.log(`Found ${files.length} files to clean up`)
    
    // Sort files by uploadedAt to keep the most recent
    files.sort((a: { metadata?: { uploadedAt?: Date } }, b: { metadata?: { uploadedAt?: Date } }) => {
      const dateA = new Date(a.metadata?.uploadedAt || 0)
      const dateB = new Date(b.metadata?.uploadedAt || 0)
      return dateB.getTime() - dateA.getTime()
    })
    
    // Keep the most recent file, delete the rest
    for (let i = 1; i < files.length; i++) {
      try {
        await bucket.delete(files[i]._id)
        console.log(`Deleted duplicate file: ${files[i]._id}, uploaded at ${files[i].metadata?.uploadedAt}`)
      } catch (error) {
        console.error(`Failed to delete file ${files[i]._id}:`, error)
      }
    }
  } catch (error) {
    console.error('Error cleaning up old files:', error)
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

    const documentData = JSON.parse(documentStr) as { type: 'pdf' | 'image'; data: string }

    try {
      // Process document with Claude FIRST to verify the client match
      console.log('Processing document with Claude to verify client match')
      const processedData = await processDocumentWithClaude(documentData)
      
      if (!processedData || !processedData.shipmentDetails || !processedData.shipmentDetails.bolNumber) {
        console.error('Failed to extract required information:', processedData)
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

      // Verify client match
      const isClientMatch = verifyClientMatch(processedData.parties.consignee, client)
      if (!isClientMatch) {
        // Find all clients to see if there's a match with any other client
        const allClients = await Client.find({})
        const matchingClient = allClients.find(c => 
          c._id.toString() !== client._id.toString() && 
          verifyClientMatch(processedData.parties.consignee, c)
        )
        
        const errorMessage = matchingClient
          ? `This BOL belongs to ${matchingClient.name}, not ${client.name}. Please select the correct client.`
          : `This BOL doesn't appear to belong to ${client.name}. Please verify the selected client.`
        
        console.error(errorMessage)
        
        // Return a graceful error response instead of throwing an error
        return NextResponse.json({ 
          error: errorMessage,
          status: 'client_mismatch',
          suggestedClient: matchingClient ? {
            id: matchingClient._id.toString(),
            name: matchingClient.name
          } : null
        }, { status: 400 })
      }

      console.log('Client verification passed:', {
      clientId: client._id,
        clientName: client.name,
        bolNumber: processedData.shipmentDetails.bolNumber
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
          const { product, packaging } = extractProductAndPackaging(container.product.description);
          return {
            itemNumber: index + 1,
            containerNumber: container.containerNumber,
            seal: container.sealNumber || '',
            description: container.product.description, // Keep original description
            product, // Store extracted product
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

      if (existingDocument) {
        // If updating, delete the old file from GridFS
        if (existingDocument.fileId) {
          try {
            await bucket.delete(new mongoose.Types.ObjectId(existingDocument.fileId))
            console.log('Deleted old file:', existingDocument.fileId)
          } catch (error) {
            console.error('Error deleting old file:', error)
          }
        }
        // Update existing document
        existingDocument.set(dbDocumentData)
        await existingDocument.save()
      } else {
        // Create new document record
        existingDocument = await Document.create(dbDocumentData)
      }

      // Update client's last document date
      await Client.findByIdAndUpdate(
        id,
        { lastDocumentDate: new Date() },
        { new: true }
      )

    return NextResponse.json({
        success: true,
        documentId: existingDocument._id.toString(),
        document: {
          id: existingDocument._id,
          bolData: existingDocument.bolData,
          items: existingDocument.items
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