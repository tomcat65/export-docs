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
    
    // Convert fileId to ObjectId if it's a string
    const fileId = typeof document.fileId === 'string' 
      ? new mongoose.Types.ObjectId(document.fileId)
      : document.fileId;

    console.log(`Attempting to download document ID: ${id}, fileId: ${fileId.toString()}`);
    
    let file = null;
    let downloadStream = null;
    let bucketUsed = '';
      
    // First try to get the file from the 'documents' bucket (newer documents)
    try {
      const documentsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'documents'
      });
      
      file = await mongoose.connection.db.collection('documents.files').findOne({ _id: fileId });
      
      if (file) {
        console.log(`Found file in GridFS 'documents' bucket: ${file.filename}, size: ${file.length} bytes`);
        downloadStream = documentsBucket.openDownloadStream(fileId);
        bucketUsed = 'documents';
      }
    } catch (error) {
      console.log(`File not found in 'documents' bucket, will try 'fs' bucket next`);
    }
    
    // If not found in 'documents', try the 'fs' bucket (older documents)
    if (!file) {
      try {
        const fsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'fs'
        });
        
        file = await mongoose.connection.db.collection('fs.files').findOne({ _id: fileId });
        
        if (file) {
          console.log(`Found file in GridFS 'fs' bucket: ${file.filename}, size: ${file.length} bytes`);
          downloadStream = fsBucket.openDownloadStream(fileId);
          bucketUsed = 'fs';
        }
      } catch (error) {
        console.error(`File with ID ${fileId.toString()} not found in any GridFS bucket`);
      }
    }
    
    // If file still not found, return 404
    if (!file || !downloadStream) {
      return NextResponse.json(
        { error: 'File not found in GridFS' },
        { status: 404 }
      );
    }
    
    // Convert stream to buffer
    const chunks: Buffer[] = []
    for await (const chunk of downloadStream) {
      chunks.push(Buffer.from(chunk))
    }
    
    const buffer = Buffer.concat(chunks)
    console.log(`Successfully retrieved file from '${bucketUsed}' bucket, size: ${buffer.length} bytes`);

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