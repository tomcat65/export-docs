// Special fix script for MCOP0101_650126304.pdf document
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mongoose from 'mongoose';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

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

// Target problematic BOL number and document
const INCORRECT_BOL_NUMBER = 'HLCUSHA2307ADRIA';
const FILENAME = 'MCOP0101_650126304.pdf';
const CORRECT_BOL_NUMBER = '650126304'; // Using the number from the filename

async function fixProblem() {
  let db = null;
  
  try {
    // Connect to database
    db = await connectToDatabase();
    console.log('Starting database fix process...');
    
    // 1. Find all documents matching the incorrect BOL number
    const documents = db.collection('documents');
    
    console.log(`Searching for documents with incorrect BOL number "${INCORRECT_BOL_NUMBER}"...`);
    
    const bolDocuments = await documents.find({
      $or: [
        { 'customFields.bolNumber': INCORRECT_BOL_NUMBER },
        { 'bolData.bolNumber': INCORRECT_BOL_NUMBER },
        { bolNumber: INCORRECT_BOL_NUMBER },
        { 'document.bolNumber': INCORRECT_BOL_NUMBER },
        { 'document.shipmentDetails.bolNumber': INCORRECT_BOL_NUMBER },
        { fileName: FILENAME }
      ]
    }).toArray();
    
    console.log(`Found ${bolDocuments.length} document(s) with incorrect BOL number`);
    
    // 2. Process each document
    let deleteDocuments = [];
    
    for (const doc of bolDocuments) {
      console.log(`Processing document ${doc._id} (${doc.fileName || 'No filename'})`);
      
      if (doc.fileName === FILENAME) {
        console.log(`Found exact filename match: ${doc.fileName}`);
      }
      
      // Mark for deletion
      deleteDocuments.push(doc._id);
    }
    
    // Also check for any documents with the correct BOL number (which might conflict)
    const existingCorrectDocs = await documents.find({ 
      'customFields.bolNumber': CORRECT_BOL_NUMBER 
    }).toArray();
    
    if (existingCorrectDocs.length > 0) {
      console.log(`WARNING: Found ${existingCorrectDocs.length} documents with the correct BOL number "${CORRECT_BOL_NUMBER}"`);
      for (const doc of existingCorrectDocs) {
        console.log(`Also marking for deletion: ${doc._id} (${doc.fileName || 'No filename'})`);
        deleteDocuments.push(doc._id);
      }
    }
    
    // 3. Delete files from GridFS
    if (deleteDocuments.length > 0) {
      const bucket = new mongoose.mongo.GridFSBucket(db);
      const files = db.collection('fs.files');
      
      // Find all files related to these documents
      const relatedFiles = await files.find({
        $or: [
          { 'metadata.documentId': { $in: deleteDocuments.map(id => id.toString()) } },
          { filename: { $regex: '650126304' } }, // Also look for filename
          { filename: { $regex: 'HLCUSHA2307ADRIA' } } // Also look for incorrect BOL in filename
        ]
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
      
      // 4. Delete documents
      const deleteResult = await documents.deleteMany({
        _id: { $in: deleteDocuments }
      });
      
      console.log(`Deleted ${deleteResult.deletedCount} documents from the database`);
      
      // 5. Final check - verify if any document with this BOL number still exists
      const finalCheck = await documents.find({
        $or: [
          { 'customFields.bolNumber': INCORRECT_BOL_NUMBER },
          { 'bolData.bolNumber': INCORRECT_BOL_NUMBER },
          { fileName: FILENAME }
        ]
      }).count();
      
      if (finalCheck === 0) {
        console.log(`✅ Fix successful! All documents with BOL number "${INCORRECT_BOL_NUMBER}" have been removed.`);
      } else {
        console.log(`⚠️ Some documents may remain. Found ${finalCheck} documents with BOL number "${INCORRECT_BOL_NUMBER}"`);
      }
      
      // 6. Also check if any reference to the incorrect BOL remains in the database
      const textSearch = await documents.find({
        $where: `function() {
          return JSON.stringify(this).indexOf("${INCORRECT_BOL_NUMBER}") !== -1;
        }`
      }).toArray();
      
      if (textSearch.length > 0) {
        console.log(`⚠️ Found ${textSearch.length} documents containing the incorrect BOL number as text`);
        console.log('Document IDs:', textSearch.map(doc => doc._id));
      }
    } else {
      console.log('No documents found to clean up.');
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
fixProblem()
  .then(() => {
    console.log('Fix process completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fix process failed:', error);
    process.exit(1);
  }); 