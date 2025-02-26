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
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })

    try {
      // Get the file metadata
      const file = await bucket.find({ _id: new mongoose.Types.ObjectId(document.fileId) }).next()
      if (!file) {
        return new NextResponse('File not found', { status: 404 })
      }

      // Create a stream to read the file
      const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(document.fileId))

      // Create a new Response from the stream
      const response = new Response(downloadStream as unknown as ReadableStream)

      // Set appropriate headers for in-browser viewing
      response.headers.set('Content-Type', file.metadata?.contentType || 'application/pdf')
      
      // For PDFs and images, we want to display them in the browser
      if (file.metadata?.contentType?.startsWith('image/') || file.metadata?.contentType === 'application/pdf') {
        response.headers.set('Content-Disposition', 'inline')
      } else {
        // For other file types, force download
        response.headers.set('Content-Disposition', `attachment; filename="${document.fileName}"`)
      }

      return response
    } catch (error) {
      console.error('Error streaming file:', error)
      return new NextResponse('Error streaming file', { status: 500 })
    }
  } catch (error) {
    console.error('Error viewing document:', error)
    return new NextResponse(
      'Error viewing document',
      { status: 500 }
    )
  }
} 