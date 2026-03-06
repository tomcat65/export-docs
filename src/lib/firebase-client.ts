/**
 * Firebase Function Client
 * 
 * This module provides a client for calling Firebase functions,
 * specifically for document processing with Claude.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Log Firebase config status (without exposing values)
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
const functions = getFunctions(app, 'us-central1'); // Use us-central1 region to match deployed functions
const auth = getAuth(app);

// Track auth state
let currentUser = null;
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    console.log('Firebase auth state changed:', { isSignedIn: !!user });
  });
}

// Use emulator in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_NODE_ENV === 'development';
const shouldUseEmulator = isDevelopment && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

// Log connection mode for debugging
console.log('Firebase connection mode:', {
  isDevelopment,
  shouldUseEmulator,
  usingEmulator: shouldUseEmulator ? 'Yes - local emulator' : 'No - production Firebase',
  projectId: firebaseConfig.projectId,
  functionUrl: `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`
});

if (shouldUseEmulator && typeof window !== 'undefined') {
  try {
    // Use the emulator for functions
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log('Connected to Firebase Functions emulator on localhost:5001');
  } catch (error) {
    console.error('Failed to connect to Firebase emulator:', error);
    console.log('Falling back to production Firebase Functions');
  }
} else {
  console.log('Using production Firebase Functions at:', `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`);
}

// Function to get current auth state
export const getCurrentUser = () => {
  return auth.currentUser;
};

// Define interfaces for the Firebase function response
interface FirebaseFunctionResult {
  success: boolean;
  document?: BolDocument;
  error?: string;
}

interface BolDocument {
  bolNumber?: string;
  shipmentDetails?: {
    bolNumber?: string;
    // Other shipment details fields
    [key: string]: any;
  };
  parties?: {
    shipper?: {
      name?: string;
      // Other shipper details
      [key: string]: any;
    };
    // Other parties
    [key: string]: any;
  };
  containers?: any[];
  // Other fields
  [key: string]: any;
}

// Known problematic BOL numbers that should be handled specially
const PROBLEMATIC_BOL_NUMBERS = [
  'HLCUSHA2307ADRIA' // This is known to be extracted incorrectly by Claude
];

/**
 * Process a BOL document using Firebase Cloud Function
 * @param document File content and metadata
 * @returns Processed document data
 */
export const processBolWithFirebase = async ({
  fileContent,
  fileName,
  fileType,
  clientId,
}: {
  fileContent: string;
  fileName: string;
  fileType: string;
  clientId: string;
}): Promise<BolDocument> => {
  // Max retry attempts
  const MAX_RETRIES = 2;
  let lastError: any = null;
  
  // Add detailed logging at the start
  console.log(`Starting Firebase function processing for file: ${fileName}`);
  console.log(`File size: ${Math.round(fileContent.length / 1024)} KB`);
  console.log(`File type: ${fileType}`);
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Processing document with Firebase (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
      
      // Initialize app if not already initialized
      if (!getApps().length) {
        initializeApp(firebaseConfig);
      }

      // Get the function reference
      const functions = getFunctions();
      const processBolDocument = httpsCallable<any, FirebaseFunctionResult>(functions, 'processBolDocument', {
        timeout: 540000, // 9 minutes to match function timeout
      });

      // Log function call attempt with timestamp
      const startTime = Date.now();
      console.log(`Calling Firebase function at ${new Date().toISOString()}...`);
      
      // Call the function
      const result = await processBolDocument({
        fileContent,
        fileName,
        fileType,
        clientId,
      });
      
      // Calculate and log processing time
      const processingTime = (Date.now() - startTime) / 1000;
      console.log(`Firebase function completed in ${processingTime.toFixed(2)} seconds`);

      if (!result.data) {
        throw new Error('No result returned from Firebase function');
      }

      if (result.data.success && result.data.document) {
        const document = result.data.document;
        
        // Log successful extraction
        console.log(`Successfully extracted document data, BOL number: ${document.bolNumber || 'Not found'}`);
        console.log(`Found ${document.containers?.length || 0} containers in the document`);
        
        // Check if the extracted BOL number is in our problematic list
        if (document.bolNumber && PROBLEMATIC_BOL_NUMBERS.includes(document.bolNumber)) {
          console.log(`Detected problematic BOL number "${document.bolNumber}" - attempting to fix`);
          
          // Try to extract BOL number from filename if possible
          const fileNameMatch = fileName.match(/\d+/);
          if (fileNameMatch) {
            const potentialBolNumber = fileNameMatch[0];
            console.log(`Extracted potential BOL number "${potentialBolNumber}" from filename`);
            
            // Override the BOL number
            document.bolNumber = potentialBolNumber;
            
            // Also update it in shipmentDetails if present
            if (document.shipmentDetails) {
              document.shipmentDetails.bolNumber = potentialBolNumber;
            }
            
            console.log(`Successfully fixed BOL number to "${potentialBolNumber}"`);
          } else {
            console.warn(`Could not extract BOL number from filename "${fileName}" - leaving as is with warning`);
          }
        }
        
        return document;
      } else {
        console.error('Firebase function returned error:', result.data.error);
        throw new Error(result.data.error || 'Unknown error processing BOL document');
      }
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error in processBolWithFirebase (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, errorMessage);
      
      // Log more detailed error information
      if (error instanceof Error && 'code' in error) {
        console.error(`Error code: ${(error as any).code}`);
      }
      
      // If this was the last retry, break out
      if (attempt === MAX_RETRIES) {
        console.log('All Firebase processing attempts failed');
        break;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * (2 ** attempt), 10000); // max 10 seconds
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // If we get here, all retries failed
  const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
  console.error('Final error after all retries:', errorMessage);
  
  // Provide a more user-friendly error message
  if (errorMessage.includes('timeout')) {
    throw new Error('Document processing timed out. The document may be too complex or large.');
  } else if (errorMessage.includes('not-found')) {
    throw new Error('The document processing service is not available. Please try again later.');
  } else if (errorMessage.includes('No result returned')) {
    throw new Error('The document processing service did not return a result. Please check if your document is valid.');
  } else {
    throw new Error(`Error processing BOL document: ${errorMessage}`);
  }
};

/**
 * Alias for processBolWithFirebase for backward compatibility
 * @deprecated Use processBolWithFirebase instead
 */
export const processBolDocument = async (
  fileContent: string,
  fileName: string,
  fileType: string,
  clientId: string
) => {
  return processBolWithFirebase({
    fileContent,
    fileName,
    fileType,
    clientId
  });
};

/**
 * Test the Firebase Functions connection
 * @returns Test result
 */
export const testFirebaseConnection = async () => {
  try {
    console.log('Testing Firebase connection...');
    
    // Call the Hello World function directly
    const helloWorld = httpsCallable(functions, 'helloWorld');
    const result = await helloWorld();
    
    console.log('Firebase connection test result:', result.data);
    return result.data;
  } catch (error: any) {
    console.error('Error testing Firebase connection:', error);
    
    // Extract and log detailed error info
    const errorInfo = error.details ? error.details : error;
    console.error('Error details:', errorInfo);
    
    throw new Error(errorInfo.message || 'Failed to connect to Firebase');
  }
}; 