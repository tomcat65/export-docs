/**
 * Firebase Functions
 * Using the correct syntax for the installed Functions SDK version
 */

const admin = require('firebase-admin');
const { onRequest, onCall } = require('firebase-functions/v2/https');
const { connectDB } = require('./lib/utils/db');
const { processDocumentWithClaude, extractBolNumberFromFileName } = require('./lib/utils/claude');

// Initialize Firebase Admin with proper configuration
admin.initializeApp();

// Get Firebase configuration
const firebaseConfig = admin.app().options;

// Initialize Cloud Storage with the project's default bucket
const storage = admin.storage();

// Log configuration status
console.log("Function configuration", { 
  hasAnthropicConfig: !!process.env.ANTHROPIC_API_KEY,
  hasMongoDBConfig: !!process.env.MONGODB_URI,
  nodeEnv: process.env.NODE_ENV || 'not set',
  storageBucket: firebaseConfig.storageBucket || 'default'
});

// Hello world function for testing
exports.helloWorld = onRequest(
  { 
    cors: true,
    timeoutSeconds: 60 
  },
  (request, response) => {
    // Handle preflight requests (CORS already enabled via options)
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }
  
    console.log("Hello logs!");
  
    // Config for debugging
    const config = {
      env: process.env.NODE_ENV || 'not set',
      version: 'v2',
      timestamp: new Date().toISOString()
    };
  
    response.json({
      message: "Hello from Firebase Functions!",
      config
    });
  }
);

// Process BOL document function
exports.processBolDocument = onCall(
  { 
    timeoutSeconds: 540, // 9 minutes maximum allowed
    memory: "2GiB"      // 2GB memory for faster processing
  },
  async (request) => {
    try {
      // Get request data
      const data = request.data;
      
      // Log request details
      console.log("Processing request:", {
        fileName: data?.fileName,
        clientId: data?.clientId,
        fileType: data?.fileType?.substring(0, 30), // Log just the start of the file type
        fileSize: data?.fileContent ? `${Math.round((data.fileContent.length * 3/4) / 1024)}KB` : 'unknown',
        hasAuth: !!request.auth,
        authUid: request.auth?.uid || 'none'
      });
      
      // No authentication check - the NextAuth system already handles this
      
      // Validate required fields
      if (!data.fileContent || !data.fileName || !data.fileType || !data.clientId) {
        throw new Error("Required fields missing: fileContent, fileName, fileType, clientId");
      }

      // Log basic request information
      console.log(`Processing document: ${data.fileName} for client: ${data.clientId}`);
      
      // Connect to MongoDB - wrap in try/catch for detailed error logging
      try {
        console.log("Connecting to MongoDB with URI:", process.env.MONGODB_URI ? `${process.env.MONGODB_URI.substring(0, 20)}...` : "undefined");
        await connectDB();
        console.log("Successfully connected to MongoDB");
      } catch (dbError) {
        console.error("MongoDB connection error details:", {
          message: dbError.message,
          stack: dbError.stack,
          code: dbError.code
        });
        throw new Error(`Database connection failed: ${dbError.message}`);
      }
      
      // Log document type
      console.log(`Document type: ${data.fileType.includes("pdf") ? "pdf" : "image"}`);
      
      // Check Claude API key
      console.log("Claude API key availability:", !!process.env.ANTHROPIC_API_KEY);
      
      // Setup retry mechanism for Claude processing with exponential backoff
      let result = null;
      let error = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Starting Claude processing (attempt ${attempt}/${maxRetries})...`);
          
          // Process document with Claude with optimized settings based on Firebase best practices
          const processingPromise = processDocumentWithClaude({
            type: data.fileType.includes("pdf") ? "pdf" : "image",
            data: data.fileContent
          });
          
          // Add a timeout for each attempt with longer timeouts for complex documents
          // Claude Opus may need more time for detailed document analysis
          const timeout = 300000 + (attempt * 60000); // 5 minutes + 1 minute per retry
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Claude processing timed out after ${timeout/1000}s on attempt ${attempt}`)), timeout)
          );
          
          // Race the promises
          result = await Promise.race([processingPromise, timeoutPromise]);
          
          // Validate result to ensure we have the expected data
          if (!result || !result.shipmentDetails || !result.shipmentDetails.bolNumber) {
            throw new Error(`Claude returned incomplete data on attempt ${attempt}`);
          }
          
          // If we reach here, processing succeeded
          console.log(`Claude processing succeeded on attempt ${attempt}`);
          console.log(`Extracted BOL Number: ${result.shipmentDetails.bolNumber}`);
          console.log(`Found ${result.containers?.length || 0} containers`);
          break;
        } catch (processingError) {
          error = processingError;
          console.error(`Processing attempt ${attempt} failed:`, {
            message: processingError.message,
            name: processingError.name,
            stack: processingError.stack?.substring(0, 500) // Limit stack trace size
          });
          
          // If this isn't the last attempt, wait before retrying with exponential backoff
          if (attempt < maxRetries) {
            // Implement exponential backoff with jitter per best practices
            const baseDelay = Math.pow(2, attempt) * 10000; // 20s, 40s, 80s...
            const jitter = Math.random() * 2000; // Add 0-2s of random jitter
            const backoffTime = baseDelay + jitter;
            
            console.log(`Retrying in ${Math.round(backoffTime/1000)}s with exponential backoff...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
        }
      }
      
      // If all attempts failed, try fallback or throw error
      if (!result) {
        // Try to extract BOL number from filename as a last resort
        const fallbackBolNumber = extractBolNumberFromFileName(data.fileName);
        
        if (fallbackBolNumber) {
          console.log(`All Claude processing attempts failed. Using fallback BOL number from filename: ${fallbackBolNumber}`);
          
          // Create a minimal result object with the fallback BOL number
          result = {
            shipmentDetails: {
              bolNumber: fallbackBolNumber,
              bookingNumber: "",
              carrierReference: "",
              vesselName: "",
              voyageNumber: "",
              portOfLoading: "",
              portOfDischarge: "",
              dateOfIssue: new Date().toISOString().split('T')[0],
              shipmentDate: ""
            },
            parties: {
              shipper: { name: "Not extracted", address: "", taxId: "" },
              consignee: { name: "Not extracted", address: "", taxId: "" },
              notifyParty: { name: "", address: "" }
            },
            containers: [],
            commercial: {
              currency: "",
              freightTerms: "",
              itnNumber: "",
              totalWeight: { kg: "0", lbs: "0" }
            }
          };
        } else {
          // If we couldn't extract a BOL number and all attempts failed, we must error out
          throw error || new Error("Failed to process document with Claude after multiple attempts");
        }
      }
      
      // Upload the document to Firebase Storage
      const bolNumber = result.shipmentDetails.bolNumber;
      const storagePath = `documents/${data.clientId}/BOL/${bolNumber}/${data.fileName}`;
      
      console.log(`Document processed successfully, BOL number: ${bolNumber}`);
      
      try {
        // Store document in Firebase Storage with retries
        const file = Buffer.from(data.fileContent, 'base64');
        const fileRef = storage.bucket().file(storagePath);
        
        // Use a generic user ID if auth is not available
        const uploadedBy = request.auth?.uid || 'system-user';
        
        // Implement retry logic for storage operations
        let storageSuccess = false;
        let storageAttempt = 0;
        const maxStorageRetries = 3;
        
        while (!storageSuccess && storageAttempt < maxStorageRetries) {
          try {
            storageAttempt++;
            console.log(`Storage attempt ${storageAttempt}/${maxStorageRetries}`);
            
            await fileRef.save(file, {
              metadata: {
                contentType: data.fileType,
                metadata: {
                  clientId: data.clientId,
                  bolNumber,
                  uploadedBy,
                  uploadedAt: new Date().toISOString(),
                  processingFailed: !result.containers || result.containers.length === 0
                }
              }
            });
            
            storageSuccess = true;
            console.log(`Document saved to storage: ${storagePath}`);
          } catch (retryError) {
            console.error(`Storage attempt ${storageAttempt} failed:`, retryError.message);
            
            if (storageAttempt < maxStorageRetries) {
              const backoffTime = storageAttempt * 1000; // 1s, 2s, 3s...
              console.log(`Retrying storage in ${backoffTime/1000}s...`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
          }
        }
        
        // If all storage attempts failed, return result but with storageError
        if (!storageSuccess) {
          throw new Error("Failed to save document to storage after multiple attempts");
        }
      } catch (storageError) {
        console.error("Storage error:", storageError);
        
        // Continue with document data, just note the storage error
        return {
          success: true,
          storageError: storageError.message,
          document: {
            bolNumber,
            fileName: data.fileName,
            clientId: data.clientId,
            shipmentDetails: result.shipmentDetails,
            parties: result.parties,
            containers: result.containers || [],
            commercial: result.commercial
          }
        };
      }
      
      // Return the processed data
      return {
        success: true,
        document: {
          bolNumber,
          fileName: data.fileName,
          fileUrl: storagePath,
          clientId: data.clientId,
          shipmentDetails: result.shipmentDetails,
          parties: result.parties,
          containers: result.containers || [],
          commercial: result.commercial
        }
      };
    } catch (error) {
      console.error("Function error:", {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      throw new Error(error.message || "An unknown error occurred");
    }
  }
); 