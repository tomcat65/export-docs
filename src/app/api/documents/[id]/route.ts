import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Get document ID from params
    const { id } = await params

    // Find document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete file from GridFS
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
        bucketName: 'documents'
      })
      
      // Convert fileId to ObjectId if it's a string
      const fileId = typeof document.fileId === 'string' 
        ? new mongoose.Types.ObjectId(document.fileId)
        : document.fileId;
        
      await bucket.delete(fileId)
    } catch (error) {
      console.error('Error deleting file from GridFS:', error)
      // Continue with document deletion even if file deletion fails
    }

    // Delete document from database
    await Document.findByIdAndDelete(id)

    // Update client's lastDocumentDate
    const clientId = document.clientId
    const remainingDocs = await Document.find({ clientId })
      .sort({ createdAt: -1 })
      .limit(1)
      .lean()

    // Update the client's lastDocumentDate based on remaining documents
    await Client.findByIdAndUpdate(
      clientId,
      {
        lastDocumentDate: remainingDocs.length > 0 
          ? remainingDocs[0].createdAt.toISOString()
          : null
      },
      { new: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
} 