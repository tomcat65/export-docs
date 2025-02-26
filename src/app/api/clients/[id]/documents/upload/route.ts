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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
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

    let uploadStream: any
    let bucket: any

    try {
      // Store file in MongoDB GridFS
      const db = mongoose.connection.db
      if (!db) {
        throw new Error('Database connection not established')
      }
      
      bucket = new mongoose.mongo.GridFSBucket(db, {
        bucketName: 'documents'
      })

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
          uploadedAt: new Date()
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

      // Validate container data
      if (!Array.isArray(processedData.containers) || processedData.containers.length === 0) {
        console.error('No containers found in processed data')
        throw new Error('No container information found in document')
      }

      // Map the processed data to our document schema
      const dbDocumentData = {
        clientId: id,
        fileName: file.name,
        fileId: uploadStream.id, // Store the GridFS file ID instead of file path
        type: 'BOL' as const,
        items: processedData.containers.map((container, index) => ({
          itemNumber: index + 1,
          containerNumber: container.containerNumber,
          seal: container.sealNumber || '',
          description: container.product.description,
          quantity: {
            litros: container.quantity.volume.liters.toFixed(2),
            kg: container.quantity.weight.kg.toFixed(3)
          }
        })),
        bolData: {
          bolNumber: processedData.shipmentDetails.bolNumber,
          bookingNumber: processedData.shipmentDetails.bookingNumber || '',
          shipper: processedData.parties.shipper.name,
          vessel: processedData.shipmentDetails.vesselName || '',
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
          await bucket.delete(new mongoose.Types.ObjectId(existingDocument.fileId))
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
        } catch (deleteError) {
          console.error('Error deleting failed upload:', deleteError)
        }
      }

      return NextResponse.json(
        { 
          error: error instanceof Error ? error.message : 'Failed to save document',
          details: error instanceof Error ? error.stack : undefined
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save document' },
      { status: 500 }
    )
  }
} 