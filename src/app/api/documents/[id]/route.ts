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

    // Get GridFS buckets for file deletions
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    const documentsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'documents' })
    const fsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'fs' })

    // Function to delete a document and its file
    const deleteDocumentAndFile = async (docId: mongoose.Types.ObjectId, fileId: mongoose.Types.ObjectId) => {
      try {
        // Try to delete from documents bucket first
        try {
          await documentsBucket.delete(fileId)
          console.log(`Deleted file ${fileId} from 'documents' bucket`)
        } catch (error) {
          console.log(`File ${fileId} not found in 'documents' bucket, trying 'fs' bucket`)
          
          // If that fails, try the fs bucket
          try {
            await fsBucket.delete(fileId)
            console.log(`Deleted file ${fileId} from 'fs' bucket`)
          } catch (fsError) {
            console.error(`Error deleting file ${fileId} from both buckets:`, fsError)
            // Continue with document deletion even if file deletion fails
          }
        }
      } catch (error) {
        console.error(`Error during file deletion process for ${fileId}:`, error)
      }

      // Delete document from database
      await Document.findByIdAndDelete(docId)
      console.log(`Deleted document ${docId} from database`)
    }

    // If this is a BOL document, find and delete all related documents (COO, PL)
    if (document.type === 'BOL') {
      // Find all documents that reference this BOL
      const relatedDocs = await Document.find({ relatedBolId: document._id })
      console.log(`Found ${relatedDocs.length} related documents to delete`)

      // Delete each related document and its file
      for (const relatedDoc of relatedDocs) {
        const relatedFileId = typeof relatedDoc.fileId === 'string' 
          ? new mongoose.Types.ObjectId(relatedDoc.fileId)
          : relatedDoc.fileId
          
        await deleteDocumentAndFile(relatedDoc._id, relatedFileId)
      }
    }

    // Delete the original document and its file
    const fileId = typeof document.fileId === 'string' 
      ? new mongoose.Types.ObjectId(document.fileId)
      : document.fileId
    
    await deleteDocumentAndFile(document._id, fileId)

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

    return NextResponse.json({ 
      success: true,
      message: document.type === 'BOL' ? 'BOL and all related documents deleted successfully' : 'Document deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    )
  }
} 