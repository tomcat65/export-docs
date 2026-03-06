import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Document } from '@/models/Document';
import mongoose from 'mongoose';

/**
 * API endpoint to clean up duplicate BOL records in the database
 * This is an admin-only endpoint that helps resolve issues with duplicate BOL numbers
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication - admin only
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    console.log('Starting database cleanup for duplicate BOL records');
    
    // Get all BOL documents
    const bolDocs = await Document.find({ type: 'BOL' }).lean();
    console.log(`Found ${bolDocs.length} BOL documents in database`);
    
    // Group by BOL number to find duplicates
    const bolNumbers = new Map<string, mongoose.Types.ObjectId[]>();
    
    for (const doc of bolDocs) {
      if (!doc.bolData?.bolNumber) continue;
      
      const bolNumber = doc.bolData.bolNumber;
      if (!bolNumbers.has(bolNumber)) {
        bolNumbers.set(bolNumber, []);
      }
      
      // Add document ID to the list for this BOL number
      if (doc._id) {
        try {
          const docId = new mongoose.Types.ObjectId(doc._id.toString());
          bolNumbers.get(bolNumber)!.push(docId);
        } catch (error) {
          console.error(`Invalid ObjectId: ${doc._id}`, error);
        }
      }
    }
    
    // Process duplicates
    let deletedCount = 0;
    
    // Get GridFS bucket for file deletion
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    const documentsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'documents' });
    
    // For each BOL number with duplicates
    for (const [bolNumber, docIds] of bolNumbers.entries()) {
      if (docIds.length <= 1) continue; // Skip if no duplicates
      
      console.log(`Found ${docIds.length} documents with BOL number ${bolNumber}`);
      
      // Get full documents with creation date
      const docs = await Document.find({ _id: { $in: docIds } })
        .sort({ createdAt: -1 }) // Most recent first
        .lean();
      
      // Skip the first (most recent) and delete the rest
      for (let i = 1; i < docs.length; i++) {
        const doc = docs[i];
        try {
          console.log(`Deleting duplicate BOL document: ${doc._id} with BOL number ${bolNumber}`);
          
          // Delete file from GridFS if it exists
          if (doc.fileId) {
            try {
              const fileId = typeof doc.fileId === 'string' 
                ? new mongoose.Types.ObjectId(doc.fileId)
                : doc.fileId;
                
              await documentsBucket.delete(fileId);
              console.log(`Deleted file ${fileId} from GridFS`);
            } catch (fileError) {
              console.error(`Error deleting file ${doc.fileId}:`, fileError);
            }
          }
          
          // Delete any related documents (COO, PL)
          const relatedDocs = await Document.find({ relatedBolId: doc._id });
          console.log(`Found ${relatedDocs.length} related documents to delete`);
          
          for (const relatedDoc of relatedDocs) {
            try {
              if (relatedDoc.fileId) {
                const relatedFileId = typeof relatedDoc.fileId === 'string'
                  ? new mongoose.Types.ObjectId(relatedDoc.fileId)
                  : relatedDoc.fileId;
                  
                try {
                  await documentsBucket.delete(relatedFileId);
                  console.log(`Deleted related file ${relatedFileId} from GridFS`);
                } catch (fileError) {
                  console.error(`Error deleting related file ${relatedDoc.fileId}:`, fileError);
                }
              }
              
              await Document.findByIdAndDelete(relatedDoc._id);
              console.log(`Deleted related document ${relatedDoc._id}`);
            } catch (relatedError) {
              console.error(`Error deleting related document ${relatedDoc._id}:`, relatedError);
            }
          }
          
          // Delete document from database
          await Document.findByIdAndDelete(doc._id);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting document ${doc._id}:`, error);
        }
      }
    }
    
    // Return results
    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Successfully cleaned up ${deletedCount} duplicate BOL documents`
    });
  } catch (error) {
    console.error('Error during database cleanup:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error during database cleanup' },
      { status: 500 }
    );
  }
} 