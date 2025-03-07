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
    if (!id || id === 'undefined') {
      return new NextResponse('Invalid document ID', { status: 400 })
    }

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
      // Convert fileId to ObjectId if it's a string
      const fileId = typeof document.fileId === 'string' 
        ? new mongoose.Types.ObjectId(document.fileId)
        : document.fileId;
      
      console.log(`Attempting to view document ${id} with fileId ${fileId} and filename ${document.fileName || 'unknown'}`);
        
      const file = await bucket.find({ _id: fileId }).next()
      if (!file) {
        console.log(`File not found: fileId ${fileId} for document ${id}`);
        
        // Check if a file with the same name exists with a different ID
        let possibleFileId = null;
        if (document.fileName) {
          const filesByName = await bucket.find({ filename: document.fileName }).toArray();
          if (filesByName.length > 0) {
            possibleFileId = filesByName[0]._id;
            console.log(`Found potential file match: ${possibleFileId} with filename ${document.fileName}`);
          }
        }
        
        return NextResponse.json({
          error: 'File not found',
          message: 'The document record exists but the associated file cannot be found.',
          helpText: 'You may use the repair endpoint to fix the document record if a file with the same name exists.',
          documentId: id,
          fileId: fileId.toString(),
          fileName: document.fileName,
          possibleFileId: possibleFileId ? possibleFileId.toString() : null
        }, { status: 404 });
      }

      const downloadStream = bucket.openDownloadStream(fileId)

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