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

      // Process document with Claude
      const processedData = await processDocumentWithClaude(documentData)
      
      if (!processedData || !processedData.shipmentDetails || !processedData.shipmentDetails.bolNumber) {
        console.error('Failed to extract required information:', processedData)
        throw new Error('Failed to extract required information from document')
      }

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