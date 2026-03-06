// BOL Diagnostic Script
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mongoose from 'mongoose';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

// File path - change this to the BOL document you want to test
const FILE_PATH = "C:/Users/TOMAS/Downloads/MCOP0101_650126304.pdf";
console.log(`Starting diagnostics for file: ${FILE_PATH}`);

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not set');
  process.exit(1);
}

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

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

// Function to check if a BOL number exists in the database
async function checkBolExists(db, bolNumber) {
  if (!bolNumber) {
    console.log('No BOL number provided to check');
    return { exists: false };
  }

  console.log(`Checking if BOL with number "${bolNumber}" exists in database...`);
  
  try {
    // Check using customFields.bolNumber
    const bolByCustomField = await db.collection('documents').findOne({
      'customFields.bolNumber': bolNumber,
      type: 'BOL'
    });
    
    if (bolByCustomField) {
      console.log(`Found BOL document by customFields.bolNumber: ${bolByCustomField._id}`);
      return { exists: true, document: bolByCustomField, method: 'customFields.bolNumber' };
    }
    
    // Check using bolData.bolNumber
    const bolByBolData = await db.collection('documents').findOne({
      'bolData.bolNumber': bolNumber,
      type: 'BOL'
    });
    
    if (bolByBolData) {
      console.log(`Found BOL document by bolData.bolNumber: ${bolByBolData._id}`);
      return { exists: true, document: bolByBolData, method: 'bolData.bolNumber' };
    }
    
    // Check in other possible locations
    const alternativeCheck = await db.collection('documents').findOne({
      $or: [
        { bolNumber },
        { 'document.bolNumber': bolNumber },
        { 'document.shipmentDetails.bolNumber': bolNumber }
      ]
    });
    
    if (alternativeCheck) {
      console.log(`Found BOL document by alternative field: ${alternativeCheck._id}`);
      return { exists: true, document: alternativeCheck, method: 'alternative' };
    }
    
    // Do a text search as last resort
    console.log('Performing full text search for BOL number...');
    const textSearchResults = await db.collection('documents').find({
      $where: `function() {
        return JSON.stringify(this).indexOf("${bolNumber}") !== -1;
      }`
    }).toArray();
    
    if (textSearchResults.length > 0) {
      console.log(`Found ${textSearchResults.length} documents containing the BOL number as text`);
      return { 
        exists: true, 
        documents: textSearchResults,
        method: 'textSearch' 
      };
    }
    
    console.log(`No documents found with BOL number "${bolNumber}"`);
    return { exists: false };
    
  } catch (error) {
    console.error('Error checking if BOL exists:', error);
    return { exists: false, error };
  }
}

// Process file with Firebase function
async function processWithFirebase(filePath) {
  try {
    console.log('Reading file content...');
    const fileContent = fs.readFileSync(filePath, { encoding: 'base64' });
    const fileName = filePath.split('/').pop();
    
    console.log(`File read successfully, size: ${Math.round(fileContent.length / 1024)}KB`);
    
    // Get the functions instance
    const functions = getFunctions(app);
    
    // Get the Cloud Function
    const processBolDocument = httpsCallable(functions, 'processBolDocument', {
      timeout: 540000 // 9 minutes
    });
    
    console.log('Calling Firebase function to process BOL document...');
    console.time('Processing time');
    
    // Call the Cloud Function
    const result = await processBolDocument({
      fileContent,
      fileName,
      fileType: 'application/pdf',
      clientId: '12345' // Test client ID
    });
    
    console.timeEnd('Processing time');
    
    if (result.data.success) {
      console.log('Document processing successful!');
      console.log('Extracted BOL Number:', result.data.document.bolNumber);
      console.log('Extracted data:', JSON.stringify(result.data.document, null, 2));
      return result.data.document;
    } else {
      console.error('Document processing failed:', result.data.error || 'Unknown error');
      throw new Error(result.data.error || 'Processing failed');
    }
  } catch (error) {
    console.error('Error during Firebase processing:', error);
    throw error;
  }
}

// Run the diagnostic process
async function runDiagnostics() {
  let db = null;
  
  try {
    // Verify file exists
    if (!fs.existsSync(FILE_PATH)) {
      console.error(`File does not exist at path: ${FILE_PATH}`);
      process.exit(1);
    }
    
    console.log('1. Processing document with Firebase function...');
    const processedData = await processWithFirebase(FILE_PATH);
    
    // Extract the BOL number from the processed data
    const extractedBolNumber = processedData.bolNumber;
    console.log(`\n2. Extracted BOL number: "${extractedBolNumber}"`);
    
    if (!extractedBolNumber) {
      console.warn('No BOL number was extracted from the document');
    }
    
    // Connect to database
    console.log('\n3. Checking database for this BOL number...');
    db = await connectToDatabase();
    
    // Check if BOL exists in database
    const bolCheck = await checkBolExists(db, extractedBolNumber);
    
    console.log('\n4. DIAGNOSTIC SUMMARY:');
    console.log('-------------------');
    console.log(`File: ${FILE_PATH}`);
    console.log(`Extracted BOL Number: ${extractedBolNumber || 'None'}`);
    console.log(`BOL exists in database: ${bolCheck.exists ? 'YES' : 'NO'}`);
    
    if (bolCheck.exists) {
      console.log(`Found via: ${bolCheck.method}`);
      if (bolCheck.method === 'textSearch') {
        console.log(`Found in ${bolCheck.documents.length} documents`);
      }
      else if (bolCheck.document) {
        console.log(`Document ID: ${bolCheck.document._id}`);
        console.log(`Document type: ${bolCheck.document.type}`);
        console.log(`File name: ${bolCheck.document.fileName || 'Not available'}`);
        console.log(`Creation date: ${bolCheck.document.createdAt}`);
      }
    }
    
    // Save processed data to file for reference
    fs.writeFileSync('processed-data.json', JSON.stringify(processedData, null, 2));
    console.log('\nProcessed data saved to processed-data.json for reference');
    
  } catch (error) {
    console.error('Diagnostic process failed:', error);
  } finally {
    // Close database connection
    if (db) {
      await mongoose.disconnect();
      console.log('\nDisconnected from MongoDB');
    }
  }
}

// Run diagnostics
runDiagnostics()
  .then(() => {
    console.log('\nDiagnostics completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error during diagnostics:', error);
    process.exit(1);
  }); 