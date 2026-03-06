import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Types } from 'mongoose'

// Helper function to recursively convert ObjectIds to strings
function serializeObjectIds(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Types.ObjectId) {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeObjectIds(item));
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = serializeObjectIds(obj[key]);
      }
    }
    return result;
  }

  return obj;
}

/**
 * GET /api/documents/[id]/documents
 *
 * Returns all documents in a BOL's "folder":
 * - The BOL document itself (identified by [id])
 * - All documents with relatedBolId === [id]
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract and validate the ID parameter
    const { id } = await context.params
    if (!id || id === 'undefined') {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    // Validate ObjectId format
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid document ID format' }, { status: 400 })
    }

    // Connect to database
    const db = await connectDB()
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    const bolObjectId = new Types.ObjectId(id)

    // Find the BOL document itself
    const bolDoc = await Document.findById(bolObjectId).lean()
    if (!bolDoc) {
      return NextResponse.json({ error: 'BOL document not found' }, { status: 404 })
    }

    // Verify it's a BOL document
    if ((bolDoc as any).type !== 'BOL') {
      return NextResponse.json(
        { error: 'Document is not a BOL. Folder view requires a BOL document ID.' },
        { status: 400 }
      )
    }

    // Find all related documents (COO, PL, Invoice, COA, SED, etc.)
    // Exclude superseded documents — only show latest active version per type
    const relatedDocs = await Document.find({
      relatedBolId: bolObjectId,
      status: { $ne: 'superseded' },
    })
      .sort({ type: 1, createdAt: -1 })
      .lean()

    // Combine BOL + related docs
    const allDocs = [bolDoc, ...relatedDocs]

    // Serialize MongoDB documents
    const serializedDocuments = allDocs.map((doc: any) => ({
      _id: doc._id.toString(),
      clientId: doc.clientId.toString(),
      fileName: doc.fileName,
      fileId: doc.fileId.toString(),
      type: doc.type,
      subType: doc.subType,
      relatedBolId: doc.relatedBolId?.toString(),
      status: doc.status ?? 'active',
      supersededBy: doc.supersededBy?.toString() ?? null,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
      bolData: serializeObjectIds(doc.bolData),
      packingListData: serializeObjectIds(doc.packingListData),
      cooData: serializeObjectIds(doc.cooData),
      items: serializeObjectIds(doc.items),
    }))

    return NextResponse.json({ documents: serializedDocuments })
  } catch (error) {
    console.error('Error fetching BOL folder documents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch BOL folder documents' },
      { status: 500 }
    )
  }
}
