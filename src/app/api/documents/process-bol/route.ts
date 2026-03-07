import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import mongoose from 'mongoose';
import { Document } from '@/models/Document';
import { Client } from '@/models/Client';
import { processBolWithFirebase } from '@/lib/firebase-client';

/**
 * Process a BOL document using Firebase Functions
 * This endpoint provides document processing via Firebase
 */
export async function POST(request: NextRequest) {
  // Start timing the request for performance monitoring
  const startTime = Date.now();
  console.log('BOL Processing API request started');
  
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the uploaded data
    const data = await request.json();
    
    // Validate required fields
    if (!data.fileContent || !data.fileName || !data.fileType || !data.clientId) {
      return NextResponse.json({ 
        error: 'Required fields missing: fileContent, fileName, fileType, clientId' 
      }, { status: 400 });
    }

    // Log basic request information (limit logging of large fields)
    console.log(`Processing BOL document: ${data.fileName} for client: ${data.clientId}`);
    console.log(`Document type: ${data.fileType}`);
    console.log(`File content length: ${data.fileContent?.length || 0} characters`);
    
    // Check client exists early to fail fast
    await connectDB();
    const clientExists = await Client.exists({ _id: data.clientId });
    if (!clientExists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 400 });
    }
    
    // Function to extract BOL number from filename as a fallback
    const tryExtractBolFromFileName = (fileName: string): string | null => {
      // Look for a pattern of exactly 9 digits which is typical for BOL numbers
      const match = fileName.match(/(\d{9})/);
      return match ? match[1] : null;
    };
    
    // Try to process the document with multiple retries
    let result: any = null; // Use any type to avoid TypeScript errors with the result object
    const maxRetries = 2;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Processing attempt ${attempt + 1}/${maxRetries + 1}`);
        
        // Call Firebase function to process the document
        result = await processBolWithFirebase({
          fileContent: data.fileContent,
          fileName: data.fileName,
          fileType: data.fileType,
          clientId: data.clientId
        });
        
        // If we get here, processing succeeded
        console.log(`Document processed successfully on attempt ${attempt+1}`);
        break;
      } catch (error: any) {
        lastError = error;
        console.error(`Processing attempt ${attempt+1} failed:`, error.message);
        
        // If this isn't the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const backoffTime = (attempt + 1) * 2000; // 2s, 4s
          console.log(`Retrying in ${backoffTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }
    
    // If all attempts failed, try to extract BOL number from filename as a fallback
    if (!result) {
      console.log('All processing attempts failed, trying fallback extraction');
      
      const bolNumber = tryExtractBolFromFileName(data.fileName);
      if (!bolNumber) {
        console.error('Could not extract BOL number from filename');
        return NextResponse.json({ 
          error: lastError?.message || 'Failed to process document after multiple attempts' 
        }, { status: 500 });
      }
      
      // Create minimal result structure with just the BOL number
      console.log(`Using fallback BOL number from filename: ${bolNumber}`);
      result = {
        success: true,
        fallback: true,
        document: {
          bolNumber,
          shipmentDetails: {
            bolNumber,
            bookingNumber: '',
            carrierReference: '',
            vesselName: '',
            voyageNumber: '',
            portOfLoading: '',
            portOfDischarge: '',
            dateOfIssue: new Date().toISOString().split('T')[0],
            shipmentDate: ''
          },
          parties: {
            shipper: { name: 'Not extracted', address: '', taxId: '' },
            consignee: { name: 'Not extracted', address: '', taxId: '' },
            notifyParty: { name: '', address: '' }
          },
          containers: [],
          commercial: {
            currency: '',
            freightTerms: '',
            itnNumber: '',
            totalWeight: { kg: '0', lbs: '0' }
          }
        }
      };
    }
    
    // Now result should have a 'document' object with at least a bolNumber
    const bolNumber = result.document.bolNumber;
    console.log(`Document processed successfully, BOL number: ${bolNumber}`);
    
    // Check if this BOL number already exists
    const existingBol = await Document.findOne({
      'bolData.bolNumber': bolNumber,
      type: 'BOL'
    });
    
    if (existingBol) {
      console.log(`BOL number ${bolNumber} already exists in database`);
      return NextResponse.json({
        success: false,
        duplicate: true,
        existingDocument: {
          _id: existingBol._id,
          bolNumber,
          fileName: existingBol.fileName
        },
        message: `BOL number ${bolNumber} already exists`
      }, { status: 409 });
    }
    
    // Store file in GridFS
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    });
    
    // Convert base64 to Buffer
    const buffer = Buffer.from(data.fileContent, 'base64');
    
    // Upload file to GridFS
    const uploadStream = bucket.openUploadStream(data.fileName, {
      contentType: data.fileType,
      metadata: {
        clientId: data.clientId,
        bolNumber,
        uploadedBy: session.user?.email,
        uploadedAt: new Date().toISOString(),
        processingMethod: result.fallback ? 'fallback' : 'firebase'
      }
    });
    
    await new Promise((resolve, reject) => {
      const readStream = require('stream').Readable.from(buffer);
      readStream.pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve);
    });
    
    console.log(`Document saved to GridFS with ID: ${uploadStream.id}`);
    
    // Create document record
    const extractedData = result.document;
    const newDocument = await Document.create({
      clientId: data.clientId,
      fileName: data.fileName,
      fileId: uploadStream.id,
      type: 'BOL',
      bolData: {
        bolNumber: extractedData.bolNumber || extractedData.shipmentDetails?.bolNumber,
        bookingNumber: extractedData.bookingNumber || extractedData.shipmentDetails?.bookingNumber || '',
        carrierReference: extractedData.carrierReference || extractedData.shipmentDetails?.carrierReference || '',
        vessel: extractedData.vesselName || extractedData.shipmentDetails?.vesselName || '',
        voyage: extractedData.voyageNumber || extractedData.shipmentDetails?.voyageNumber || '',
        portOfLoading: extractedData.portOfLoading || extractedData.shipmentDetails?.portOfLoading || '',
        portOfDischarge: extractedData.portOfDischarge || extractedData.shipmentDetails?.portOfDischarge || '',
        dateOfIssue: extractedData.dateOfIssue || extractedData.shipmentDetails?.dateOfIssue || '',
        shipmentDate: extractedData.shipmentDate || extractedData.shipmentDetails?.shipmentDate || '',
        totalContainers: extractedData.containers?.length?.toString() || '0',
        totalWeight: extractedData.commercial?.totalWeight || { kg: '0', lbs: '0' }
      },
      extractedData: {
        status: result.fallback ? 'partial' : 'processed',
        processingTime: Date.now() - startTime,
        containers: extractedData.containers || [],
        parties: extractedData.parties,
        commercial: extractedData.commercial
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // Log processing time
    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`BOL processing completed in ${processingTime.toFixed(2)} seconds`);
    
    return NextResponse.json({
      success: true,
      fallback: !!result.fallback,
      document: {
        _id: newDocument._id,
        fileName: newDocument.fileName,
        type: newDocument.type,
        bolNumber: bolNumber
      }
    });
  } catch (error: any) {
    // Log error with stack trace
    console.error('Error processing BOL document:', error);
    console.error(error.stack);
    
    // Calculate elapsed time
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    console.error(`Request failed after ${elapsedSeconds.toFixed(2)} seconds`);
    
    // Return formatted error response
    return NextResponse.json({
      error: error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred during document processing',
      elapsedTime: elapsedSeconds
    }, { 
      status: 500
    });
  }
} 