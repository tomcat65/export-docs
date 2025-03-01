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
    
    // Convert doc._id to ObjectId explicitly with proper type checking
    if (doc._id) {
      // Ensure doc._id is a valid ObjectId
      try {
        const docId = new Types.ObjectId(doc._id.toString());
        bolNumbers.get(bolNumber)!.push(docId);
      } catch (error) {
        console.error(`Invalid ObjectId: ${doc._id}`, error);
      }
    }
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

// Clean up duplicate packing list documents
async function cleanupDuplicatePackingLists(bucket: any) {
  console.log('Starting duplicate packing list cleanup...');
  
  // Find all BOL documents
  const bolDocs = await Document.find({ type: 'BOL' }).lean();
  let deletedCount = 0;
  
  // For each BOL, check its related packing lists
  for (const bolDoc of bolDocs) {
    if (!bolDoc._id) continue;
    
    // Find all packing lists related to this BOL
    const plDocs = await Document.find({ 
      type: 'PL',
      relatedBolId: bolDoc._id 
    }).sort({ createdAt: -1 }).lean();
    
    console.log(`BOL ${bolDoc._id}: Found ${plDocs.length} related packing lists`);
    
    if (plDocs.length <= 1) continue; // Skip if no duplicates
    
    // Group by document number
    const docNumberGroups = new Map<string, any[]>();
    
    for (const plDoc of plDocs) {
      const docNumber = plDoc.packingListData?.documentNumber || 'unknown';
      if (!docNumberGroups.has(docNumber)) {
        docNumberGroups.set(docNumber, []);
      }
      docNumberGroups.get(docNumber)!.push(plDoc);
    }
    
    // For each document number, keep only the most recent
    for (const [docNumber, docs] of docNumberGroups.entries()) {
      if (docs.length <= 1) continue; // Skip if no duplicates
      
      // Sort by creation date (most recent first)
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Skip the first (most recent) and delete the rest
      for (let i = 1; i < docs.length; i++) {
        const doc = docs[i];
        try {
          // Delete file
          if (doc.fileId) {
            await bucket.delete(new Types.ObjectId(doc.fileId));
          }
          
          // Delete document
          await Document.findByIdAndDelete(doc._id);
          deletedCount++;
          console.log(`Deleted duplicate packing list: ${doc._id} with document number ${docNumber}`);
        } catch (error) {
          console.error(`Error deleting packing list ${doc._id}:`, error);
        }
      }
    }
  }
  
  console.log(`Completed duplicate packing list cleanup: ${deletedCount} documents deleted`);
  return deletedCount;
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

// Function to clean up duplicate documents by document type
async function cleanupDuplicatesByType(bucket: any, documentType: 'BOL' | 'PL' | 'COO') {
  console.log(`Starting cleanup of duplicate ${documentType} documents...`);
  
  // Find all documents of the specified type
  const documents = await Document.find({ type: documentType }).lean();
  console.log(`Found ${documents.length} ${documentType} documents`);
  
  // Group documents by their relatedBolId (for PL and COO) or by bolNumber (for BOL)
  const groupedDocs = new Map<string, any[]>();
  
  for (const doc of documents) {
    let groupKey: string;
    
    if (documentType === 'BOL' && doc.bolData?.bolNumber) {
      // Group BOL documents by BOL number
      groupKey = doc.bolData.bolNumber;
    } else if (doc.relatedBolId) {
      // Group PL and COO documents by related BOL ID and document number
      const docNumber = documentType === 'PL' 
        ? doc.packingListData?.documentNumber 
        : doc.cooData?.certificateNumber;
      
      groupKey = `${doc.relatedBolId.toString()}-${docNumber || 'unknown'}`;
    } else {
      // Skip documents without a proper grouping key
      continue;
    }
    
    if (!groupedDocs.has(groupKey)) {
      groupedDocs.set(groupKey, []);
    }
    
    groupedDocs.get(groupKey)!.push(doc);
  }
  
  let deletedCount = 0;
  
  // Process each group of documents
  for (const [groupKey, docs] of groupedDocs.entries()) {
    if (docs.length <= 1) {
      // Skip if there's only one document in the group
      continue;
    }
    
    console.log(`Found ${docs.length} duplicate ${documentType} documents for group ${groupKey}`);
    
    // Sort by creation date (newest first)
    docs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Keep the newest document, delete the rest
    for (let i = 1; i < docs.length; i++) {
      const doc = docs[i];
      
      try {
        // Delete file from GridFS
        if (doc.fileId) {
          try {
            await bucket.delete(new Types.ObjectId(doc.fileId));
            console.log(`Deleted file ${doc.fileId} from GridFS`);
          } catch (fileError) {
            console.error(`Error deleting file ${doc.fileId}:`, fileError);
          }
        }
        
        // Delete document from database
        await Document.findByIdAndDelete(doc._id);
        deletedCount++;
        console.log(`Deleted duplicate ${documentType} document: ${doc._id}`);
      } catch (error) {
        console.error(`Error deleting document ${doc._id}:`, error);
      }
    }
  }
  
  console.log(`Completed ${documentType} cleanup: ${deletedCount} documents deleted`);
  return deletedCount;
}

// Function to clean up orphaned files in GridFS
async function cleanupOrphanedFiles(bucket: any) {
  console.log('Starting cleanup of orphaned files...');
  
  // Get all document fileIds
  const documents = await Document.find().lean();
  const validFileIds = new Set(documents.map(doc => doc.fileId.toString()));
  
  console.log(`Found ${validFileIds.size} valid file IDs in documents collection`);
  
  // Get all files in the bucket
  const filesCollection = bucket.s.db.collection(`${bucket.s.options.bucketName}.files`);
  const files = await filesCollection.find({}).toArray();
  
  console.log(`Found ${files.length} files in GridFS bucket`);
  
  let deletedCount = 0;
  
  // Check each file if it's referenced by a document
  for (const file of files) {
    const fileId = file._id.toString();
    
    if (!validFileIds.has(fileId)) {
      try {
        await bucket.delete(file._id);
        deletedCount++;
        console.log(`Deleted orphaned file: ${fileId}`);
      } catch (error) {
        console.error(`Error deleting file ${fileId}:`, error);
      }
    }
  }
  
  console.log(`Completed orphaned files cleanup: ${deletedCount} files deleted`);
  return deletedCount;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    
    // Get cleanup options from request
    const options = await request.json().catch(() => ({}));
    const documentType = options.documentType as 'BOL' | 'PL' | 'COO' | undefined;
    const cleanupFiles = options.cleanupFiles !== false; // Default to true
    
    // Create GridFS bucket
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    });
    
    let results = {
      bolDeleted: 0,
      plDeleted: 0,
      cooDeleted: 0,
      filesDeleted: 0
    };
    
    // Clean up specific document type or all types
    if (!documentType || documentType === 'BOL') {
      results.bolDeleted = await cleanupDuplicatesByType(bucket, 'BOL');
    }
    
    if (!documentType || documentType === 'PL') {
      results.plDeleted = await cleanupDuplicatesByType(bucket, 'PL');
    }
    
    if (!documentType || documentType === 'COO') {
      results.cooDeleted = await cleanupDuplicatesByType(bucket, 'COO');
    }
    
    // Clean up orphaned files
    if (cleanupFiles) {
      results.filesDeleted = await cleanupOrphanedFiles(bucket);
    }
    
    // Calculate total deleted
    const totalDeleted = results.bolDeleted + results.plDeleted + results.cooDeleted + results.filesDeleted;
    
    return NextResponse.json({
      success: true,
      ...results,
      totalDeleted,
      message: `Cleanup completed: ${totalDeleted} items deleted (${results.bolDeleted} BOL, ${results.plDeleted} PL, ${results.cooDeleted} COO, ${results.filesDeleted} files)`
    });
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