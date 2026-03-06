/**
 * Firebase Functions - v1 API
 * Using traditional functions API to avoid Cloud Run container health check issues
 */

import * as admin from "firebase-admin";
// Import traditional functions v1 API
import * as functions from "firebase-functions/v1";
import { Request, Response } from "express";
// Fix import for CallableContext
import { CallableContext } from "firebase-functions/v1/https";
import { processDocumentWithClaude, extractBolNumberFromFileName } from "./utils/claude";
import { connectDB } from "./utils/db";

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Cloud Storage
const storage = admin.storage();

// Log configuration status
console.log("Function configuration", { 
  hasAnthropicConfig: !!functions.config().anthropic,
  hasMongoDBConfig: !!functions.config().mongodb,
  nodeEnv: process.env.NODE_ENV || 'not set',
});

// Hello world function for testing
exports.helloWorld = functions
  .region('us-central1')
  .https.onRequest((request: Request, response: Response) => {
    // Enable CORS
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'GET, POST');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }
  
    console.log("Hello logs!", {structuredData: true});
  
    // Log config for debugging
    const config = {
      hasAnthropicConfig: !!functions.config().anthropic,
      hasMongoDBConfig: !!functions.config().mongodb,
      version: 'v1',
      timestamp: new Date().toISOString()
    };
  
    console.log("Configuration status:", config);
  
    response.json({
      message: "Hello from Firebase Functions!",
      config
    });
  });

// Process BOL document function
exports.processBolDocument = functions
  .region('us-central1')
  .runWith({
    timeoutSeconds: 540, // 9 minutes
    memory: '1GB'
  })
  .https.onCall(async (data: any, context: CallableContext) => {
    try {
      // Extract the auth property safely
      const auth = context && 'auth' in context ? context.auth : null;

      // Log request data for debugging
      console.log("Processing BOL document request:", { 
        hasAuth: !!auth,
        environment: process.env.NODE_ENV || 'not set',
        fileName: data?.fileName
      });
      
      // Validate authentication - but allow bypass in development
      const isDevelopment = process.env.NODE_ENV === 'development';
      if (!auth && !isDevelopment) {
        console.error("Authentication required but not provided");
        throw new functions.https.HttpsError(
          "unauthenticated",
          "The function must be called while authenticated."
        );
      }

      // Get request data
      if (!data.fileContent || !data.fileName || !data.fileType || !data.clientId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Required fields missing: fileContent, fileName, fileType, clientId"
        );
      }

      // Check file size - Cap at 10MB
      const fileSizeInMB = (data.fileContent.length * 3/4) / (1024 * 1024);
      if (fileSizeInMB > 10) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `File too large (${fileSizeInMB.toFixed(2)}MB). Maximum size is 10MB.`
        );
      }

      // Log basic request information
      console.log(`Processing document: ${data.fileName} for client: ${data.clientId}`);
      
      // Connect to MongoDB
      try {
        await connectDB();
        console.log("Successfully connected to MongoDB");
      } catch (dbError: any) {
        console.error("MongoDB connection error:", dbError);
        throw new functions.https.HttpsError("internal", `Database connection failed: ${dbError.message}`);
      }
      
      // Try processing with retries
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          // Determine canonical document type from MIME and filename
          const isPdf = data.fileType.toLowerCase().includes("pdf") ||
            data.fileName.toLowerCase().endsWith(".pdf");
          const docType = isPdf ? "pdf" : "image";
          console.log(`Document type: ${docType} (fileType: ${data.fileType})`);

          // Process document with Claude
          const result = await processDocumentWithClaude({
            type: docType,
            data: data.fileContent,
            mimeType: isPdf ? "application/pdf" : data.fileType
          });
          
          // Upload the document to Firebase Storage
          const bolNumber = result.shipmentDetails.bolNumber;
          const storagePath = `documents/${data.clientId}/BOL/${bolNumber}/${data.fileName}`;
          
          console.log(`Document processed successfully, BOL number: ${bolNumber}`);
          
          // Store document in Firebase Storage
          const file = Buffer.from(data.fileContent, 'base64');
          const fileRef = storage.bucket().file(storagePath);
          
          await fileRef.save(file, {
            metadata: {
              contentType: data.fileType,
              metadata: {
                clientId: data.clientId,
                bolNumber,
                uploadedBy: auth?.uid,
                uploadedAt: new Date().toISOString()
              }
            }
          });
          
          console.log(`Document saved to storage: ${storagePath}`);
          
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
              containers: result.containers,
              commercial: result.commercial
            }
          };
        } catch (error: any) {
          console.error(`Processing attempt ${retryCount + 1} failed:`, error);
          
          // If this is the last retry or the error isn't retryable, stop retrying
          const isRetryableError = error.message?.includes("timeout") || 
                                 error.message?.includes("500") || 
                                 error.message?.includes("503") ||
                                 error.message?.includes("INTERNAL");
          
          if (retryCount === maxRetries || !isRetryableError) {
            // Fall through to try fallback extraction if Claude processing failed
            break;
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          retryCount++;
          console.log(`Retrying document processing (attempt ${retryCount + 1}/${maxRetries + 1})...`);
        }
      }
      
      // If we reach here, all retries failed. Try fallback extraction.
      console.log("All processing attempts failed, attempting fallback extraction...");
      
      // If Claude processing failed but we can extract BOL number from filename,
      // create a minimal document record with basic info
      const bolNumber = extractBolNumberFromFileName(data.fileName);
      
      if (bolNumber) {
        console.log(`Using fallback BOL number from filename: ${bolNumber}`);
        
        // Upload the document to Firebase Storage using the extracted BOL number
        const storagePath = `documents/${data.clientId}/BOL/${bolNumber}/${data.fileName}`;
        
        // Store document in Firebase Storage
        const file = Buffer.from(data.fileContent, 'base64');
        const fileRef = storage.bucket().file(storagePath);
        
        await fileRef.save(file, {
          metadata: {
            contentType: data.fileType,
            metadata: {
              clientId: data.clientId,
              bolNumber,
              uploadedBy: auth?.uid,
              uploadedAt: new Date().toISOString(),
              processingFailed: true
            }
          }
        });
        
        // Return the minimal document data
        return {
          success: true,
          fallback: true,
          document: {
            bolNumber,
            fileName: data.fileName,
            fileUrl: storagePath,
            clientId: data.clientId,
            shipmentDetails: {
              bolNumber,
              dateOfIssue: new Date().toISOString().split('T')[0],
              bookingNumber: '',
              vesselName: '',
              voyageNumber: '',
              portOfLoading: '',
              portOfDischarge: '',
              shipmentDate: ''
            }
          },
          error: "Document processing failed, using basic extraction"
        };
      }
      
      // If we couldn't extract a BOL number, throw an error
      throw new functions.https.HttpsError(
        "internal", 
        "Failed to process document and could not extract BOL number from filename"
      );
    } catch (error: any) {
      console.error("Function error:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "An unknown error occurred"
      );
    }
  });
