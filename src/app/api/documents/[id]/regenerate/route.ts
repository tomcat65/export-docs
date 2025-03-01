import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

// Import Document interface
import { IDocument } from '@/models/Document'

// Helper function to extract product name from description
function extractProductName(description: string): string {
  if (!description) return '';
  
  // Remove packaging info patterns like "1 FLEXI TANK" or "10 IBC"
  return description.replace(/^\d+\s+(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|CONTAINER|BULK|TOTE)s?\s+/i, '')
    .trim();
}

// Helper to extract packaging type from description
function extractPackagingType(description: string): { packagingType: string, packagingQty: number } {
  if (!description) return { packagingType: 'Flexitank', packagingQty: 1 };
  
  // Check for common packaging formats in the description (e.g., "1 FLEXI TANK" or "10 IBC")
  const packagingMatch = description.match(/^(\d+)\s+(?:(FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|CONTAINER|BULK|TOTE)s?)/i);
  
  if (packagingMatch) {
    const qty = parseInt(packagingMatch[1], 10) || 1;
    let type = packagingMatch[2].trim();
    
    // Normalize packaging names
    if (/FLEXI\s+TANK|FLEXITANK|FLEXI-TANK/i.test(type)) {
      type = 'Flexitank';
    } else if (/IBC/i.test(type)) {
      type = 'IBC';
    } else if (/DRUM|DRUMS/i.test(type)) {
      type = 'Drum';
    } else if (/CONTAINER/i.test(type)) {
      type = 'Container';
    } else if (/BULK/i.test(type)) {
      type = 'Bulk';
    } else if (/TOTE/i.test(type)) {
      type = 'Tote';
    }
    
    return { packagingType: type, packagingQty: qty };
  }
  
  return { packagingType: 'Flexitank', packagingQty: 1 };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Parse any request parameters
    let debugMode = false; // Disable debug mode by default
    let customCoordinates = null;
    let skipLeftSide = false;
    let testPoNumber = null;
    
    try {
      const reqBody = await request.json().catch(() => ({}));
      if (reqBody.debug !== undefined) debugMode = reqBody.debug; // Allow override through request body
      customCoordinates = reqBody.coordinates;
      skipLeftSide = reqBody.skipLeftSide === true;
      testPoNumber = reqBody.testPoNumber;
    } catch (error) {
      // Ignore JSON parsing errors
    }
    
    if (debugMode) {
      console.log('DEBUG MODE: Enabled - detailed logging will be shown and grid will be drawn');
    }
    
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Get document ID from params
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Find document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if document is a Packing List
    if (document.type !== 'PL') {
      return NextResponse.json({ error: 'Only Packing List documents can be regenerated' }, { status: 400 })
    }

    // Find related BOL document
    const bolDocument = await Document.findById(document.relatedBolId)
    if (!bolDocument) {
      return NextResponse.json({ error: 'Related BOL document not found' }, { status: 404 })
    }

    // Find client
    const client = await Client.findById(document.clientId)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get GridFS bucket
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })

    // Get the existing file from GridFS
    console.log(`Retrieving existing file with ID: ${document.fileId}`)
    const fileId = typeof document.fileId === 'string' 
      ? new mongoose.Types.ObjectId(document.fileId)
      : document.fileId
    
    // Retrieve the document directly from the database again to ensure we have the latest data
    // This helps if there was a race condition with recent updates
    const freshDocument = await Document.findById(id).lean() as IDocument | null;
    if (freshDocument?.packingListData?.poNumber !== undefined && 
        document.packingListData &&
        document.packingListData.poNumber === undefined) {
      console.log(`Updating document with fresh data from database - poNumber: "${freshDocument.packingListData.poNumber}"`);
      document.packingListData.poNumber = freshDocument.packingListData.poNumber;
    }

    // Download the existing PDF
    const downloadStream = bucket.openDownloadStream(fileId)
    const chunks: Buffer[] = []
    
    // Use proper async/await pattern for stream handling
    await new Promise<void>((resolve, reject) => {
      downloadStream.on('data', (chunk) => {
        // Ensure chunk is a Buffer
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      downloadStream.on('error', reject);
      downloadStream.on('end', resolve);
    });
    
    const existingPdfBuffer = Buffer.concat(chunks)
    console.log(`Downloaded existing PDF, size: ${existingPdfBuffer.length} bytes`)
    
    // Load the existing PDF
    const existingPdfDoc = await PDFDocument.load(existingPdfBuffer)
    
    // Get the first page
    const page = existingPdfDoc.getPages()[0]
    
    // Load fonts with error handling
    let helvetica, helveticaBold;
    try {
      helvetica = await existingPdfDoc.embedFont(StandardFonts.Helvetica)
      helveticaBold = await existingPdfDoc.embedFont(StandardFonts.HelveticaBold)
    } catch (error) {
      console.error('Error embedding standard fonts, falling back to Times Roman:', error);
      // Use Times Roman as fallback if Helvetica fails
      try {
        helvetica = await existingPdfDoc.embedFont(StandardFonts.TimesRoman)
        helveticaBold = await existingPdfDoc.embedFont(StandardFonts.TimesRomanBold)
      } catch (secondError) {
        // If all else fails, create a basic error message in the log
        console.error('Critical font error, PDF editing might be incomplete:', secondError);
        helvetica = null;
        helveticaBold = null;
      }
    }
    
    // Skip text operations if fonts couldn't be loaded
    const canDrawText = helvetica !== null && helveticaBold !== null;
    
    if (!canDrawText) {
      console.warn('WARNING: Text operations will be skipped due to font loading errors');
    }
    
    // Define colors - use true black for better contrast
    const primaryColor = rgb(0, 0, 0) // Black
    const backgroundColor = rgb(1, 1, 1) // White
    const lightGray = rgb(0.85, 0.85, 0.85) // Light gray for underlines
    
    // Get page dimensions
    const { width, height } = page.getSize()
    console.log(`PDF page dimensions: width=${width}, height=${height}`);
    
    // Update document details
    if (document.packingListData) {
      // Apply test poNumber if provided (for debugging)
      if (testPoNumber !== null && testPoNumber !== undefined) {
        console.log(`Using test poNumber: "${testPoNumber}" instead of stored value`);
        document.packingListData.poNumber = String(testPoNumber);
      }
      
      // If poNumber is not explicitly set, check database directly to ensure we didn't miss it
      if (document.packingListData.poNumber === undefined || document.packingListData.poNumber === null) {
        console.log('No poNumber value found in document object, doing a direct database query');
        
        const dbCheck = await Document.findById(document._id)
          .select('packingListData.poNumber')
          .lean() as { packingListData?: { poNumber?: string } } | null;
          
        if (dbCheck?.packingListData?.poNumber) {
          console.log(`Found poNumber in database that was missing in document: "${dbCheck.packingListData.poNumber}"`);
          document.packingListData.poNumber = dbCheck.packingListData.poNumber;
        }
      }
      
      // Final check - set to empty string if still undefined/null
      if (document.packingListData.poNumber === undefined || document.packingListData.poNumber === null) {
        console.log('Setting poNumber to empty string as fallback');
        document.packingListData.poNumber = '';
      }
      
      // Log the raw poNumber value to debug
      console.log('Raw poNumber value:', {
        value: document.packingListData.poNumber,
        type: typeof document.packingListData.poNumber,
        isEmpty: document.packingListData.poNumber === '',
        isUndefined: document.packingListData.poNumber === undefined,
        isNull: document.packingListData.poNumber === null
      });
      
      console.log('Updating document details with:', {
        documentNumber: document.packingListData.documentNumber,
        date: document.packingListData.date,
        poNumber: document.packingListData.poNumber === undefined || document.packingListData.poNumber === null 
          ? '(empty)' 
          : `"${document.packingListData.poNumber}"`
      });
      
      try {
        // Define locations where Document Details sections appear - UPDATED BASED ON SCREENSHOT
        const defaultLocations = [
          // Top-right document details section
          {
            // White rectangle to completely cover the existing section
            sectionX: 708,        // Starting X coordinate - moved right based on screenshot
            sectionY: height - 50, // Starting Y coordinate from top
            sectionWidth: 170,     // Width of the section - reduced width
            sectionHeight: 150,    // Height of the section
            
            // Section title
            titleX: 715,
            titleY: height - 65,
            
            // Document number field
            docNumLabelX: 715,
            docNumLabelY: height - 88,
            docNumValueX: 805,
            docNumValueY: height - 88,
            
            // Date field
            dateLabelX: 715, 
            dateLabelY: height - 110,
            dateValueX: 805,
            dateValueY: height - 110,
            
            // PO Number field
            poNumLabelX: 715,
            poNumLabelY: height - 132,
            poNumValueX: 805,
            poNumValueY: height - 132,
            poNumLineEndX: 875    // For drawing underline if no PO number
          }
        ];
        
        // Apply custom coordinates if provided
        let docDetailsLocations = [...defaultLocations]; // Clone the default locations
        
        if (customCoordinates) {
          console.log('Applying custom coordinates');
          
          // Update first section (top-right)
          if (customCoordinates.topRight) {
            docDetailsLocations[0] = { 
              ...docDetailsLocations[0], 
              ...customCoordinates.topRight 
            };
          }
        }
        
        // We'll only update the top-right section based on the screenshot
        const sectionsToUpdate = [docDetailsLocations[0]];
        
        // Find and remove all existing Document Details sections first
        // This is a more thorough approach to prevent duplicates
        
        // Update each document section
        sectionsToUpdate.forEach((location, index) => {
          const locationName = "top-right";
          console.log(`Redrawing ${locationName} document details section`);
          
          // Skip if fonts couldn't be loaded
          if (!canDrawText) {
            console.warn(`Skipping ${locationName} document details due to font issues`);
            return;
          }
          
          // First, clear the entire area by drawing a white rectangle
          page.drawRectangle({
            x: location.sectionX,
            y: location.sectionY - location.sectionHeight, // Adjust Y to account for PDF coordinates starting from bottom
            width: location.sectionWidth,
            height: location.sectionHeight,
            color: backgroundColor,
            opacity: 1.0 // Ensure it's fully opaque to cover existing content
          });
          
          // Draw "Document Details:" header
          page.drawText("Document Details:", {
            x: location.titleX,
            y: location.titleY,
            size: 10,
            font: helveticaBold!,
            color: primaryColor
          });
          
          // Draw Document No label and value
          page.drawText("Document No:", {
            x: location.docNumLabelX,
            y: location.docNumLabelY,
            size: 9,
            font: helveticaBold!,
            color: primaryColor
          });
          
          if (document.packingListData.documentNumber) {
            page.drawText(document.packingListData.documentNumber, {
              x: location.docNumValueX,
              y: location.docNumValueY,
              size: 9,
              font: helvetica!,
              color: primaryColor
            });
          }
          
          // Draw Date label and value
          page.drawText("Date:", {
            x: location.dateLabelX,
            y: location.dateLabelY,
            size: 9,
            font: helveticaBold!,
            color: primaryColor
          });
          
          if (document.packingListData.date) {
            page.drawText(document.packingListData.date, {
              x: location.dateValueX,
              y: location.dateValueY,
              size: 9,
              font: helvetica!,
              color: primaryColor
            });
          }
          
          // Draw Client PO label and value
          page.drawText("Client PO:", {
            x: location.poNumLabelX,
            y: location.poNumLabelY,
            size: 9,
            font: helveticaBold!,
            color: primaryColor
          });
          
          // Draw PO number or underline if empty
          if (document.packingListData.poNumber !== undefined && 
              document.packingListData.poNumber !== null) {
            const poValue = String(document.packingListData.poNumber);
            console.log(`Drawing PO number: "${poValue}" (length: ${poValue.length})`);
            
            // Draw the PO number value (even if it's an empty string)
            page.drawText(poValue, {
              x: location.poNumValueX,
              y: location.poNumValueY,
              size: 9,
              font: helvetica!,
              color: primaryColor
            });
          } else {
            // Draw an underline if no PO number value (null/undefined)
            console.log('Drawing PO number underline (null/undefined value)');
            page.drawLine({
              start: { x: location.poNumValueX, y: location.poNumValueY },
              end: { x: location.poNumLineEndX, y: location.poNumValueY },
              thickness: 0.5,
              color: lightGray
            });
          }
        });
        
        if (debugMode) {
          // Draw debug markers if in debug mode
          page.drawCircle({
            x: width / 2,
            y: height / 2,
            size: 5,
            color: rgb(1, 0, 0) // Red circle in center for reference
          });
          
          // Draw coordinate grid lines at 100 pixel intervals
          for (let i = 0; i < width; i += 100) {
            page.drawLine({
              start: { x: i, y: 0 },
              end: { x: i, y: height },
              thickness: 0.5,
              color: rgb(0.9, 0.9, 0.9) // Very light gray
            });
          }
          
          for (let i = 0; i < height; i += 100) {
            page.drawLine({
              start: { x: 0, y: i },
              end: { x: width, y: i },
              thickness: 0.5,
              color: rgb(0.9, 0.9, 0.9) // Very light gray
            });
          }
        }
      } catch (error) {
        console.error('Error updating PDF document fields:', error);
        // Continue with the process even if drawing fails
      }
    }
    
    // Save the modified PDF
    const modifiedPdfBytes = await existingPdfDoc.save()
    
    // Delete the existing file from GridFS
    try {
      await bucket.delete(fileId)
      console.log(`Deleted existing file: ${fileId}`)
    } catch (error) {
      console.error('Error deleting existing file:', error)
      // Continue even if delete fails
    }
    
    // Get the original filename to maintain consistency
    const originalFileName = document.fileName || `${document.packingListData?.documentNumber || 'document'}.pdf`;
    console.log(`Using original filename: ${originalFileName}`);

    // Upload the modified PDF to GridFS with the SAME fileId if possible
    const uploadStream = bucket.openUploadStream(originalFileName, {
      metadata: {
        clientId: document.clientId.toString(),
        contentType: 'application/pdf',
        uploadedBy: session.user.email,
        uploadedAt: new Date(),
        fileName: originalFileName,
        documentId: document._id.toString(), // Add document ID to metadata for easier tracking
        documentType: document.type,         // Add document type to metadata
        isReplacement: true                  // Flag to indicate this is a replacement
      }
    })
    
    // Use proper stream handling for upload
    await new Promise<void>((resolve, reject) => {
      // Create a proper buffer from the PDF bytes
      const buffer = Buffer.from(modifiedPdfBytes);
      
      // Use a proper readable stream
      const { Readable } = require('stream');
      const readableStream = new Readable();
      
      // Push the buffer and null to signal end
      readableStream.push(buffer);
      readableStream.push(null);
      
      // Pipe to upload stream with proper error handling
      readableStream
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve);
    });
    
    console.log(`Uploaded modified PDF with new file ID: ${uploadStream.id}`)
    
    // Update document with new file ID
    document.fileId = uploadStream.id
    await document.save()
    
    return NextResponse.json({
      success: true,
      document: {
        id: document._id,
        fileId: document.fileId,
        packingListData: document.packingListData
      },
      message: "Document regenerated successfully with updated details"
    })
  } catch (error) {
    console.error('Error regenerating document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to regenerate document' },
      { status: 500 }
    )
  }
} 