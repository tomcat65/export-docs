import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Get all documents to check against
    const allDocuments = await Document.find().select('fileId fileName').lean()
    const documentFileIds = new Set(allDocuments.map(doc => doc.fileId.toString()))

    // Get GridFS bucket
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })

    // Get all files from GridFS
    const files = await bucket.find({}).toArray()

    // Categorize files
    const categorizedFiles = files.map(file => {
      const isLinked = documentFileIds.has(file._id.toString())
      return {
        fileId: file._id,
        filename: file.filename,
        length: file.length,
        uploadDate: file.uploadDate,
        metadata: file.metadata,
        isOrphaned: !isLinked,
        linkedDocument: isLinked ? allDocuments.find(doc => 
          doc.fileId.toString() === file._id.toString()
        ) : null
      }
    })

    // Generate statistics
    const stats = {
      totalFiles: files.length,
      linkedFiles: categorizedFiles.filter(f => !f.isOrphaned).length,
      orphanedFiles: categorizedFiles.filter(f => f.isOrphaned).length,
      totalDocuments: allDocuments.length,
      documentsWithoutFiles: allDocuments.length - categorizedFiles.filter(f => !f.isOrphaned).length
    }

    return NextResponse.json({
      stats,
      files: categorizedFiles
    })
  } catch (error) {
    console.error('Error in GridFS debug route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GridFS debug check failed' },
      { status: 500 }
    )
  }
} 