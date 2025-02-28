import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Extract and validate the ID parameter
    const { id } = await context.params
    if (!id || id === 'undefined') {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }
    
    // Check if user is authenticated
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Connect to database
    await connectDB()
    
    // Get document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Get file from GridFS
    if (!mongoose.connection.db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }
    
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'fs'
    })

    // Convert fileId to ObjectId if it's a string
    const fileId = typeof document.fileId === 'string' 
      ? new mongoose.Types.ObjectId(document.fileId)
      : document.fileId;

    console.log(`Attempting to download document ID: ${id}, fileId: ${fileId.toString()}, from bucket: 'fs'`);
      
    // Check if file exists
    const file = await mongoose.connection.db.collection('fs.files').findOne({ _id: fileId })
    if (!file) {
      console.error(`File with ID ${fileId.toString()} not found in GridFS bucket 'fs'`);
      return NextResponse.json(
        { error: 'File not found in GridFS' },
        { status: 404 }
      )
    }
    
    console.log(`Found file in GridFS: ${file.filename}, size: ${file.length} bytes`);

    // Get file stream
    const downloadStream = bucket.openDownloadStream(fileId)
    
    // Convert stream to buffer
    const chunks: Buffer[] = []
    for await (const chunk of downloadStream) {
      chunks.push(Buffer.from(chunk))
    }
    
    const buffer = Buffer.concat(chunks)

    // Check if download parameter is present
    const url = new URL(req.url)
    const download = url.searchParams.get('download') === 'true'

    // Set headers
    const headers = new Headers()
    headers.set('Content-Type', 'application/pdf')
    
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="${document.fileName}"`)
    } else {
      headers.set('Content-Disposition', `inline; filename="${document.fileName}"`)
    }
    
    // Return file
    return new NextResponse(buffer, {
      status: 200,
      headers
    })
  } catch (error) {
    console.error('Error downloading document:', error)
    return NextResponse.json(
      { error: 'Failed to download document' },
      { status: 500 }
    )
  }
} 