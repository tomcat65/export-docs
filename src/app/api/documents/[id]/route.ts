import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Find document
    const document = await Document.findById(params.id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete file from GridFS
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
        bucketName: 'documents'
      })
      await bucket.delete(new mongoose.Types.ObjectId(document.fileId))
    } catch (error) {
      console.error('Error deleting file from GridFS:', error)
      // Continue with document deletion even if file deletion fails
    }

    // Delete document from database
    await Document.findByIdAndDelete(params.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
} 