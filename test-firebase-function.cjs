// Test script for Firebase function with Claude document processing (CommonJS)
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration from environment
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('Starting Firebase function test...');
console.log('Firebase config loaded:', {
  hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');

// Test document - provide path to a sample PDF in your project
const testFile = path.resolve(__dirname, 'coo-sample.pdf');
console.log(`Using test file: ${testFile}`);

// Function to test the Firebase function
async function testClaudeProcessing() {
  try {
    // Load file content
    const fileContent = fs.readFileSync(testFile, { encoding: 'base64' });
    const fileName = path.basename(testFile);
    const fileType = 'application/pdf';
    const clientId = '67bd0efbbf7daebc63d0ca0a'; // Use a valid client ID from your database
    
    console.log(`File loaded: ${fileName} (${Math.round(fileContent.length / 1024)}KB)`);
    
    // Get the Firebase callable function
    const processDocument = httpsCallable(functions, 'processBolDocument', {
      timeout: 540000 // 9 minutes to match function timeout
    });
    
    console.log('Calling Firebase function with Claude integration...');
    const startTime = Date.now();
    
    // Call the function
    const result = await processDocument({
      fileContent,
      fileName,
      fileType,
      clientId
    });
    
    // Calculate processing time
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`Processing completed in ${processingTime.toFixed(1)} seconds`);
    
    // Check the result
    if (result.data.success) {
      console.log('Document successfully processed:');
      console.log('- BOL Number:', result.data.document?.bolNumber);
      console.log('- Shipper:', result.data.document?.parties?.shipper?.name);
      console.log('- Containers:', result.data.document?.containers?.length || 0);
      
      // Output the full result structure
      console.log('\nFull document structure:');
      console.log(JSON.stringify(result.data.document, null, 2));
      
      return result.data;
    } else {
      console.error('Processing failed:', result.data.error);
      throw new Error(result.data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Test failed with error:', error.message);
    console.error('Error details:', error);
    throw error;
  }
}

// Run the test
console.log('Starting document processing test...');
testClaudeProcessing()
  .then(() => {
    console.log('Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error.message);
    process.exit(1);
  }); 