/**
 * Firebase Function Client
 * 
 * This module provides a client for calling Firebase functions,
 * specifically for document processing with Claude.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Lazy Firebase initialization — deferred to first use so that
// importing this module during Next.js build (when env vars are
// absent) does not trigger auth/invalid-api-key.
let _app: ReturnType<typeof initializeApp> | null = null;
let _functions: ReturnType<typeof getFunctions> | null = null;
let _emulatorConnected = false;

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function getFirebaseApp() {
  if (!_app) {
    const config = getFirebaseConfig();
    console.log('Firebase config status:', {
      hasApiKey: !!config.apiKey,
      hasAuthDomain: !!config.authDomain,
      hasProjectId: !!config.projectId,
    });
    _app = getApps().length ? getApps()[0] : initializeApp(config);

    // Track auth state on client side
    if (typeof window !== 'undefined') {
      const auth = getAuth(_app);
      onAuthStateChanged(auth, (user) => {
        console.log('Firebase auth state changed:', { isSignedIn: !!user });
      });
    }
  }
  return _app;
}

function getFirebaseFunctions() {
  if (!_functions) {
    const app = getFirebaseApp();
    _functions = getFunctions(app, 'us-central1');

    // Connect emulator in development if configured
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_NODE_ENV === 'development';
    const shouldUseEmulator = isDevelopment && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

    if (shouldUseEmulator && typeof window !== 'undefined' && !_emulatorConnected) {
      try {
        connectFunctionsEmulator(_functions, 'localhost', 5001);
        _emulatorConnected = true;
        console.log('Connected to Firebase Functions emulator on localhost:5001');
      } catch (error) {
        console.error('Failed to connect to Firebase emulator:', error);
      }
    }
  }
  return _functions;
}

// Function to get current auth state
export const getCurrentUser = () => {
  const app = getFirebaseApp();
  return getAuth(app).currentUser;
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
  console.log(`Processing BOL with Firebase: ${fileName} (${Math.round(fileContent.length / 1024)} KB)`);

  const functions = getFirebaseFunctions();
  const processBolDocument = httpsCallable<any, FirebaseFunctionResult>(functions, 'processBolDocument', {
    timeout: 540000, // 9 minutes to match function timeout
  });

  const startTime = Date.now();
  const result = await processBolDocument({
    fileContent,
    fileName,
    fileType,
    clientId,
  });

  const processingTime = (Date.now() - startTime) / 1000;
  console.log(`Firebase function completed in ${processingTime.toFixed(2)} seconds`);

  if (!result.data) {
    throw new Error('No result returned from Firebase function');
  }

  if (result.data.success && result.data.document) {
    const document = result.data.document;
    console.log(`Extracted BOL: ${document.bolNumber || 'unknown'}, ${document.containers?.length || 0} containers`);

    // Fix known problematic BOL numbers
    if (document.bolNumber && PROBLEMATIC_BOL_NUMBERS.includes(document.bolNumber)) {
      const fileNameMatch = fileName.match(/\d+/);
      if (fileNameMatch) {
        document.bolNumber = fileNameMatch[0];
        if (document.shipmentDetails) {
          document.shipmentDetails.bolNumber = fileNameMatch[0];
        }
      }
    }

    return document;
  }

  throw new Error(result.data.error || 'Unknown error processing BOL document');
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
    const helloWorld = httpsCallable(getFirebaseFunctions(), 'helloWorld');
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