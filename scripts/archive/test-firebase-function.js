// Test script for Firebase function with Claude
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

console.log('Starting Firebase function test...');
console.log('Firebase config loaded');

// Get the file path from the command line arguments
const testDocumentPath = process.argv[2] || 'coo-sample.pdf';
console.log(`Test document: ${testDocumentPath}`);

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Test function for processing with Claude
async function testClaudeProcessing() {
  try {
    // Read the PDF file content
    const fileContent = fs.readFileSync(testDocumentPath, { encoding: 'base64' });
    
    console.log(`Read file content, size: ${fileContent.length} bytes`);
    
    // Get the functions instance
    const functions = getFunctions(app);
    
    // Get the function reference
    const processBolDocument = httpsCallable(functions, 'processBolDocument');
    
    console.log('Calling Firebase function...');
    const startTime = Date.now();
    
    // Call the function with the document
    const result = await processBolDocument({
      fileContent,
      fileName: testDocumentPath.split('/').pop(),
      fileType: 'application/pdf',
      clientId: '12345' // Test client ID
    });
    
    const endTime = Date.now();
    console.log(`Processing completed in ${(endTime - startTime) / 1000} seconds`);
    
    // Check result
    if (result.data.success) {
      console.log('Document processing successful!');
      console.log('BOL Number:', result.data.document.bolNumber);
      console.log('Shipper:', result.data.document.parties.shipper.name);
      console.log('Containers:', result.data.document.containers.length);
      
      // Print more details if needed
      console.log('\nDetailed Document Data:');
      console.log(JSON.stringify(result.data.document, null, 2));
      
      return result.data;
    } else {
      console.error('Document processing failed:', result.data.error || 'Unknown error');
      throw new Error(result.data.error || 'Processing failed');
    }
  } catch (error) {
    console.error('Error during processing:', error);
    throw error;
  }
}

// Run the test
testClaudeProcessing()
  .then(() => console.log('Test completed successfully'))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  }); 