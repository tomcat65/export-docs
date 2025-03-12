import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { Client } from '@/models/Client'

interface GenerateRequest {
  mode?: 'overwrite' | 'new'
  poNumber?: string // Add Client PO number
}

// Helper function to extract product name from description
function extractProductName(description: string): string {
  if (!description) return '';
  
  // More aggressively remove packaging info patterns
  const cleanedDesc = description
    // Remove quantity + packaging type patterns like "1 FLEXI TANK" or "10 IBC"
    .replace(/^\d+\s+(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|CONTAINER|BULK|TOTE)s?\s+/i, '')
    // Remove standalone packaging type patterns
    .replace(/^FLEXI\s+TANK\s+|FLEXITANK\s+|FLEXI-TANK\s+|IBC\s+|DRUM\s+|DRUMS\s+|CONTAINER\s+|BULK\s+|TOTE\s+/i, '')
    // Strip any remaining numeric prefixes that might be part of packaging
    .replace(/^\d+\s+/, '')
    .trim();
  
  console.log(`PL extractProductName transform: "${description}" -> "${cleanedDesc}"`);
  return cleanedDesc;
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
  
  // Default to Flexitank if no match is found
  return { packagingType: 'Flexitank', packagingQty: 1 };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Extract and validate the ID parameter
    const { id } = await context.params
    if (!id || id === 'undefined') {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }
    
    // Check if user is authenticated and is admin
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Connect to database
    const db = await connectDB()
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get BOL document
    const bolDocument = await Document.findById(id)
    if (!bolDocument) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    if (bolDocument.type !== 'BOL') {
      return NextResponse.json(
        { error: 'Document is not a BOL' },
        { status: 400 }
      )
    }

    // Get client information
    const client = await Client.findById(bolDocument.clientId)
    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    // Check if there are existing packing lists for this BOL
    const existingPLs = await Document.find({
      type: 'PL',
      relatedBolId: bolDocument._id
    }).sort({ createdAt: -1 })

    // Get mode and poNumber from request (default to 'new')
    const reqData = await req.json() as GenerateRequest;
    const mode = reqData.mode || 'new';
    const poNumber = reqData.poNumber || '';

    console.log(`Generating packing list with mode: ${mode}, existing PLs: ${existingPLs.length}`);

    // If mode is 'overwrite' and there are existing PLs, update the latest one
    // If mode is 'new' or there are no existing PLs, create a new version
    let packingListNumber = '';
    let existingDocument = null;
    
    if (mode === 'overwrite' && existingPLs.length > 0) {
      // We'll overwrite the latest PL
      existingDocument = existingPLs[0];
      packingListNumber = existingDocument.packingListData?.documentNumber || `${bolDocument.bolData?.bolNumber}-PL-1`;
      console.log(`Overwriting existing document: ${existingDocument._id} with number: ${packingListNumber}`);
    } else {
      // Create a new PL with incremented number
      packingListNumber = `${bolDocument.bolData?.bolNumber}-PL-${existingPLs.length + 1}`;
      console.log(`Creating new document with number: ${packingListNumber}`);
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792]) // Letter size
    const { width, height } = page.getSize()
    
    // Fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    
    // Colors
    const primaryColor = rgb(0, 0, 0); // Black for main text for better readability
    const secondaryColor = rgb(0.3, 0.3, 0.3); // Darker Gray for secondary text
    const accentColor = rgb(0.95, 0.95, 0.95); // Very light gray for backgrounds
    const dividerColor = rgb(0.8, 0.8, 0.8); // Medium gray for subtle dividers
    
    // Margins and spacing
    const margin = 60; // Slightly tighter margins
    const lineHeight = 15; // Tighter line height for compact info
    const labelWidth = 85; // Width for labels to align values
    const contentWidth = width - (margin * 2);
    
    // Read logo file
    const logoPath = path.join(process.cwd(), 'public', 'txwos-logo.png')
    let logoImage;
    try {
      const logoImageBytes = fs.readFileSync(logoPath)
      logoImage = await pdfDoc.embedPng(logoImageBytes)
      
      // Calculate logo dimensions (maintain aspect ratio - 150% larger)
      const logoWidth = 75 // Increased from 50 to 75 (150% larger)
      const logoHeight = logoImage.height * (logoWidth / logoImage.width)

      // Draw logo - positioned in top-left corner
      page.drawImage(logoImage, {
        x: margin,
        y: height - margin/2 - logoHeight,
        width: logoWidth,
        height: logoHeight,
      })
    } catch (error) {
      console.error('Error embedding logo:', error)
      // Continue without logo if there's an error
    }

    // Start Y position for content
    let currentY = height - margin - 60; // More space for the logo at top

    // Document title - centered
    page.drawText('PACKING LIST', {
      x: width / 2 - 70,
      y: currentY,
      size: 18,
      font: helveticaBold,
      color: primaryColor,
    })
    currentY -= lineHeight;
    
    // Horizontal line below title
    page.drawLine({
      start: { x: margin, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 0.75,
      color: dividerColor,
    })
    
    currentY -= lineHeight * 1.5;

    // Document details section (right-aligned) - Moved up to align with Shipper
    const docInfoX = width - margin - 200; // Increased x-distance to prevent overlap
    let docInfoY = currentY; // Now at same level as Shipper section

    // Shipper info section with vertical layout
    page.drawText('Shipper:', {
      x: margin,
      y: currentY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    // Document details with clear heading
    page.drawText('Document Details:', {
      x: docInfoX,
      y: docInfoY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    currentY -= lineHeight;
    docInfoY -= lineHeight;
    
    page.drawText('Texas Worldwide Oil Services, LLC', {
      x: margin + 10,
      y: currentY,
      size: 10,
      font: helveticaBold,
      color: primaryColor,
    })
    
    // Document No label and value
    page.drawText('Document No:', {
      x: docInfoX,
      y: docInfoY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    page.drawText(packingListNumber, {
      x: docInfoX + labelWidth,
      y: docInfoY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    
    currentY -= lineHeight;
    docInfoY -= lineHeight + 5; // Added extra spacing to prevent overlap with Date
    
    page.drawText('4743 Merwin St, Houston, TX 77027, USA', {
      x: margin + 10,
      y: currentY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    
    // Date label and value
    const bolDate = bolDocument.bolData?.dateOfIssue
      ? bolDocument.bolData.dateOfIssue
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
    
    page.drawText('Date:', {
      x: docInfoX,
      y: docInfoY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    page.drawText(bolDate, {
      x: docInfoX + labelWidth,
      y: docInfoY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    
    currentY -= lineHeight * 1.5;
    docInfoY -= lineHeight;
    
    // Always display Client PO field, with placeholder if not provided
    page.drawText('Client PO:', {
      x: docInfoX,
      y: docInfoY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    if (poNumber) {
      page.drawText(poNumber, {
        x: docInfoX + labelWidth,
        y: docInfoY,
        size: 9,
        font: helveticaFont,
        color: primaryColor,
      })
    } else {
      // Add placeholder for PO number
      page.drawText("_________________", {
        x: docInfoX + labelWidth,
        y: docInfoY,
        size: 9,
        font: helveticaFont,
        color: rgb(0.7, 0.7, 0.7), // Light gray for placeholder
      })
    }
    
    docInfoY -= lineHeight;

    // Consignee info section below shipper
    page.drawText('Consignee:', {
      x: margin,
      y: currentY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    currentY -= lineHeight;
    
    // Format company name - add C.A. for Venezuelan companies if not already present
    let companyName = client.name;
    const isVenezuelanCompany = client.address && client.address.toLowerCase().includes('venezuela');
    
    // Only add C.A. if it's a Venezuelan company and doesn't already have C.A. in the name
    if (isVenezuelanCompany && 
        !companyName.includes('C.A.') && 
        !companyName.includes('c.a.') && 
        !companyName.includes('CA') && 
        !companyName.includes('Compañía Anónima')) {
      companyName = companyName.trim() + ' C.A.';
    }
    
    page.drawText(companyName, {
      x: margin + 10,
      y: currentY,
      size: 10,
      font: helveticaBold,
      color: primaryColor,
    })
    currentY -= lineHeight;
    
    // Add RIF (Venezuelan tax ID) if it exists
    if (client.rif) {
      page.drawText(`RIF: ${client.rif}`, {
        x: margin + 10,
        y: currentY,
        size: 9,
        font: helveticaFont,
        color: primaryColor,
      });
      currentY -= lineHeight;
    }
    
    // Client address with proper spacing
    if (client.address) {
      const address = client.address.split('\n');
      for (const line of address) {
        page.drawText(line, {
          x: margin + 10,
          y: currentY,
          size: 9,
          font: helveticaFont,
          color: primaryColor,
        });
        currentY -= lineHeight;
      }
    }
    
    // Divider between header and shipping details
    currentY -= lineHeight;
    
    // Shipping Details Section with visual hierarchy
    page.drawLine({
      start: { x: margin, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 0.75,
      color: dividerColor,
    })
    
    currentY -= lineHeight * 1.5;
    
    // Shipping details section with clear heading
    page.drawText('Shipping Details', {
      x: margin,
      y: currentY,
      size: 11,
      font: helveticaBold,
      color: primaryColor,
    })
    currentY -= lineHeight * 1.2;
    
    // Booking No with label-value layout
    page.drawText('Booking No:', {
      x: margin,
      y: currentY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    page.drawText(bolDocument.bolData?.carrierReference || '', {
      x: margin + labelWidth,
      y: currentY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    
    // Container contents section with clear visual break
    currentY -= lineHeight * 1.5;
    
    // Clearer container section header
    page.drawText('Container Contents', {
      x: margin,
      y: currentY,
      size: 11,
      font: helveticaBold,
      color: primaryColor,
    })
    currentY -= lineHeight * 1.5;
    
    // Get items from BOL document
    const items = bolDocument.items || [];
    
    if (items.length > 0) {      
      // Container table headers
      const tableStartY = currentY;
      
      // Headers
      const tableHeaders = ['Item', 'Container', 'Package Type', 'Product Description', 'Quantity'];
      const colWidths = [40, 110, 90, 150, 50];
      const colStarts = [margin];
      
      // Calculate column positions
      for (let i = 1; i < colWidths.length; i++) {
        colStarts[i] = colStarts[i-1] + colWidths[i-1];
      }
      
      // Draw header backgrounds with subtle shading - slightly darker for better visibility
      page.drawRectangle({
        x: margin,
        y: currentY - 3,
        width: contentWidth,
        height: lineHeight + 6,
        color: accentColor,
        borderWidth: 0,
      });
      
      // Draw header texts
      for (let i = 0; i < tableHeaders.length; i++) {
        page.drawText(tableHeaders[i], {
          x: colStarts[i] + 5,
          y: currentY,
          size: 9,
          font: helveticaBold,
          color: primaryColor,
        });
      }
      currentY -= lineHeight + 8;
      
      // Draw items
      let currentPage = page;
      
      // Group items by container
      const containerGroups = new Map();
      
      for (const item of items) {
        const containerNum = item.containerNumber || '';
        if (!containerGroups.has(containerNum)) {
          containerGroups.set(containerNum, []);
        }
        containerGroups.get(containerNum).push(item);
      }
      
      // Draw each container and its items
      let rowIndex = 0;
      let containerIndex = 1; // Counter for container items
      
      for (const [containerNum, containerItems] of containerGroups.entries()) {
        // For each container, determine if we need to group by packaging type
        const packagingGroups = new Map();
        
        for (const item of containerItems) {
          // Get product description - prefer the product field if available
          const productDesc = item.product || extractProductName(item.description) || item.description;
          
          // Get packaging info
          const packaging = item.packaging || 'Flexitank';
          let packagingQty = item.packagingQuantity || 1;
          
          // If no explicit packaging is provided, try to extract from description
          if (!item.packaging && item.description) {
            const extracted = extractPackagingType(item.description);
            if (packaging === 'Flexitank') { // Only override if we're using the default
              packagingQty = extracted.packagingQty;
            }
          }
          
          const packagingKey = `${packaging}:${productDesc}`;
          
          if (!packagingGroups.has(packagingKey)) {
            packagingGroups.set(packagingKey, {
              packagingType: packaging,
              productDesc: productDesc,
              quantity: 0
            });
          }
          
          // Increment the quantity for this packaging type
          packagingGroups.get(packagingKey).quantity += packagingQty;
        }
        
        // Now draw each packaging group for this container
        let firstItemInContainer = true;
        
        for (const [_, packageInfo] of packagingGroups.entries()) {
          // Check if we need a new page
          if (currentY < 100) {
            // Add a new page
            const newPage = pdfDoc.addPage([612, 792]);
            currentPage = newPage;
            currentY = height - 70;
            
            // Add "Continued" header
            currentPage.drawText('Packing List (Continued)', {
              x: width / 2 - 80,
              y: currentY,
              size: 12,
              font: helveticaBold,
              color: primaryColor,
            });
            currentY -= lineHeight * 2;
            
            // Redraw table headers on new page
            currentPage.drawRectangle({
              x: margin,
              y: currentY - 3,
              width: contentWidth,
              height: lineHeight + 6,
              color: accentColor,
              borderWidth: 0,
            });
            
            for (let i = 0; i < tableHeaders.length; i++) {
              currentPage.drawText(tableHeaders[i], {
                x: colStarts[i] + 5,
                y: currentY,
                size: 9,
                font: helveticaBold,
                color: primaryColor,
              });
            }
            currentY -= lineHeight + 8;
            
            // Reset the firstItemInContainer flag as we're on a new page
            firstItemInContainer = true;
            rowIndex = 0; // Reset row index for background shading
          }
          
          // Add subtle alternating row background for readability
          if (rowIndex % 2 === 1) {
            currentPage.drawRectangle({
              x: margin,
              y: currentY - 3,
              width: contentWidth,
              height: lineHeight + 6,
              color: rgb(0.97, 0.97, 0.97), // Very subtle gray
              borderWidth: 0,
            });
          }
          
          // Draw item number only for the first entry of each container
          if (firstItemInContainer) {
            currentPage.drawText(containerIndex.toString(), {
              x: colStarts[0] + 5,
              y: currentY,
              size: 9,
              font: helveticaFont,
              color: primaryColor,
            });
          }
          
          // Draw container number only for the first item in the container
          if (firstItemInContainer) {
            currentPage.drawText(containerNum, {
              x: colStarts[1] + 5,
              y: currentY,
              size: 9,
              font: helveticaFont,
              color: primaryColor,
            });
            firstItemInContainer = false;
          }
          
          // Draw package type
          currentPage.drawText(packageInfo.packagingType, {
            x: colStarts[2] + 5,
            y: currentY,
            size: 9,
            font: helveticaFont,
            color: primaryColor,
          });
          
          // Draw product description
          currentPage.drawText(packageInfo.productDesc, {
            x: colStarts[3] + 5,
            y: currentY,
            size: 9,
            font: helveticaFont,
            color: primaryColor,
          });
          
          // Draw quantity
          currentPage.drawText(packageInfo.quantity.toString(), {
            x: colStarts[4] + 5,
            y: currentY,
            size: 9,
            font: helveticaFont,
            color: primaryColor,
          });
          
          currentY -= lineHeight + 2;
          rowIndex++;
        }
        
        // Increment container index for the next container
        containerIndex++;
        
        // Add a small gap between containers
        currentY -= 3;
      }
    }
    
    // Footer
    const footerY = 50;
    
    // Subtle divider above footer
    page.drawLine({
      start: { x: margin, y: footerY + 15 },
      end: { x: width - margin, y: footerY + 15 },
      thickness: 0.75,
      color: dividerColor,
    });
    
    // Company info in footer
    page.drawText('Texas Worldwide Oil Services, LLC', {
      x: margin,
      y: footerY,
      size: 8,
      font: helveticaBold,
      color: secondaryColor,
    });
    
    page.drawText('6300 N Main Rd, Houston, TX 77009, USA | Phone: +1 (713) 504-7322 | Email: info@txwos.com', {
      x: margin,
      y: footerY - 12,
      size: 7,
      font: helveticaFont,
      color: secondaryColor,
    });
    
    // Page number at bottom right
    page.drawText(`Page 1 of ${pdfDoc.getPageCount()}`, {
      x: width - margin - 60,
      y: footerY - 12,
      size: 7,
      font: helveticaFont,
      color: secondaryColor,
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Store in GridFS
    if (!mongoose.connection.db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }
    
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'documents'
    })

    // If we're overwriting an existing document, delete its file first
    if (existingDocument && existingDocument.fileId) {
      try {
        await bucket.delete(new mongoose.Types.ObjectId(existingDocument.fileId));
        console.log(`Deleted existing file: ${existingDocument.fileId}`);
      } catch (error) {
        console.error('Error deleting existing file:', error);
        // Continue even if delete fails
      }
    }

    // Use the original filename if overwriting, or create a new one
    const fileName = existingDocument?.fileName || `${packingListNumber}.pdf`;
    const uploadStream = bucket.openUploadStream(fileName);
    const fileId = uploadStream.id;
    console.log(`Creating new file with ID: ${fileId} and name: ${fileName}`);

    // Write PDF to GridFS
    uploadStream.write(Buffer.from(pdfBytes))
    uploadStream.end()

    // Wait for upload to complete
    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve)
      uploadStream.on('error', reject)
    })

    // Create or update document record
    let documentRecord;

    if (existingDocument) {
      // Update existing document
      documentRecord = await Document.findByIdAndUpdate(
        existingDocument._id,
        {
          fileId,
          // Keep the original fileName to maintain consistency
          fileName: existingDocument.fileName || fileName,
          packingListData: {
            documentNumber: packingListNumber,
            date: bolDocument.bolData?.dateOfIssue || new Date().toISOString(),
            poNumber: poNumber,  // Include PO number even if empty
            isEditable: true,    // Flag to indicate this document can be edited
            address: {
              company: client.name,
              street: client.address?.split('\n')[0] || '',
              details: client.address?.split('\n')[1] || '',
              location: client.address?.split('\n')[2] || '',
              country: client.address?.split('\n')[3] || '',
            }
          },
          updatedAt: new Date()
        },
        { new: true }
      );
      console.log(`Updated existing document: ${documentRecord._id}`);
    } else {
      // Create new document
      documentRecord = await Document.create({
        clientId: bolDocument.clientId,
        fileName: fileName,
        fileId,
        type: 'PL',
        relatedBolId: bolDocument._id,
        packingListData: {
          documentNumber: packingListNumber,
          date: bolDocument.bolData?.dateOfIssue || new Date().toISOString(),
          poNumber: poNumber,  // Include PO number even if empty
          isEditable: true,    // Flag to indicate this document can be edited
          address: {
            company: client.name,
            street: client.address?.split('\n')[0] || '',
            details: client.address?.split('\n')[1] || '',
            location: client.address?.split('\n')[2] || '',
            country: client.address?.split('\n')[3] || '',
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }

    return NextResponse.json({
      success: true,
      document: documentRecord,
      message: "Packing List generated. You can now edit the Document No, Date, and PO Number."
    })
  } catch (error) {
    console.error('Error generating packing list:', error)
    return NextResponse.json(
      { error: 'Failed to generate packing list' },
      { status: 500 }
    )
  }
} 