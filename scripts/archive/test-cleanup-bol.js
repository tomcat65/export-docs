// Test script to diagnose and fix the issue with a specific BOL
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: './.env.local' });

// BOL number to test
const BOL_NUMBER = '650126304';
const FILE_PATH = "C:\\Users\\TOMAS\\Downloads\\MCOP0101_650126304.pdf";

async function main() {
  console.log('Starting diagnostic test for BOL:', BOL_NUMBER);
  
  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('MONGODB_URI not found in environment variables');
    process.exit(1);
  }
  
  const client = new MongoClient(uri);
  await client.connect();
  console.log('Connected to MongoDB successfully');
  
  const db = client.db();
  const docsCollection = db.collection('documents');
  const filesCollection = db.collection('documents.files');
  const chunksCollection = db.collection('documents.chunks');
  
  // 1. Check main documents collection
  console.log(`Checking for BOL documents with number ${BOL_NUMBER}...`);
  const bolDocuments = await docsCollection.find({
    'bolData.bolNumber': BOL_NUMBER,
    'type': 'BOL'
  }).toArray();
  
  console.log(`Found ${bolDocuments.length} BOL documents with number ${BOL_NUMBER}`);
  
  if (bolDocuments.length > 0) {
    console.log('Documents found:');
    bolDocuments.forEach(doc => {
      console.log(`- ID: ${doc._id}, fileName: ${doc.fileName}, fileId: ${doc.fileId}`);
      console.log(`  Created: ${doc.createdAt}, clientId: ${doc.clientId}`);
    });
    
    // Delete all these documents
    console.log('\nDeleting BOL documents...');
    for (const doc of bolDocuments) {
      // Delete related documents first
      const relatedDocs = await docsCollection.find({
        'relatedBolId': doc._id
      }).toArray();
      
      console.log(`Found ${relatedDocs.length} related documents for BOL ${doc._id}`);
      
      for (const relDoc of relatedDocs) {
        console.log(`- Deleting related document: ${relDoc._id}, type: ${relDoc.type}`);
        
        // Delete related file
        if (relDoc.fileId) {
          try {
            await filesCollection.deleteOne({ _id: new ObjectId(relDoc.fileId) });
            await chunksCollection.deleteMany({ files_id: new ObjectId(relDoc.fileId) });
            console.log(`  Deleted file ${relDoc.fileId}`);
          } catch (err) {
            console.log(`  Error deleting file: ${err.message}`);
          }
        }
        
        // Delete document
        await docsCollection.deleteOne({ _id: relDoc._id });
        console.log(`  Deleted document ${relDoc._id}`);
      }
      
      // Delete BOL file
      if (doc.fileId) {
        try {
          await filesCollection.deleteOne({ _id: new ObjectId(doc.fileId) });
          await chunksCollection.deleteMany({ files_id: new ObjectId(doc.fileId) });
          console.log(`Deleted BOL file ${doc.fileId}`);
        } catch (err) {
          console.log(`Error deleting BOL file: ${err.message}`);
        }
      }
      
      // Delete BOL document
      await docsCollection.deleteOne({ _id: doc._id });
      console.log(`Deleted BOL document ${doc._id}`);
    }
  }
  
  // 2. Check GridFS files collection
  console.log('\nChecking GridFS for files with BOL metadata...');
  const gridfsFiles = await filesCollection.find({
    'metadata.bolNumber': BOL_NUMBER
  }).toArray();
  
  console.log(`Found ${gridfsFiles.length} GridFS files with BOL number ${BOL_NUMBER}`);
  
  if (gridfsFiles.length > 0) {
    console.log('Files found:');
    gridfsFiles.forEach(file => {
      console.log(`- ID: ${file._id}, filename: ${file.filename}`);
      console.log(`  uploadDate: ${file.uploadDate}, metadata:`, file.metadata);
    });
    
    // Delete these files
    console.log('\nDeleting GridFS files...');
    for (const file of gridfsFiles) {
      try {
        await chunksCollection.deleteMany({ files_id: file._id });
        console.log(`Deleted chunks for file ${file._id}`);
        
        await filesCollection.deleteOne({ _id: file._id });
        console.log(`Deleted file metadata for ${file._id}`);
      } catch (err) {
        console.log(`Error deleting file: ${err.message}`);
      }
    }
  }
  
  // 3. Check BolData collection if it exists
  try {
    const bolDataCollection = db.collection('boldata');
    console.log('\nChecking BolData collection...');
    
    const bolDataDocs = await bolDataCollection.find({
      'bolNumber': BOL_NUMBER
    }).toArray();
    
    console.log(`Found ${bolDataDocs.length} entries in BolData collection`);
    
    if (bolDataDocs.length > 0) {
      console.log('BolData entries found:');
      bolDataDocs.forEach(doc => {
        console.log(`- ID: ${doc._id}, bolNumber: ${doc.bolNumber}`);
      });
      
      // Delete these entries
      console.log('\nDeleting BolData entries...');
      await bolDataCollection.deleteMany({ 'bolNumber': BOL_NUMBER });
      console.log(`Deleted ${bolDataDocs.length} BolData entries`);
    }
  } catch (err) {
    console.log('BolData collection not found or error:', err.message);
  }
  
  // 4. Verify all documents were removed
  console.log('\nVerifying cleanup...');
  
  const checkBolDocs = await docsCollection.find({
    'bolData.bolNumber': BOL_NUMBER,
    'type': 'BOL'
  }).toArray();
  
  const checkGridFSFiles = await filesCollection.find({
    'metadata.bolNumber': BOL_NUMBER
  }).toArray();
  
  console.log('\nVerification Results:');
  console.log(`- BOL Documents remaining: ${checkBolDocs.length}`);
  console.log(`- GridFS Files remaining: ${checkGridFSFiles.length}`);
  
  if (checkBolDocs.length === 0 && checkGridFSFiles.length === 0) {
    console.log('\nSuccess! All traces of BOL number have been removed from the database.');
    console.log('You should now be able to upload the document without any "already exists" warning.');
  } else {
    console.log('\nWarning: Some entries still remain in the database.');
    
    if (checkBolDocs.length > 0) {
      console.log('Remaining BOL documents:');
      checkBolDocs.forEach(doc => {
        console.log(`- ID: ${doc._id}, fileName: ${doc.fileName}`);
      });
    }
    
    if (checkGridFSFiles.length > 0) {
      console.log('Remaining GridFS files:');
      checkGridFSFiles.forEach(file => {
        console.log(`- ID: ${file._id}, filename: ${file.filename}`);
      });
    }
  }
  
  await client.close();
  console.log('\nTest completed.');
}

// Use ES module style function invocation
main().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
}); 