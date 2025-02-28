import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose, { Types } from 'mongoose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Helper function to clean up documents with duplicate BOL numbers
async function cleanupDuplicates(bucket: any) {
  // Group by BOL number
  const bolDocs = await Document.find({ type: 'BOL' }).lean()
  const bolNumbers = new Map<string, Types.ObjectId[]>()

  // Collect BOL documents with same BOL number
  for (const doc of bolDocs) {
    if (!doc.bolData?.bolNumber) continue
    
    const bolNumber = doc.bolData.bolNumber
    if (!bolNumbers.has(bolNumber)) {
      bolNumbers.set(bolNumber, [])
    }
    bolNumbers.get(bolNumber)!.push(doc._id)
  }

  let deletedCount = 0

  // For each BOL number with duplicates, keep only the most recent
  for (const [bolNumber, docIds] of bolNumbers.entries()) {
    if (docIds.length <= 1) continue // Skip if no duplicates
    
    // Get full documents with creation date
    const docs = await Document.find({ _id: { $in: docIds } })
      .sort({ createdAt: -1 }) // Most recent first
      .lean()
    
    // Skip the first (most recent) and delete the rest
    for (let i = 1; i < docs.length; i++) {
      const doc = docs[i]
      try {
        // Delete file
        if (doc.fileId) {
          await bucket.delete(new Types.ObjectId(doc.fileId))
        }
        
        // Delete document 
        await Document.findByIdAndDelete(doc._id)
        deletedCount++
        console.log(`Deleted duplicate document: ${doc._id} with BOL ${bolNumber}`)
      } catch (error) {
        console.error(`Error deleting document ${doc._id}:`, error)
      }
    }
  }

  return deletedCount
}

// Clean up orphaned documents (COO, PL) that reference BOLs that no longer exist
async function cleanupOrphans(bucket: any) {
  console.log('Starting orphaned document cleanup...')
  
  // Find all documents that have a relatedBolId
  const relatedDocs = await Document.find({ 
    relatedBolId: { $exists: true, $ne: null },
    type: { $in: ['COO', 'PL'] }
  }).lean()

  console.log(`Found ${relatedDocs.length} COO/PL documents with relatedBolId`)
  let orphanCount = 0

  // Check each document if its related BOL exists
  for (const doc of relatedDocs) {
    try {
      if (!doc.relatedBolId) {
        console.log(`Document ${doc._id} has no relatedBolId - skipping`);
        continue;
      }
      
      // Use toString to ensure consistent comparison
      const relatedBolIdStr = doc.relatedBolId.toString();
      console.log(`Checking document ${doc._id}, type: ${doc.type}, relatedBolId: ${relatedBolIdStr}`)
      
      // Query using the string ID
      const bolDoc = await Document.findOne({ 
        _id: relatedBolIdStr, 
        type: 'BOL' 
      });
      
      // If BOL doesn't exist, delete this document
      if (!bolDoc) {
        console.log(`Related BOL ${relatedBolIdStr} not found - document is orphaned`)
        
        // Delete file from GridFS
        if (doc.fileId) {
          try {
            const fileIdStr = doc.fileId.toString();
            await bucket.delete(new mongoose.Types.ObjectId(fileIdStr));
            console.log(`Deleted orphaned file ${fileIdStr} from GridFS`);
          } catch (error) {
            // File might not exist, just log and continue
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Error deleting file ${doc.fileId}, it may not exist: ${errorMessage}`);
          }
        }
        
        // Delete document from MongoDB
        const deleteResult = await Document.findByIdAndDelete(doc._id);
        orphanCount++;
        console.log(`Deleted orphaned ${doc.type} document: ${doc._id}, delete result:`, deleteResult ? "Success" : "Not found");
      } else {
        console.log(`Document ${doc._id} has valid BOL reference - keeping`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error checking/deleting orphaned document ${doc._id}: ${errorMessage}`);
    }
  }

  console.log(`Completed orphan cleanup: ${orphanCount} documents deleted`);
  return orphanCount;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Check if we should only clean COO documents (from the request)
    let cleanupCooOnly = false;
    try {
      const requestData = await request.json();
      cleanupCooOnly = !!requestData.cleanupCooOnly;
    } catch (error) {
      // If JSON parsing fails, assume default behavior
      console.warn('Failed to parse request body:', error);
    }
    
    // Create GridFS buckets for both possible locations
    const documentsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    });
    
    const fsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'fs'
    });
    
    let duplicatesDeleted = 0;
    let orphansDeleted = 0;
    let cooDeleted = 0;
    
    // Clean only COO documents if requested
    if (cleanupCooOnly) {
      cooDeleted = await cleanupCooDuplicates(fsBucket);
      
      return NextResponse.json({
        success: true,
        cooDeleted,
        message: `COO cleanup completed: ${cooDeleted} COO documents deleted`
      });
    } else {
      // Regular cleanup
      duplicatesDeleted = await cleanupDuplicates(documentsBucket);
      orphansDeleted = await cleanupOrphans(documentsBucket); 
      
      // Also clean up documents in 'fs' bucket
      try {
        await cleanupOrphans(fsBucket);
      } catch (error) {
        console.error('Error cleaning up fs bucket:', error);
      }
      
      return NextResponse.json({
        success: true,
        duplicatesDeleted,
        orphansDeleted,
        message: `Cleanup completed: ${duplicatesDeleted} duplicates and ${orphansDeleted} orphaned documents deleted`
      });
    }
  } catch (error) {
    console.error('Error cleaning up documents:', error)
    return NextResponse.json(
      { error: 'Failed to clean up documents' },
      { status: 500 }
    )
  }
}

// Clean up all COO documents for a fresh start
async function cleanupCooDuplicates(bucket: any) {
  console.log('Starting COO document cleanup...');
  
  // Find all COO documents
  const cooDocs = await Document.find({ type: 'COO' }).lean();
  console.log(`Found ${cooDocs.length} COO documents to clean up`);
  
  let deletedCount = 0;
  
  // Delete each COO document and its file
  for (const doc of cooDocs) {
    try {
      // Delete file from GridFS if it exists
      if (doc.fileId) {
        try {
          const fileIdStr = doc.fileId.toString();
          console.log(`Attempting to delete COO file ${fileIdStr} from GridFS`);
          const objectId = new mongoose.Types.ObjectId(fileIdStr);
          await bucket.delete(objectId);
          console.log(`Deleted COO file ${fileIdStr} from GridFS`);
        } catch (error) {
          // File might not exist, just log and continue
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`Error deleting file ${doc.fileId}, it may not exist: ${errorMessage}`);
        }
      }
      
      // Delete document from MongoDB
      await Document.findByIdAndDelete(doc._id);
      deletedCount++;
      console.log(`Deleted COO document: ${doc._id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error deleting COO document ${doc._id}: ${errorMessage}`);
    }
  }
  
  console.log(`Completed COO cleanup: ${deletedCount} documents deleted`);
  return deletedCount;
} 