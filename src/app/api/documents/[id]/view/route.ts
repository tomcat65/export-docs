import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    await connectDB()

    // Get document ID from params
    const { id } = await params

    // Find document
    const document = await Document.findById(id)
    if (!document) {
      return new NextResponse('Document not found', { status: 404 })
    }

    // Get file from GridFS
    const db = mongoose.connection.db
    if (!db) {
      return new NextResponse('Database connection not established', { status: 500 })
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'documents'
    })

    try {
      const file = await bucket.find({ _id: new mongoose.Types.ObjectId(document.fileId) }).next()
      if (!file) {
        return new NextResponse('File not found', { status: 404 })
      }

      const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(document.fileId))

      return new Response(downloadStream as unknown as ReadableStream, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Cache-Control': 'no-cache'
        }
      })
    } catch (error) {
      console.error('Error streaming file:', error)
      return new NextResponse('Error streaming file', { status: 500 })
    }
  } catch (error) {
    console.error('Error in document view route:', error)
    return new NextResponse(
      'Error processing request',
      { status: 500 }
    )
  }
} 