// Script to clean up a specific BOL number from the database
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

// Target BOL number to clean up
const TARGET_BOL_NUMBER = '650126304';
console.log(`Starting cleanup for BOL number: ${TARGET_BOL_NUMBER}`);

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set');
  process.exit(1);
}

// Connect to MongoDB
async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    return mongoose.connection;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

// Main cleanup function
async function cleanupBolNumber() {
  let db = null;
  
  try {
    // Connect to database
    db = await connectToDatabase();
    console.log('Starting database cleanup process...');
    
    // 1. Find all documents with this BOL number
    const documents = db.collection('documents');
    const bolDocuments = await documents.find({ 
      type: 'BOL', 
      'customFields.bolNumber': TARGET_BOL_NUMBER 
    }).toArray();
    
    console.log(`Found ${bolDocuments.length} BOL documents with number ${TARGET_BOL_NUMBER}`);
    
    if (bolDocuments.length === 0) {
      console.log('No documents found to clean up.');
      return;
    }
    
    // 2. Get document IDs for deletion
    const documentIds = bolDocuments.map(doc => doc._id);
    console.log('Document IDs to delete:', documentIds);
    
    // 3. Find all related documents (COO, PL, etc.) that reference these BOL documents
    const relatedDocuments = await documents.find({
      $or: [
        { 'relatedDocuments.bolId': { $in: documentIds.map(id => id.toString()) } },
        { 'relatedDocuments.documentId': { $in: documentIds.map(id => id.toString()) } }
      ]
    }).toArray();
    
    console.log(`Found ${relatedDocuments.length} related documents`);
    
    // 4. Get all document IDs to delete (BOL + related documents)
    const allDocumentIds = [
      ...documentIds,
      ...relatedDocuments.map(doc => doc._id)
    ];
    
    // 5. Delete files from GridFS
    const bucket = new mongoose.mongo.GridFSBucket(db);
    const files = db.collection('fs.files');
    
    // Find all files related to these documents
    const relatedFiles = await files.find({
      'metadata.documentId': { $in: allDocumentIds.map(id => id.toString()) }
    }).toArray();
    
    console.log(`Found ${relatedFiles.length} related files in GridFS`);
    
    // Delete each file from GridFS
    for (const file of relatedFiles) {
      try {
        await bucket.delete(file._id);
        console.log(`Deleted file: ${file.filename} (${file._id})`);
      } catch (err) {
        console.error(`Error deleting file ${file._id}:`, err.message);
      }
    }
    
    // 6. Delete all documents
    const deleteResult = await documents.deleteMany({
      _id: { $in: allDocumentIds }
    });
    
    console.log(`Deleted ${deleteResult.deletedCount} documents from the database`);
    
    // 7. Verify cleanup
    const remainingDocs = await documents.find({ 
      'customFields.bolNumber': TARGET_BOL_NUMBER 
    }).count();
    
    if (remainingDocs === 0) {
      console.log(`✅ Cleanup successful! All documents with BOL number ${TARGET_BOL_NUMBER} have been removed.`);
    } else {
      console.log(`⚠️ Some documents may remain. Found ${remainingDocs} documents with BOL number ${TARGET_BOL_NUMBER}`);
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    // Close database connection
    if (db) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  }
}

// Run the cleanup function
cleanupBolNumber()
  .then(() => {
    console.log('Cleanup process completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Cleanup process failed:', error);
    process.exit(1);
  }); 