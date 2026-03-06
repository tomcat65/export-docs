import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'
import { Readable } from 'stream'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Allowed associated document types */
const ALLOWED_TYPES = ['INVOICE_EXPORT', 'COA', 'SED'] as const

const uploadSchema = z.object({
  type: z.enum(ALLOWED_TYPES),
})

/**
 * POST /api/documents/[id]/upload-associated
 *
 * Upload an associated document (Invoice, COA, SED) and link it to a parent BOL.
 *
 * Expects multipart form data:
 *   - file: PDF file (required)
 *   - type: one of INVOICE_EXPORT | COA | SED (required)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // --- Auth ---
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // --- Params ---
    const { id: bolId } = await context.params
    if (!bolId || bolId === 'undefined') {
      return NextResponse.json({ error: 'Invalid BOL document ID' }, { status: 400 })
    }
    if (!mongoose.Types.ObjectId.isValid(bolId)) {
      return NextResponse.json({ error: 'Invalid BOL document ID format' }, { status: 400 })
    }

    // --- Parse form data ---
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rawType = formData.get('type') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate PDF only
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are accepted' },
        { status: 400 }
      )
    }

    // --- Validate type with Zod ---
    const parsed = uploadSchema.safeParse({ type: rawType })
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `Invalid document type. Must be one of: ${ALLOWED_TYPES.join(', ')}`,
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }
    const { type: docType } = parsed.data

    // --- DB connection ---
    await connectDB()

    // --- Find parent BOL ---
    const bolObjectId = new mongoose.Types.ObjectId(bolId)
    const bolDoc = await Document.findById(bolObjectId).lean()
    if (!bolDoc) {
      return NextResponse.json({ error: 'BOL document not found' }, { status: 404 })
    }
    if ((bolDoc as any).type !== 'BOL') {
      return NextResponse.json(
        { error: 'Target document is not a BOL. Upload requires a BOL document ID.' },
        { status: 400 }
      )
    }

    // Inherit clientId from parent BOL
    const clientId = (bolDoc as any).clientId

    // --- Upload file to GridFS ---
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection not established' },
        { status: 500 }
      )
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'documents',
    })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const readableStream = Readable.from(buffer)

    const uploadStream = bucket.openUploadStream(file.name, {
      metadata: {
        clientId: clientId.toString(),
        contentType: file.type,
        uploadedBy: session.user.email,
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        documentType: docType,
        relatedBolId: bolId,
      },
    })

    await new Promise<void>((resolve, reject) => {
      readableStream
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => resolve())
    })

    // --- Create Document record ---
    const newDocument = await Document.create({
      clientId,
      fileName: file.name,
      fileId: uploadStream.id,
      type: docType,
      subType: docType === 'INVOICE_EXPORT' ? 'EXPORT' : undefined,
      relatedBolId: bolObjectId,
    })

    return NextResponse.json({
      success: true,
      document: {
        _id: newDocument._id.toString(),
        clientId: newDocument.clientId.toString(),
        fileName: newDocument.fileName,
        fileId: newDocument.fileId.toString(),
        type: newDocument.type,
        relatedBolId: bolId,
        createdAt: newDocument.createdAt.toISOString(),
        updatedAt: newDocument.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error in upload-associated:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload document' },
      { status: 500 }
    )
  }
}
