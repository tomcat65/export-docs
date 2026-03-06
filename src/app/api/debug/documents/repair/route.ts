import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

/**
 * Debug API endpoint to diagnose and repair document retrieval issues
 * This will check for issues with documents and attempt to fix them
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the URL to get client ID parameter
    const url = new URL(request.url)
    const clientId = url.searchParams.get('clientId')
    const repair = url.searchParams.get('repair') === 'true'

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    await connectDB()

    // Find the client
    const client = await Client.findById(clientId)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get all documents for this client
    const query = { clientId: new mongoose.Types.ObjectId(clientId) }
    console.log('Finding documents with query:', JSON.stringify(query))
    
    const documents = await Document.find(query)
      .sort({ createdAt: -1 })
      .lean()

    console.log(`Found ${documents.length} documents for client ${client.name}`)

    // Get GridFS buckets
    const documentsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })
    
    const fsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'fs'
    })

    // Check each document's file in GridFS
    const diagnostics = await Promise.all(documents.map(async (doc) => {
      let fileFound = false
      let fileInfo = null
      let bucketUsed = null
      let errorMessage = null

      try {
        // Try to find the file in 'documents' bucket first
        let file = await mongoose.connection.db!
          .collection('documents.files')
          .findOne({ _id: doc.fileId })

        if (file) {
          fileFound = true
          bucketUsed = 'documents'
          fileInfo = {
            filename: file.filename,
            length: file.length,
            uploadDate: file.uploadDate,
            metadata: file.metadata
          }
        } else {
          // Try 'fs' bucket if not found in 'documents'
          file = await mongoose.connection.db!
            .collection('fs.files')
            .findOne({ _id: doc.fileId })
            
          if (file) {
            fileFound = true
            bucketUsed = 'fs'
            fileInfo = {
              filename: file.filename,
              length: file.length,
              uploadDate: file.uploadDate,
              metadata: file.metadata
            }
          }
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Error checking file ${doc.fileId}:`, error)
      }

      return {
        documentId: doc._id.toString(),
        fileName: doc.fileName,
        type: doc.type,
        createdAt: doc.createdAt,
        fileId: doc.fileId.toString(),
        fileFound,
        bucketUsed,
        fileInfo,
        error: errorMessage,
        bolData: doc.bolData
      }
    }))

    // Check for issues
    const issuesFound = diagnostics.some(doc => !doc.fileFound)

    // Get some statistics
    const stats = {
      totalDocuments: documents.length,
      documentsWithFiles: diagnostics.filter(r => r.fileFound).length,
      documentsMissingFiles: diagnostics.filter(r => !r.fileFound).length,
      byType: diagnostics.reduce((acc: any, doc) => {
        acc[doc.type] = acc[doc.type] || { total: 0, withFiles: 0, missingFiles: 0 }
        acc[doc.type].total++
        if (doc.fileFound) acc[doc.type].withFiles++
        else acc[doc.type].missingFiles++
        return acc
      }, {})
    }

    // Return detailed diagnostics
    return NextResponse.json({
      client: {
        id: client._id.toString(),
        name: client.name
      },
      stats,
      issuesFound,
      documents: diagnostics
    })
  } catch (error) {
    console.error('Error in document repair route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Repair check failed' },
      { status: 500 }
    )
  }
} 