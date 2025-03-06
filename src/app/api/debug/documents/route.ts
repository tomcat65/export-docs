import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // First, find the Keystone client
    const keystoneClient = await Client.findOne({ name: /keystone/i })
    if (!keystoneClient) {
      return NextResponse.json({ error: 'Keystone client not found' }, { status: 404 })
    }

    // Get all documents for Keystone
    const documents = await Document.find({ clientId: keystoneClient._id })
      .sort({ createdAt: -1 })
      .lean()

    // Get GridFS bucket
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })

    // Check each document's file in GridFS
    const results = await Promise.all(documents.map(async (doc) => {
      let fileExists = false
      let fileInfo = null

      try {
        // Try to find the file in GridFS
        const file = await bucket.find({ _id: doc.fileId }).next()
        fileExists = !!file
        if (file) {
          fileInfo = {
            filename: file.filename,
            length: file.length,
            uploadDate: file.uploadDate,
            metadata: file.metadata
          }
        }
      } catch (error) {
        console.error(`Error checking file ${doc.fileId}:`, error)
      }

      return {
        documentId: doc._id,
        fileName: doc.fileName,
        type: doc.type,
        createdAt: doc.createdAt,
        fileId: doc.fileId,
        fileExists,
        fileInfo,
        packingListData: doc.packingListData
      }
    }))

    // Get some statistics
    const stats = {
      totalDocuments: documents.length,
      documentsWithFiles: results.filter(r => r.fileExists).length,
      documentsMissingFiles: results.filter(r => !r.fileExists).length,
      byType: results.reduce((acc: any, doc) => {
        acc[doc.type] = acc[doc.type] || { total: 0, withFiles: 0, missingFiles: 0 }
        acc[doc.type].total++
        if (doc.fileExists) acc[doc.type].withFiles++
        else acc[doc.type].missingFiles++
        return acc
      }, {})
    }

    return NextResponse.json({
      client: {
        id: keystoneClient._id,
        name: keystoneClient.name
      },
      stats,
      documents: results
    })
  } catch (error) {
    console.error('Error in debug route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Debug check failed' },
      { status: 500 }
    )
  }
} 