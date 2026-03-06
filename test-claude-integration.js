// Test script for Anthropic Claude integration with Firebase
// Tests if the Claude model is properly configured in Firebase functions

import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file directory (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize environment variables from .env.local file
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
console.log('Loaded environment variables from .env.local');

// Initialize Firebase with configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Log Firebase configuration (without the API key for security)
console.log('Firebase Configuration:', {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  hasApiKey: !!firebaseConfig.apiKey,
  appId: firebaseConfig.appId
});

console.log('Initializing Firebase with config...');
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');

// Test document path - update this to point to your test document
const TEST_DOC_PATH = '../.docs/past_export_docs/Keystone/booking 246977717 BoL\'s.pdf'; // Using the Keystone BoL document
const CLIENT_ID = '67bd0efbbf7daebc63d0ca0a'; // Using existing client ID

async function testClaudeIntegration() {
  try {
    console.log(`Reading test document from: ${TEST_DOC_PATH}`);
    const absolutePath = path.resolve(__dirname, TEST_DOC_PATH);
    console.log(`Absolute path: ${absolutePath}`);
    
    // Check if the file exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`Error: Test file not found at ${absolutePath}`);
      return;
    }
    
    // Read file as base64
    const fileBuffer = fs.readFileSync(absolutePath);
    const fileContent = fileBuffer.toString('base64');
    const fileName = path.basename(absolutePath);
    const fileType = 'application/pdf';
    
    console.log(`Calling Firebase function with document: ${fileName}`);
    
    // Start timer
    const startTime = Date.now();
    
    // Call the Firebase function
    const processBolDocument = httpsCallable(functions, 'processBolDocument');
    const result = await processBolDocument({
      fileContent,
      fileName,
      fileType,
      clientId: CLIENT_ID
    });
    
    // Calculate processing time
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`Document processed in ${processingTime.toFixed(2)} seconds`);
    
    // Check if the result is successful
    if (result.data) {
      console.log('Success! Document processed successfully.');
      console.log(`BOL Number: ${result.data.shipmentDetails?.bolNumber || 'Not found'}`);
      console.log(`Shipper: ${result.data.parties?.shipper?.name || 'Not found'}`);
      console.log(`Containers: ${result.data.containers?.length || 0}`);
      
      // Save full result to a file for inspection
      fs.writeFileSync(
        './claude-test-result.json', 
        JSON.stringify(result.data, null, 2)
      );
      console.log('Full result saved to claude-test-result.json');
    } else {
      console.error('Error: No data returned from Firebase function');
    }
  } catch (error) {
    console.error('Error testing Claude integration:', error);
    if (error.code) console.error(`Error code: ${error.code}`);
    if (error.message) console.error(`Error message: ${error.message}`);
    if (error.details) console.error(`Error details: ${JSON.stringify(error.details)}`);
  }
}

console.log('Starting test...');
testClaudeIntegration()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err)); 