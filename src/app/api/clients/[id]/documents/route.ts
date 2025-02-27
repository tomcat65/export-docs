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
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 })
    }

    // Connect to database
    const db = await connectDB()
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Find all documents for this client
    const documents = await Document.find({ clientId: new Types.ObjectId(id) })
      .sort({ 'bolData.bolNumber': 1, createdAt: -1 })
      .lean()

    // Serialize MongoDB documents
    const serializedDocuments = documents.map(doc => ({
      _id: doc._id.toString(),
      clientId: doc.clientId.toString(),
      fileName: doc.fileName,
      fileId: doc.fileId.toString(),
      type: doc.type,
      relatedBolId: doc.relatedBolId?.toString(),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      bolData: serializeObjectIds(doc.bolData),
      packingListData: serializeObjectIds(doc.packingListData),
      items: serializeObjectIds(doc.items)
    }))

    return NextResponse.json({ documents: serializedDocuments })
  } catch (error) {
    console.error('Error fetching client documents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch client documents' },
      { status: 500 }
    )
  }
} 