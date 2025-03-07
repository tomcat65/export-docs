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
      return NextResponse.json({ exists: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Get document ID from params
    const { id } = await params
    if (!id || id === 'undefined') {
      return NextResponse.json({ exists: false, error: 'Invalid document ID' }, { status: 400 })
    }

    // Find document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ exists: false, error: 'Document not found' }, { status: 404 })
    }

    // If document has no fileId, the file doesn't exist
    if (!document.fileId) {
      console.log(`Document ${id} has no fileId`);
      return NextResponse.json({ exists: false, reason: 'No file ID in document record' })
    }

    // Get file from GridFS
    const db = mongoose.connection.db
    if (!db) {
      console.error('Database connection not established');
      return NextResponse.json({ exists: false, error: 'Database connection not established' }, { status: 500 })
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'documents'
    })

    try {
      // Convert fileId to ObjectId if it's a string
      const fileId = typeof document.fileId === 'string' 
        ? new mongoose.Types.ObjectId(document.fileId)
        : document.fileId;
      
      console.log(`Checking if file with ID ${fileId} exists for document ${id} with filename ${document.fileName || 'unknown'}`);
        
      // Check if file exists in GridFS
      const file = await bucket.find({ _id: fileId }).next()
      
      if (file) {
        console.log(`File exists: ${file.filename}, uploadDate: ${file.uploadDate}`);
        return NextResponse.json({ 
          exists: true,
          fileId: fileId.toString(),
          fileName: document.fileName
        });
      } else {
        console.log(`File with ID ${fileId} not found in GridFS bucket 'documents'`);
        
        // Try to check if a file with the same filename exists but with a different ID
        let possibleFileId = null;
        
        if (document.fileName) {
          // First check documents bucket
          const filesByName = await bucket.find({ filename: document.fileName }).toArray();
          if (filesByName.length > 0) {
            console.log(`Found ${filesByName.length} files with filename ${document.fileName} in documents bucket. First file ID: ${filesByName[0]._id}`);
            possibleFileId = filesByName[0]._id.toString();
          } else {
            console.log(`No files found with filename ${document.fileName} in documents bucket`);
            
            // Try the fs bucket as a fallback
            try {
              const fsBucket = new mongoose.mongo.GridFSBucket(db, {
                bucketName: 'fs'
              });
              
              const fsFilesByName = await fsBucket.find({ filename: document.fileName }).toArray();
              if (fsFilesByName.length > 0) {
                console.log(`Found ${fsFilesByName.length} files with filename ${document.fileName} in fs bucket. First file ID: ${fsFilesByName[0]._id}`);
                possibleFileId = fsFilesByName[0]._id.toString();
              } else {
                console.log(`No files found with filename ${document.fileName} in fs bucket`);
              }
            } catch (fsError) {
              console.error('Error checking fs bucket:', fsError);
            }
          }
        }
        
        // Return existence status with possible file ID if found
        return NextResponse.json({ 
          exists: false,
          reason: 'File not found in GridFS',
          fileId: fileId.toString(),
          fileName: document.fileName,
          possibleFileId
        });
      }
    } catch (error) {
      console.error('Error checking file existence:', error)
      return NextResponse.json({ 
        exists: false, 
        error: 'Error checking file existence',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in document exists route:', error)
    return NextResponse.json({ 
      exists: false, 
      error: 'Error processing request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 