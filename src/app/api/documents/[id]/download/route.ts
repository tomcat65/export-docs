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

    // Get the ID from params
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
      bucketName: 'fs'
    })

    try {
      // Get the file metadata
      console.log(`Attempting to download document ID: ${id}, fileId: ${document.fileId}, from bucket: 'fs'`);
      const file = await bucket.find({ _id: new mongoose.Types.ObjectId(document.fileId) }).next()
      if (!file) {
        console.error(`File with ID ${document.fileId} not found in GridFS bucket 'fs'`);
        return new NextResponse('File not found in GridFS', { status: 404 })
      }
      console.log(`Found file in GridFS: ${file.filename}, size: ${file.length} bytes`);

      // Create a stream to read the file
      const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(document.fileId))

      // Create a new Response from the stream
      const response = new Response(downloadStream as unknown as ReadableStream)

      // Set appropriate headers
      response.headers.set('Content-Type', file.metadata?.contentType || 'application/octet-stream')
      response.headers.set('Content-Disposition', `attachment; filename="${document.fileName}"`)

      return response
    } catch (error) {
      console.error('Error streaming file:', error)
      return new NextResponse('Error streaming file', { status: 500 })
    }
  } catch (error) {
    console.error('Error downloading document:', error)
    return new NextResponse(
      'Error downloading document',
      { status: 500 }
    )
  }
} 