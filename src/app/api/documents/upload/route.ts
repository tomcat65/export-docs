import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document, VALID_DOCUMENT_TYPES } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the uploaded file and relevant metadata
    const formData = await request.formData()
    const file = formData.get('file') as File
    let clientId = formData.get('clientId') as string
    const bolNumber = formData.get('bolNumber') as string
    const relatedBolId = formData.get('relatedBolId') as string
    const docType = formData.get('documentType') as string || formData.get('type') as string
    const subType = formData.get('subType') as string
    
    // Check required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!clientId && !relatedBolId) {
      return NextResponse.json({ error: 'No client selected and no related BOL provided' }, { status: 400 })
    }

    // Check file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File must be a PDF or image (JPEG, PNG)' }, { status: 400 })
    }

    // Log essential info for debugging
    console.log('==== DOCUMENT UPLOAD REQUEST ====')
    console.log(`Environment: ${process.env.NODE_ENV || 'unknown'}`)
    console.log(`File: ${file.name} (${file.type}, ${Math.round(file.size / 1024)}KB)`)
    console.log(`Client ID: ${clientId || 'not provided'}`)
    console.log(`BOL Number: ${bolNumber || 'not provided'}`)
    console.log(`Related BOL ID: ${relatedBolId || 'not provided'}`)
    console.log(`Document Type: ${docType || 'not provided'}`)
    console.log('=================================')
    
    await connectDB()

    // If this is a related document, get the client ID from the related BOL
    if (relatedBolId && !clientId) {
      const relatedBol = await Document.findById(relatedBolId);
      if (!relatedBol) {
        return NextResponse.json({ error: 'Related BOL not found' }, { status: 400 })
      }
      clientId = relatedBol.clientId.toString();
    }

    // For related documents, we don't need client verification
    if (docType !== 'BOL') {
      try {
        console.log('Uploading related document:', {
          type: docType,
          relatedBolId,
          clientId
        });
        
        // Upload related document directly
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
          bucketName: 'documents'
        })

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Upload file to GridFS
        const uploadStream = bucket.openUploadStream(file.name, {
          contentType: file.type,
          metadata: {
            clientId: clientId,
            uploadedBy: session.user?.email,
            uploadedAt: new Date().toISOString(),
            fileName: file.name,
            documentType: docType,
            relatedBolId: relatedBolId
          }
        })

        await new Promise((resolve, reject) => {
          const readStream = require('stream').Readable.from(buffer)
          readStream.pipe(uploadStream)
            .on('error', reject)
            .on('finish', resolve)
        })

        console.log('File uploaded to GridFS, creating document record with type:', docType);
        
        // Create document record for related document
        const documentData = {
          clientId: clientId,
          fileName: file.name,
          fileId: uploadStream.id,
          type: docType,  // We'll handle type validation below
          relatedBolId: new mongoose.Types.ObjectId(relatedBolId),
          subType: docType === 'INVOICE_EXPORT' ? 'EXPORT' : undefined
        };
        
        console.log('Document data:', JSON.stringify(documentData));
        
        // Force the type to be one of the enum values if needed
        // This is a temporary fix if the model validation is too strict
        if (!VALID_DOCUMENT_TYPES.includes(docType as any)) {
          console.warn(`Invalid document type: ${docType}, defaulting to 'BOL'`);
          documentData.type = 'BOL';
        }
        
        // Fix for INVOICE type
        if (docType === 'INVOICE') {
          // Ensure we're using a valid enum value that matches the schema
          documentData.type = 'INVOICE_EXPORT';
          // Set subType to distinguish regular invoices from export invoices
          documentData.subType = documentData.subType || 'REGULAR';
        }
        
        try {
          console.log('Creating document with final data:', JSON.stringify({
            clientId: documentData.clientId,
            type: documentData.type,
            subType: documentData.subType,
            relatedBolId: documentData.relatedBolId?.toString(),
            fileName: documentData.fileName
          }));
          
          const newDocument = await Document.create(documentData);
          console.log('Document created successfully:', newDocument._id);
          
          return NextResponse.json({
            success: true,
            document: {
              _id: newDocument._id,
              fileName: newDocument.fileName,
              type: newDocument.type
            }
          });
        } catch (error) {
          console.error('Error creating document:', error);
          // Handle mongoose validation errors more explicitly
          if (error && typeof error === 'object' && 'name' in error && error.name === 'ValidationError' && 'errors' in error) {
            console.error('Validation error details:', error.errors);
            // Type assertion for mongoose validation error
            const validationError = error as { errors: Record<string, { message: string }> };
            return NextResponse.json({
              error: 'Document validation failed: ' + Object.values(validationError.errors).map(err => err.message).join(', ')
            }, { status: 400 });
          }
          throw error;
        }
      } catch (error) {
        console.error('Error in related document upload:', error);
        throw error;
      }
    }

    // BOL uploads are handled client-side via Firebase + /api/documents/save-bol
    return NextResponse.json(
      { error: 'BOL uploads must use /api/documents/save-bol endpoint' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error processing upload:', error)
    
    // Ensure we always return a properly formatted JSON response
    return NextResponse.json({
      error: error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred during document upload'
    }, { 
      status: 500
    })
  }
} 