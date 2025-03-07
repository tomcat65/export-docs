import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Get document ID from params
    const { id } = await params
    if (!id || id === 'undefined') {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    // Find document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // If document has no fileName, we can't repair it
    if (!document.fileName) {
      return NextResponse.json({ error: 'Document has no filename to search for' }, { status: 400 })
    }

    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json({ error: 'Database connection not established' }, { status: 500 })
    }

    // Get GridFS bucket
    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'documents'
    })

    // Check if current fileId exists
    let currentFileExists = false
    let oldFileId = document.fileId ? document.fileId.toString() : null;
    
    if (document.fileId) {
      try {
        const fileId = typeof document.fileId === 'string'
          ? new mongoose.Types.ObjectId(document.fileId)
          : document.fileId;
          
        const file = await bucket.find({ _id: fileId }).next()
        currentFileExists = !!file
        
        if (file) {
          console.log(`Current file exists: ${file.filename}, uploadDate: ${file.uploadDate}`);
        }
      } catch (error) {
        console.error('Error checking current file existence:', error)
      }
    }

    // If current file exists, no repair needed
    if (currentFileExists) {
      return NextResponse.json({ 
        success: true,
        repaired: false,
        message: 'File already exists, no repair needed'
      })
    }

    // Search for a file with the same filename
    try {
      console.log(`Searching for files with filename: ${document.fileName}`);
      
      // First try documents bucket
      const files = await bucket.find({ filename: document.fileName }).toArray()
      
      if (files.length > 0) {
        // File found with matching filename, update document's fileId
        const foundFile = files[0]
        const oldFileIdString = document.fileId ? document.fileId.toString() : 'none';
        document.fileId = foundFile._id
        await document.save()

        console.log(`Repaired document ${id}: Updated fileId from ${oldFileIdString} to ${foundFile._id}, filename: ${foundFile.filename}`);

        return NextResponse.json({
          success: true,
          repaired: true,
          message: 'Document successfully repaired',
          oldFileId: oldFileIdString,
          newFileId: foundFile._id.toString()
        })
      }

      // Try other GridFS bucket as fallback
      const fsBucket = new mongoose.mongo.GridFSBucket(db, {
        bucketName: 'fs'
      })
      
      console.log(`Searching for files in fs bucket with filename: ${document.fileName}`);
      const fsFiles = await fsBucket.find({ filename: document.fileName }).toArray()
      
      if (fsFiles.length > 0) {
        // File found in fs bucket, update document's fileId
        const foundFile = fsFiles[0]
        const oldFileIdString = document.fileId ? document.fileId.toString() : 'none';
        document.fileId = foundFile._id
        await document.save()

        console.log(`Repaired document ${id}: Updated fileId from ${oldFileIdString} to ${foundFile._id} (found in fs bucket), filename: ${foundFile.filename}`);

        return NextResponse.json({
          success: true,
          repaired: true,
          message: 'Document successfully repaired (found in fs bucket)',
          oldFileId: oldFileIdString,
          newFileId: foundFile._id.toString()
        })
      }

      // Check if a fileId was provided in the request
      const requestBody = await request.json().catch(() => ({}));
      if (requestBody.possibleFileId) {
        try {
          console.log(`Trying specific fileId from request: ${requestBody.possibleFileId}`);
          const specificFileId = new mongoose.Types.ObjectId(requestBody.possibleFileId);
          
          // Check if this file exists
          const specificFile = await bucket.find({ _id: specificFileId }).next();
          if (specificFile) {
            console.log(`Found specific file with ID ${specificFileId}, filename: ${specificFile.filename}`);
            
            // Update document with this file ID
            const oldFileIdString = document.fileId ? document.fileId.toString() : 'none';
            document.fileId = specificFileId;
            await document.save();
            
            return NextResponse.json({
              success: true,
              repaired: true,
              message: 'Document successfully repaired with specified file ID',
              oldFileId: oldFileIdString,
              newFileId: specificFileId.toString()
            });
          }
        } catch (specificError) {
          console.error('Error checking specific file ID:', specificError);
        }
      }

      // No matching file found
      return NextResponse.json({
        success: false,
        repaired: false,
        message: 'No file found with matching filename'
      })
    } catch (error) {
      console.error('Error repairing document:', error)
      return NextResponse.json({
        success: false,
        error: 'Error repairing document',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in document repair route:', error)
    return NextResponse.json({
      success: false,
      error: 'Error processing request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 