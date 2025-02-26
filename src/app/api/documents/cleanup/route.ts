import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function cleanupDuplicates(bucket: any) {
  const stats = {
    processed: 0,
    deleted: 0,
    errors: 0
  }

  try {
    // Get all documents from MongoDB
    const documents = await Document.find().lean()
    const processedFiles = new Set()

    // Group documents by BOL number
    const groupedByBol = documents.reduce((acc, doc) => {
      const bolNumber = doc.bolData?.bolNumber
      if (bolNumber) {
        if (!acc[bolNumber]) acc[bolNumber] = []
        acc[bolNumber].push(doc)
      }
      return acc
    }, {} as Record<string, any[]>)

    // Process each group
    for (const [bolNumber, docs] of Object.entries(groupedByBol)) {
      stats.processed++
      
      // Sort by creation date, newest first
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      
      // Keep the newest, delete the rest
      for (let i = 1; i < docs.length; i++) {
        const doc = docs[i]
        if (!processedFiles.has(doc.fileId.toString())) {
          try {
            await bucket.delete(new mongoose.Types.ObjectId(doc.fileId))
            await Document.findByIdAndDelete(doc._id)
            processedFiles.add(doc.fileId.toString())
            stats.deleted++
            console.log(`Deleted duplicate document: ${doc._id} with BOL ${bolNumber}`)
          } catch (error) {
            console.error(`Error deleting document ${doc._id}:`, error)
            stats.errors++
          }
        }
      }
    }

    // Find orphaned files in GridFS
    const cursor = bucket.find()
    const files = await cursor.toArray()
    
    for (const file of files) {
      const doc = await Document.findOne({ fileId: file._id })
      if (!doc && !processedFiles.has(file._id.toString())) {
        try {
          await bucket.delete(file._id)
          stats.deleted++
          console.log(`Deleted orphaned file: ${file._id}`)
        } catch (error) {
          console.error(`Error deleting orphaned file ${file._id}:`, error)
          stats.errors++
        }
      }
    }

    return stats
  } catch (error) {
    console.error('Error in cleanup process:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not established')
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'documents'
    })

    const stats = await cleanupDuplicates(bucket)

    return NextResponse.json({
      success: true,
      stats
    })
  } catch (error) {
    console.error('Error in cleanup endpoint:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cleanup documents' },
      { status: 500 }
    )
  }
} 