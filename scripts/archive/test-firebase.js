// Test Firebase Document Processing
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('Firebase config status:', {
  hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  hasAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  hasStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  hasMessagingSenderId: !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  hasAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');

// Load test PDF
const testFile = path.resolve(__dirname, 'coo-sample.pdf');
const fileContent = fs.readFileSync(testFile, { encoding: 'base64' });
const fileName = path.basename(testFile);
const fileType = 'application/pdf';
const clientId = '67bd0efbbf7daebc63d0ca0a'; // Replace with an actual client ID from your database

// Process BOL document function
async function testProcessBolDocument() {
  try {
    console.log(`Processing test document: ${fileName}`);
    console.log(`File size: ${Math.round(fileContent.length / 1024)}KB`);
    
    // Get the callable function
    const processDocument = httpsCallable(functions, 'processBolDocument', {
      timeout: 540000 // Max timeout: 9 minutes
    });
    
    console.log('Calling Firebase function...');
    const startTime = Date.now();
    
    // Call the function with test data
    const result = await processDocument({
      fileContent,
      fileName,
      fileType,
      clientId
    });
    
    // Calculate and log processing time
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`Document processed successfully in ${processingTime.toFixed(1)} seconds`);
    
    // Log the results
    console.log('Processing result:', {
      success: result.data.success,
      bolNumber: result.data.document?.bolNumber,
      hasShipmentDetails: !!result.data.document?.shipmentDetails,
      hasParties: !!result.data.document?.parties,
      containerCount: result.data.document?.containers?.length || 0
    });
    
    return result.data;
  } catch (error) {
    console.error('Error processing document:', error.message);
    console.error('Error details:', error);
    throw error;
  }
}

// Run the test
testProcessBolDocument()
  .then(result => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 