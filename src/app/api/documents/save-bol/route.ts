import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

/**
 * Lightweight save-only route for BOL documents.
 * Accepts pre-extracted BOL data (from client-side Firebase processing)
 * plus the original file, saves to GridFS + MongoDB.
 * No Claude/Firebase processing — should complete in < 5 seconds.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const clientId = formData.get('clientId') as string
    const extractedDataStr = formData.get('extractedData') as string

    if (!file || !clientId || !extractedDataStr) {
      return NextResponse.json(
        { error: 'Missing required fields: file, clientId, extractedData' },
        { status: 400 }
      )
    }

    let extractedData: any
    try {
      extractedData = JSON.parse(extractedDataStr)
    } catch {
      return NextResponse.json({ error: 'Invalid extractedData JSON' }, { status: 400 })
    }

    const {
      bolNumber,
      shipmentDetails,
      parties,
      containers,
      commercial,
    } = extractedData

    console.log('==== SAVE-BOL (lightweight) ====')
    console.log(`File: ${file.name} (${file.type}, ${Math.round(file.size / 1024)}KB)`)
    console.log(`Client: ${clientId}, BOL: ${bolNumber || 'unknown'}`)
    console.log('================================')

    await connectDB()

    // Check for existing document with same BOL number
    if (bolNumber) {
      const existing = await Document.findOne({
        'bolData.bolNumber': bolNumber,
        type: 'BOL',
      })
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: `A document with BOL number ${bolNumber} already exists.`,
            duplicate: true,
            existingDocument: {
              _id: existing._id,
              bolNumber,
              fileName: existing.fileName,
            },
          },
          { status: 409 }
        )
      }
    }

    // Upload file to GridFS
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents',
    })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const uploadStream = bucket.openUploadStream(file.name, {
      contentType: file.type,
      metadata: {
        clientId,
        bolNumber: bolNumber || 'unidentified',
        uploadedBy: session.user?.email,
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        documentType: 'BOL',
      },
    })

    await new Promise((resolve, reject) => {
      const { Readable } = require('stream')
      const readStream = Readable.from(buffer)
      readStream
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve)
    })

    // Create document record with pre-extracted data
    const newDocument = await Document.create({
      clientId,
      fileName: file.name,
      fileId: uploadStream.id,
      type: 'BOL',
      status: 'processed',
      bolData: {
        bolNumber: bolNumber || 'unidentified',
        bookingNumber: shipmentDetails?.bookingNumber || '',
        shipper: shipmentDetails?.shipper || parties?.shipper?.name || '',
        carrierReference: shipmentDetails?.carrierReference || '',
        vessel: shipmentDetails?.vesselName || '',
        voyage: shipmentDetails?.voyageNumber || '',
        portOfLoading: shipmentDetails?.portOfLoading || '',
        portOfDischarge: shipmentDetails?.portOfDischarge || '',
        dateOfIssue: shipmentDetails?.dateOfIssue || new Date().toISOString().split('T')[0],
        totalContainers: containers?.length?.toString() || '0',
        totalWeight: commercial?.totalWeight || { kg: '0', lbs: '0' },
      },
      extractedData: {
        containers: containers || [],
        parties: parties || {},
        commercial: commercial || {},
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    console.log(`Document saved: ${newDocument._id} (BOL: ${bolNumber})`)

    return NextResponse.json({
      success: true,
      document: {
        _id: newDocument._id,
        fileName: newDocument.fileName,
        type: newDocument.type,
        bolNumber,
        status: 'processed',
        clientId,
      },
    })
  } catch (error) {
    console.error('Error in save-bol:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save document' },
      { status: 500 }
    )
  }
}
