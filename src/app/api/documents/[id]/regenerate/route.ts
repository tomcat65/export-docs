import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

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
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Connect to database
    await connectDB()

    // Get the document ID from params
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Find the document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if document is a Packing List
    if (document.type !== 'PL') {
      return NextResponse.json({ 
        error: 'This endpoint only supports regenerating Packing List documents' 
      }, { status: 400 })
    }

    // Log the current packingListData for debugging
    console.log('Regenerating packing list with data:', document.packingListData)

    // Get related BOL document to get necessary data
    if (!document.relatedBolId) {
      return NextResponse.json({ error: 'Related BOL document not found' }, { status: 404 })
    }

    // Find BOL document
    const bolDocument = await Document.findById(document.relatedBolId)
    if (!bolDocument) {
      return NextResponse.json({ error: 'Related BOL document not found' }, { status: 404 })
    }

    // Find client information
    const client = await Client.findById(document.clientId)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Extract the document details from the existing document
    const packingListNumber = document.packingListData?.documentNumber || `${bolDocument.bolData?.bolNumber}-PL-1`;
    const documentDate = document.packingListData?.date || new Date().toLocaleDateString();
    
    // Get PO number directly from the database without any processing
    let poNumber = document.packingListData?.poNumber;
    
    console.log('Document details from database:');
    console.log('- Document Number:', packingListNumber);
    console.log('- Date:', documentDate);
    console.log('- PO Number:', poNumber, 'Type:', typeof poNumber);

    console.log('Regenerating PDF with the following details:');
    console.log('- Document Number:', packingListNumber);
    console.log('- Date:', documentDate);
    console.log('- PO Number:', poNumber || '(empty)');

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

    // Company information (Shipper)
    const companyInfoX = margin;
    let companyInfoY = currentY;
    
    page.drawText('Shipper:', {
      x: companyInfoX,
      y: companyInfoY,
      size: 10,
      font: helveticaBold,
      color: secondaryColor,
    })
    companyInfoY -= lineHeight;
    
    page.drawText('Texas World Operations Solutions LLC', {
      x: companyInfoX,
      y: companyInfoY,
      size: 9,
      font: helveticaBold,
      color: primaryColor,
    })
    companyInfoY -= lineHeight;
    
    page.drawText('1095 Evergreen Circle, Suite 200', {
      x: companyInfoX,
      y: companyInfoY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    companyInfoY -= lineHeight;
    
    page.drawText('The Woodlands, TX 77380', {
      x: companyInfoX,
      y: companyInfoY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    companyInfoY -= lineHeight;
    
    page.drawText('United States', {
      x: companyInfoX,
      y: companyInfoY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    
    // Document details section
    const docInfoX = width - margin - 200;
    let docInfoY = currentY;
    
    page.drawText('Document Details:', {
      x: docInfoX,
      y: docInfoY,
      size: 10,
      font: helveticaBold,
      color: secondaryColor,
    })
    docInfoY -= lineHeight;
    
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
    
    docInfoY -= lineHeight;
    
    page.drawText('Date:', {
      x: docInfoX,
      y: docInfoY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    page.drawText(documentDate, {
      x: docInfoX + labelWidth,
      y: docInfoY,
      size: 9,
      font: helveticaFont,
      color: primaryColor,
    })
    
    docInfoY -= lineHeight;
    
    // Always display Client PO field
    page.drawText('Client PO:', {
      x: docInfoX,
      y: docInfoY,
      size: 9,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    // Render PO number exactly as stored in the database
    if (poNumber) {
      page.drawText(poNumber, {
        x: docInfoX + labelWidth,
        y: docInfoY,
        size: 9,
        font: helveticaFont,
        color: primaryColor,
      });
    } else {
      // Draw placeholder if no PO number
      page.drawText("_________________", {
        x: docInfoX + labelWidth,
        y: docInfoY,
        size: 9,
        font: helveticaFont,
        color: rgb(0.7, 0.7, 0.7),
      });
    }
    
    // Consignee information
    const consigneeX = margin;
    let consigneeY = companyInfoY - lineHeight * 1.5;
    
    page.drawText('Consignee:', {
      x: consigneeX,
      y: consigneeY,
      size: 10,
      font: helveticaBold,
      color: secondaryColor,
    })
    consigneeY -= lineHeight;
    
    // Format company name with C.A. for Venezuelan companies
    let formattedCompanyName = client.name;
    if (client.country === 'Venezuela' && !formattedCompanyName.endsWith('C.A.')) {
      formattedCompanyName += ' C.A.';
    }
    
    page.drawText(formattedCompanyName, {
      x: consigneeX,
      y: consigneeY,
      size: 9,
      font: helveticaBold,
      color: primaryColor,
    })
    consigneeY -= lineHeight;
    
    // Add RIF for Venezuelan companies
    if (client.country === 'Venezuela' && client.taxId) {
      page.drawText(`RIF: ${client.taxId}`, {
        x: consigneeX,
        y: consigneeY,
        size: 9,
        font: helveticaFont,
        color: primaryColor,
      })
      consigneeY -= lineHeight;
    }
    
    if (client.address) {
      page.drawText(client.address, {
        x: consigneeX,
        y: consigneeY,
        size: 9,
        font: helveticaFont,
        color: primaryColor,
      })
      consigneeY -= lineHeight;
    }
    
    if (client.city && client.state) {
      page.drawText(`${client.city}, ${client.state}${client.postalCode ? ' ' + client.postalCode : ''}`, {
        x: consigneeX,
        y: consigneeY,
        size: 9,
        font: helveticaFont,
        color: primaryColor,
      })
      consigneeY -= lineHeight;
    }
    
    if (client.country) {
      page.drawText(client.country, {
        x: consigneeX,
        y: consigneeY,
        size: 9,
        font: helveticaFont,
        color: primaryColor,
      })
    }

    // Add shipping details section
    currentY = Math.min(consigneeY, docInfoY) - lineHeight * 2;
    
    // Shipping details section
    page.drawText('Shipping Details:', {
      x: margin,
      y: currentY,
      size: 10,
      font: helveticaBold,
      color: secondaryColor,
    })
    currentY -= lineHeight * 1.5;
    
    // Get container data from BOL document
    const containers = bolDocument.items || [];
    
    // Draw container information
    if (containers.length > 0) {
      // Container contents table header
      const tableX = margin;
      const tableWidth = contentWidth;
      const colWidths = [60, 200, 100, 100]; // Item, Package Type, Product, Quantity
      
      // Table header
      page.drawText('Container Contents:', {
        x: tableX,
        y: currentY,
        size: 10,
        font: helveticaBold,
        color: secondaryColor,
      })
      currentY -= lineHeight * 1.5;
      
      // Table header row
      const headerY = currentY;
      
      // Draw header background
      page.drawRectangle({
        x: tableX,
        y: headerY - lineHeight,
        width: tableWidth,
        height: lineHeight * 1.2,
        color: accentColor,
      })
      
      // Draw header text
      let colX = tableX + 10;
      
      page.drawText('Item', {
        x: colX,
        y: headerY - lineHeight * 0.75,
        size: 9,
        font: helveticaBold,
        color: primaryColor,
      })
      colX += colWidths[0];
      
      page.drawText('Package Type', {
        x: colX,
        y: headerY - lineHeight * 0.75,
        size: 9,
        font: helveticaBold,
        color: primaryColor,
      })
      colX += colWidths[1];
      
      page.drawText('Product', {
        x: colX,
        y: headerY - lineHeight * 0.75,
        size: 9,
        font: helveticaBold,
        color: primaryColor,
      })
      colX += colWidths[2];
      
      page.drawText('Quantity', {
        x: colX,
        y: headerY - lineHeight * 0.75,
        size: 9,
        font: helveticaBold,
        color: primaryColor,
      })
      
      currentY = headerY - lineHeight * 1.5;
      
      // Draw table rows
      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const rowY = currentY;
        
        // Draw alternating row background
        if (i % 2 === 1) {
          page.drawRectangle({
            x: tableX,
            y: rowY - lineHeight,
            width: tableWidth,
            height: lineHeight * 1.2,
            color: rgb(0.97, 0.97, 0.97),
          })
        }
        
        // Draw row data
        colX = tableX + 10;
        
        page.drawText((i + 1).toString(), {
          x: colX,
          y: rowY - lineHeight * 0.75,
          size: 9,
          font: helveticaFont,
          color: primaryColor,
        })
        colX += colWidths[0];
        
        // Extract packaging type from description
        const { packagingType, packagingQty } = extractPackagingType(container.description);
        const packageText = `${packagingQty} ${packagingType}${packagingQty > 1 ? 's' : ''}`;
        
        page.drawText(packageText, {
          x: colX,
          y: rowY - lineHeight * 0.75,
          size: 9,
          font: helveticaFont,
          color: primaryColor,
        })
        colX += colWidths[1];
        
        // Extract product name from description
        const productName = extractProductName(container.description);
        
        page.drawText(productName, {
          x: colX,
          y: rowY - lineHeight * 0.75,
          size: 9,
          font: helveticaFont,
          color: primaryColor,
        })
        colX += colWidths[2];
        
        page.drawText(packagingQty.toString(), {
          x: colX,
          y: rowY - lineHeight * 0.75,
          size: 9,
          font: helveticaFont,
          color: primaryColor,
        })
        
        currentY = rowY - lineHeight * 1.2;
      }
      
      // Draw table border
      page.drawRectangle({
        x: tableX,
        y: currentY,
        width: tableWidth,
        height: headerY - currentY,
        borderColor: dividerColor,
        borderWidth: 0.75,
        color: rgb(1, 1, 1),
        opacity: 0
      })
      
      // Draw column dividers
      let dividerX = tableX + colWidths[0];
      page.drawLine({
        start: { x: dividerX, y: headerY },
        end: { x: dividerX, y: currentY },
        thickness: 0.75,
        color: dividerColor,
      })
      
      dividerX += colWidths[1];
      page.drawLine({
        start: { x: dividerX, y: headerY },
        end: { x: dividerX, y: currentY },
        thickness: 0.75,
        color: dividerColor,
      })
      
      dividerX += colWidths[2];
      page.drawLine({
        start: { x: dividerX, y: headerY },
        end: { x: dividerX, y: currentY },
        thickness: 0.75,
        color: dividerColor,
      })
      
      // Draw header divider
      page.drawLine({
        start: { x: tableX, y: headerY - lineHeight * 1.2 },
        end: { x: tableX + tableWidth, y: headerY - lineHeight * 1.2 },
        thickness: 0.75,
        color: dividerColor,
      })
    }
    
    // Add footer
    const footerY = 50;
    
    // Horizontal line above footer
    page.drawLine({
      start: { x: margin, y: footerY + 20 },
      end: { x: width - margin, y: footerY + 20 },
      thickness: 0.5,
      color: dividerColor,
    })
    
    // Footer text
    page.drawText('Texas World Operations Solutions LLC', {
      x: width / 2 - 100,
      y: footerY + 5,
      size: 8,
      font: helveticaBold,
      color: secondaryColor,
    })
    
    page.drawText('1095 Evergreen Circle, Suite 200, The Woodlands, TX 77380 | +1 (713) 504-7322 | info@txwos.com', {
      x: width / 2 - 200,
      y: footerY - 10,
      size: 8,
      font: helveticaFont,
      color: secondaryColor,
    })
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

    // Store in GridFS
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    
    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'documents'
    })

    // If there's an existing file, delete it
    if (document.fileId) {
      try {
        await bucket.delete(new mongoose.Types.ObjectId(document.fileId))
      } catch (error) {
        console.error('Error deleting existing file:', error)
        // Continue even if delete fails
      }
    }

    const uploadStream = bucket.openUploadStream(`${packingListNumber}.pdf`)
    const fileId = uploadStream.id

    // Write PDF to GridFS
    uploadStream.write(Buffer.from(pdfBytes))
    uploadStream.end()

    // Wait for upload to complete
    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve)
      uploadStream.on('error', reject)
    })

    // Update document record with new file ID
    document.fileId = fileId
    document.fileName = `${packingListNumber}.pdf`
    await document.save()

    return NextResponse.json({
      success: true,
      document: {
        id: document._id,
        fileId: document.fileId,
        packingListData: {
          documentNumber: packingListNumber,
          date: documentDate,
          poNumber: poNumber
        }
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