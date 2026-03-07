import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lightweight save-only route for BOL documents.
 * Accepts pre-extracted BOL data (from client-side Firebase processing)
 * plus the original file, saves to GridFS + MongoDB.
 * No Claude/Firebase processing — should complete in < 5 seconds.
 */
export async function POST(request: NextRequest) {
  let uploadedFileId: mongoose.Types.ObjectId | null = null

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

    // Validate file type and size
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File must be a PDF or image (JPEG, PNG)' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
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

    // Validate client exists
    const client = await Client.findById(clientId).lean()
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 400 })
    }

    // Verify consignee matches the selected client (mirrors upload route logic)
    // Reject if consignee data is missing or invalid — don't allow bypass
    if (!parties?.consignee?.name || typeof parties.consignee.name !== 'string' || parties.consignee.name.trim().length < 3) {
      console.warn('Missing or invalid consignee name in extracted data:', parties?.consignee)
      return NextResponse.json(
        {
          success: false,
          error: 'Could not verify document ownership: consignee name is missing or invalid in extracted data.',
        },
        { status: 400 }
      )
    }

    {
      const normalizedConsignee = normalizeText(parties.consignee.name)
      const normalizedClient = normalizeText((client as any).name || '')

      if (normalizedConsignee && normalizedClient) {
        let isMatch = normalizedConsignee === normalizedClient

        // Check substring match with ratio guard (same as upload route)
        if (!isMatch) {
          const hasSubstring =
            normalizedConsignee.includes(normalizedClient) ||
            normalizedClient.includes(normalizedConsignee)

          if (hasSubstring) {
            const shorterLen = Math.min(normalizedConsignee.length, normalizedClient.length)
            const longerLen = Math.max(normalizedConsignee.length, normalizedClient.length)
            // Require shorter string to be at least 50% of longer to avoid false positives
            isMatch = shorterLen >= longerLen * 0.5
          }
        }

        // Check tax ID match as fallback
        if (!isMatch && parties.consignee.taxId && (client as any).rif) {
          const normalizedTaxId = normalizeText(parties.consignee.taxId)
          const normalizedRif = normalizeText((client as any).rif)
          isMatch = normalizedTaxId === normalizedRif
        }

        if (!isMatch) {
          console.warn(`Client-consignee mismatch: consignee="${parties.consignee.name}" client="${(client as any).name}"`)
          return NextResponse.json(
            {
              success: false,
              error: `This BOL appears to belong to "${parties.consignee.name}", not "${(client as any).name}". Please check the selected client.`,
            },
            { status: 400 }
          )
        }
      }
    }

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

    // Track the uploaded file ID for cleanup on failure
    uploadedFileId = uploadStream.id

    // Create document record with pre-extracted data
    // Note: schema enum for status is ['active', 'superseded']
    const newDocument = await Document.create({
      clientId,
      fileName: file.name,
      fileId: uploadStream.id,
      type: 'BOL',
      status: 'active',
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
        status: 'active',
        clientId,
      },
    })
  } catch (error) {
    console.error('Error in save-bol:', error)

    // Clean up orphaned GridFS file if Document.create failed
    if (uploadedFileId) {
      try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
          bucketName: 'documents',
        })
        await bucket.delete(uploadedFileId)
        console.log(`Cleaned up orphaned GridFS file: ${uploadedFileId}`)
      } catch (cleanupError) {
        console.error('Failed to clean up orphaned GridFS file:', cleanupError)
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save document' },
      { status: 500 }
    )
  }
}
