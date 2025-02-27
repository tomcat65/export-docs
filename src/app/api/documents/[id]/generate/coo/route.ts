import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import { Asset } from '@/models/Asset'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

interface GenerateRequest {
  mode?: 'overwrite' | 'new'
  customDate?: string // Allow custom date to be provided
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Extract and validate the ID parameter
    const { id } = await context.params
    if (!id || id === 'undefined') {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Connect to database
    const db = await connectDB()
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get request body
    const body: GenerateRequest = await request.json()

    // Find the BOL document
    const bolDocument = await Document.findById(id)
    if (!bolDocument || bolDocument.type !== 'BOL') {
      return NextResponse.json({ error: 'BOL not found' }, { status: 404 })
    }

    // Get client information
    const client = await Client.findById(bolDocument.clientId)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check for existing certificate
    const existingCOO = await Document.findOne({
      clientId: bolDocument.clientId,
      type: 'COO',
      relatedBolId: bolDocument._id
    })

    // If document exists and mode is not specified or is 'overwrite', delete the existing document
    if (existingCOO && (!body.mode || body.mode === 'overwrite')) {
      // Delete the existing file from GridFS
      if (!mongoose.connection.db) {
        return NextResponse.json(
          { error: 'Database connection not available' },
          { status: 500 }
        )
      }
      
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'documents'
      })
      await bucket.delete(existingCOO.fileId)
      await existingCOO.deleteOne()
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792]) // US Letter size
    const { width, height } = page.getSize()
    
    // Get fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

    // Read logo file
    const logoPath = path.join(process.cwd(), 'public', 'txwos-logo.png')
    let logoImage;
    try {
      const logoImageBytes = fs.readFileSync(logoPath)
      logoImage = await pdfDoc.embedPng(logoImageBytes)
      
      // Calculate logo dimensions (maintain aspect ratio)
      const logoWidth = 120
      const logoHeight = logoImage.height * (logoWidth / logoImage.width)

      // Draw logo
      page.drawImage(logoImage, {
        x: 50,
        y: height - 100,
        width: logoWidth,
        height: logoHeight,
      })
    } catch (error) {
      console.error('Error embedding logo:', error)
      // Continue without logo if there's an error
    }

    // Draw content
    const drawText = (text: string, x: number, y: number, options: { 
      font?: typeof font, 
      size?: number,
      color?: [number, number, number],
      align?: 'left' | 'center' | 'right',
      maxWidth?: number
    } = {}) => {
      const { 
        font: f = font, 
        size = 11, 
        color = [0, 0, 0],
        align = 'left',
        maxWidth
      } = options
      
      let xPos = x
      if (align === 'center' && maxWidth) {
        const textWidth = f.widthOfTextAtSize(text, size)
        xPos = x + (maxWidth - textWidth) / 2
      } else if (align === 'right' && maxWidth) {
        const textWidth = f.widthOfTextAtSize(text, size)
        xPos = x + maxWidth - textWidth
      }
      
      page.drawText(text, {
        x: xPos,
        y: height - y,
        font: f,
        size,
        color: rgb(color[0], color[1], color[2])
      })
    }

    // Draw a line
    const drawLine = (startX: number, startY: number, endX: number, endY: number, thickness: number = 1) => {
      page.drawLine({
        start: { x: startX, y: height - startY },
        end: { x: endX, y: height - endY },
        thickness,
        color: rgb(0, 0, 0),
      })
    }

    // Draw a rectangle
    const drawRect = (x: number, y: number, width: number, height: number, options: {
      fill?: boolean,
      color?: [number, number, number],
      borderColor?: [number, number, number],
      borderWidth?: number
    } = {}) => {
      const {
        fill = false,
        color = [1, 1, 1],
        borderColor = [0, 0, 0],
        borderWidth = 1
      } = options;

      if (fill) {
        page.drawRectangle({
          x,
          y: page.getHeight() - y - height,
          width,
          height,
          color: rgb(color[0], color[1], color[2]),
        });
      }

      // Draw border if borderWidth > 0
      if (borderWidth > 0) {
        page.drawRectangle({
          x,
          y: page.getHeight() - y - height,
          width,
          height,
          borderColor: rgb(borderColor[0], borderColor[1], borderColor[2]),
          borderWidth,
        });
      }
    }

    // Generate certificate number (append suffix for new versions)
    let certificateNumber = `${bolDocument.bolData?.bolNumber}-COO`
    if (existingCOO && body.mode === 'new') {
      const existingCOOs = await Document.find({
        clientId: bolDocument.clientId,
        type: 'COO',
        relatedBolId: bolDocument._id
      }).sort({ createdAt: -1 })
      certificateNumber = `${bolDocument.bolData?.bolNumber}-COO-${existingCOOs.length + 1}`
    }

    // Determine the date to use
    let documentDate: string;
    
    // Priority: 1. Custom date from request, 2. BOL date, 3. Current date
    if (body.customDate) {
      documentDate = body.customDate;
    } else if (bolDocument.bolData?.dateOfIssue) {
      documentDate = bolDocument.bolData.dateOfIssue;
    } else {
      // Format current date as MM/DD/YYYY
      const now = new Date();
      documentDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    }
    
    // Calculate the next business day for notary date (based on BOL date or current date)
    let notaryDate: Date;
    if (body.customDate) {
      // Parse the custom date (assuming MM/DD/YYYY format)
      const [month, day, year] = body.customDate.split('/').map(Number);
      notaryDate = new Date(year, month - 1, day);
    } else if (bolDocument.bolData?.dateOfIssue) {
      // Parse the BOL date (assuming MM/DD/YYYY format)
      const [month, day, year] = bolDocument.bolData.dateOfIssue.split('/').map(Number);
      notaryDate = new Date(year, month - 1, day);
    } else {
      notaryDate = new Date();
    }

    // Add one day to get the next day
    notaryDate.setDate(notaryDate.getDate() + 1);

    // If it's a weekend, move to Monday
    const dayOfWeek = notaryDate.getDay();
    if (dayOfWeek === 0) { // Sunday
      notaryDate.setDate(notaryDate.getDate() + 1);
    } else if (dayOfWeek === 6) { // Saturday
      notaryDate.setDate(notaryDate.getDate() + 2);
    }

    // Format notary date for display
    const notaryDateFormatted = `${notaryDate.getMonth() + 1}/${notaryDate.getDate()}/${notaryDate.getFullYear()}`;

    // Header
    // Logo and Company header
    if (logoImage) {
      // Calculate logo dimensions (maintain aspect ratio)
      const logoWidth = 120
      const logoHeight = logoImage.height * (logoWidth / logoImage.width)

      // Draw logo
      page.drawImage(logoImage, {
        x: 50,
        y: height - 100,
        width: logoWidth,
        height: logoHeight,
      })
    }
    
    // Date at top left
    drawText(`Date: ${documentDate}`, 50, 130, { font: boldFont })
    
    // Document title
    drawText('CERTIFICATE OF ORIGIN', width / 2, 170, { 
      font: boldFont, 
      size: 20, 
      align: 'center', 
      maxWidth: width 
    })
    
    // Certificate number
    drawText(`Certificate No: ${certificateNumber}`, 50, 200, { font: boldFont })
    
    // Draw horizontal line
    drawLine(50, 210, width - 50, 210, 1.5)

    // Buyer Information (Client)
    drawText('BUYER:', 50, 230, { font: boldFont, size: 12 })
    drawText(client.name, 50, 245)
    if (client.address) {
      // Split address into multiple lines if needed
      const addressLines = client.address.split('\n')
      addressLines.forEach((line: string, index: number) => {
        drawText(line, 50, 260 + (index * 15))
      })
    }
    if (client.rif) {
      drawText(`RIF: ${client.rif}`, 50, client.address ? 290 : 260)
    }

    // Maritime Booking Information
    drawText('MARITIME BOOKING:', 50, 320, { font: boldFont, size: 12 })
    drawText(`Bill of Lading No: ${bolDocument.bolData?.bolNumber || 'N/A'}`, 50, 335)
    drawText(`Booking No: ${bolDocument.bolData?.bookingNumber || 'N/A'}`, 50, 350)
    drawText(`Vessel: ${bolDocument.bolData?.vessel || 'N/A'}`, 50, 365)
    
    // Container Information
    drawText('CONTAINER:', 300, 320, { font: boldFont, size: 12 })
    
    // Extract container numbers from items
    const containerNumbers = new Set<string>();
    bolDocument.items?.forEach((item: any) => {
      if (item.containerNumber) {
        containerNumbers.add(item.containerNumber);
      }
    });
    
    if (containerNumbers.size > 0) {
      Array.from(containerNumbers).forEach((container: string, index: number) => {
        drawText(container, 300, 335 + (index * 15))
      })
    } else {
      drawText('N/A', 300, 335)
    }
    
    // Draw horizontal line
    drawLine(50, 385, width - 50, 385, 1.5)

    // Product Information
    drawText('PRODUCT:', 50, 405, { font: boldFont, size: 12 })
    
    // Get unique products from items
    const uniqueProducts = new Set<string>()
    bolDocument.items?.forEach((item: any) => {
      if (item.description) {
        uniqueProducts.add(item.description)
      }
    })
    
    // Draw product information
    let currentY = 420
    Array.from(uniqueProducts).forEach((product: string, index: number) => {
      drawText(product, 50, currentY)
      currentY += 20
    })
    
    // Port Information
    drawText('PORT OF LOADING:', 50, currentY + 20, { font: boldFont, size: 12 })
    drawText(bolDocument.bolData?.portOfLoading || 'N/A', 170, currentY + 20)
    
    drawText('PORT OF DISCHARGE:', 300, currentY + 20, { font: boldFont, size: 12 })
    drawText(bolDocument.bolData?.portOfDischarge || 'N/A', 430, currentY + 20)
    
    // Draw horizontal line
    drawLine(50, currentY + 40, width - 50, currentY + 40, 1.5)
    
    // Origin Declaration
    const declarationY = currentY + 70
    drawText('U.S.A. ORIGIN', width / 2, declarationY, { 
      font: boldFont, 
      size: 18, 
      align: 'center', 
      maxWidth: width 
    })
    
    // Signature Section
    const signatureY = declarationY + 50
    
    // Try to get a random signature from assets
    let signatureImage;
    try {
      // Find all signatures for Tomas
      const signatures = await Asset.find({ 
        type: 'signature', 
        name: { $regex: /Tomas signature/i } 
      });
      
      // Randomly select one if multiple are available
      const signature = signatures.length > 0 
        ? signatures[Math.floor(Math.random() * signatures.length)] 
        : await Asset.findOne({ type: 'signature' });
      
      if (signature && mongoose.connection.db) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'assets'
        });
        
        const fileId = typeof signature.fileId === 'string' 
          ? new mongoose.Types.ObjectId(signature.fileId)
          : signature.fileId;
          
        const downloadStream = bucket.openDownloadStream(fileId);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of downloadStream) {
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        
        // Embed signature image
        if (signature.contentType.startsWith('image/')) {
          if (signature.contentType === 'image/png') {
            signatureImage = await pdfDoc.embedPng(buffer);
          } else if (signature.contentType === 'image/jpeg' || signature.contentType === 'image/jpg') {
            signatureImage = await pdfDoc.embedJpg(buffer);
          }
        }
      }
    } catch (error) {
      console.error('Error embedding signature:', error);
      // Continue without signature image if there's an error
    }
    
    // Draw signature
    if (signatureImage) {
      // Calculate signature dimensions (maintain aspect ratio, max width 150)
      const signatureWidth = Math.min(150, signatureImage.width);
      const signatureHeight = signatureImage.height * (signatureWidth / signatureImage.width);
      
      page.drawImage(signatureImage, {
        x: 50,
        y: height - (signatureY + 30),
        width: signatureWidth,
        height: signatureHeight,
      });
    } else {
      // Signature line if no image
      drawLine(50, signatureY + 40, 250, signatureY + 40, 1);
    }
    
    drawText('Tomas Alvarez', 50, signatureY + 55)
    drawText('Vice President of Latin America', 50, signatureY + 70)
    drawText('Texas Worldwide Oil Services LLC', 50, signatureY + 85)
    drawText('6300 N Main Rd, Houston, TX 77009, USA', 50, signatureY + 100)
    
    // Notary Section
    const notaryY = signatureY + 130
    drawText('NOTARIZATION', width / 2, notaryY, { 
      font: boldFont, 
      size: 14, 
      align: 'center', 
      maxWidth: width 
    })
    
    // Get notary statement from assets
    let notaryStatementText = '';
    try {
      const notaryStatement = await Asset.findOne({ 
        type: 'notary_seal', 
        name: { $regex: /Notary Statements/i } 
      });
      
      if (notaryStatement && notaryStatement.description) {
        notaryStatementText = notaryStatement.description;
      }
    } catch (error) {
      console.error('Error getting notary statement:', error);
    }

    // Draw notary statement with proper formatting
    drawText('CITY: Houston', 117, notaryY + 25)
    drawText('COUNTY: Harris', 278, notaryY + 25)
    drawText('STATE: TX', 428, notaryY + 25)

    // Format the notary date with ordinal suffix
    const notaryDay = notaryDate.getDate();
    let daySuffix = 'th';
    if (notaryDay === 1 || notaryDay === 21 || notaryDay === 31) daySuffix = 'st';
    if (notaryDay === 2 || notaryDay === 22) daySuffix = 'nd';
    if (notaryDay === 3 || notaryDay === 23) daySuffix = 'rd';

    // Month names
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[notaryDate.getMonth()];

    // Draw the notary date line
    drawText('On this', 117, notaryY + 50)
    drawText(`${notaryDay}${daySuffix}`, 179, notaryY + 50, { font: boldFont })
    drawText('day of', 229, notaryY + 50)
    drawText(`${monthName}`, 305, notaryY + 50, { font: boldFont })
    drawText(`, ${notaryDate.getFullYear()}`, 395, notaryY + 50)
    drawText(', personally appeared before me,', 623, notaryY + 50, { align: 'right', maxWidth: 200 })
    drawText('Tomas Alvarez', 722, notaryY + 50, { font: boldFont, align: 'right', maxWidth: 100 })

    // Business address line
    drawText('doing business at', 169, notaryY + 85)
    drawText('4743 Merwin St, Houston, TX 77027', 366, notaryY + 85, { font: boldFont })
    drawText('personally known or sufficiently identified to me,', 839, notaryY + 85, { align: 'right', maxWidth: 300 })

    // Certification line
    drawText('who certifies that', 166, notaryY + 113)
    drawText('he is', 334, notaryY + 113, { font: boldFont })
    drawText('(is) (are) the individual (s) who executed the foregoing instrument and', 839, notaryY + 113, { align: 'right', maxWidth: 500 })

    // Acknowledgment line
    drawText('acknowledge it to be', 178, notaryY + 143)
    drawText('of', 306, notaryY + 143, { font: boldFont })
    drawText('free act and deed.', 447, notaryY + 143)

    // Try to get notary signature from assets
    let notarySignatureImage;
    try {
      const notarySignature = await Asset.findOne({ 
        type: 'notary_seal', 
        name: { $regex: /Notary signature/i } 
      });
      
      if (notarySignature && mongoose.connection.db) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'assets'
        });
        
        const fileId = typeof notarySignature.fileId === 'string' 
          ? new mongoose.Types.ObjectId(notarySignature.fileId)
          : notarySignature.fileId;
          
        const downloadStream = bucket.openDownloadStream(fileId);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of downloadStream) {
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        
        // Embed notary signature image
        if (notarySignature.contentType.startsWith('image/')) {
          if (notarySignature.contentType === 'image/png') {
            notarySignatureImage = await pdfDoc.embedPng(buffer);
          } else if (notarySignature.contentType === 'image/jpeg' || notarySignature.contentType === 'image/jpg') {
            notarySignatureImage = await pdfDoc.embedJpg(buffer);
          }
        }
      }
    } catch (error) {
      console.error('Error embedding notary signature:', error);
    }

    // Draw notary signature if available
    if (notarySignatureImage) {
      const signatureWidth = Math.min(150, notarySignatureImage.width);
      const signatureHeight = notarySignatureImage.height * (signatureWidth / notarySignatureImage.width);
      
      page.drawImage(notarySignatureImage, {
        x: 722 - signatureWidth,
        y: height - (notaryY + 170),
        width: signatureWidth,
        height: signatureHeight,
      });
    }

    // Try to get notary seal from assets
    let notarySealImage;
    try {
      const notarySeal = await Asset.findOne({ 
        type: 'notary_seal', 
        name: { $regex: /Notary Seal Only/i } 
      });
      
      let sealAsset = notarySeal;
      if (!sealAsset) {
        // Fallback to any notary seal
        sealAsset = await Asset.findOne({ type: 'notary_seal' });
      }
      
      if (sealAsset && mongoose.connection.db) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'assets'
        });
        
        const fileId = typeof sealAsset.fileId === 'string' 
          ? new mongoose.Types.ObjectId(sealAsset.fileId)
          : sealAsset.fileId;
          
        const downloadStream = bucket.openDownloadStream(fileId);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of downloadStream) {
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        
        // Embed notary seal image
        if (sealAsset.contentType.startsWith('image/')) {
          if (sealAsset.contentType === 'image/png') {
            notarySealImage = await pdfDoc.embedPng(buffer);
          } else if (sealAsset.contentType === 'image/jpeg' || sealAsset.contentType === 'image/jpg') {
            notarySealImage = await pdfDoc.embedJpg(buffer);
          }
        }
      }
    } catch (error) {
      console.error('Error embedding notary seal:', error);
      // Continue without notary seal image if there's an error
    }

    // Draw notary seal
    if (notarySealImage) {
      // Calculate seal dimensions (maintain aspect ratio, max width 200)
      const sealWidth = Math.min(200, notarySealImage.width);
      const sealHeight = notarySealImage.height * (sealWidth / notarySealImage.width);
      
      page.drawImage(notarySealImage, {
        x: 250,
        y: height - (notaryY + 170),
        width: sealWidth,
        height: sealHeight,
      });
    } else {
      // Draw a rectangle for the notary seal if no image
      drawRect(250, notaryY + 150, 200, 100, {
        borderWidth: 1,
        borderColor: [0, 0, 0]
      });
      
      drawText('OFFICIAL SEAL', 350, notaryY + 200, { 
        font: italicFont, 
        size: 12,
        align: 'center',
        maxWidth: 200
      });
    }

    drawText('(Notary Public)', 722, notaryY + 180, { 
      font: italicFont, 
      size: 10,
      align: 'right',
      maxWidth: 100
    })
    
    // Footer
    drawText('This Certificate of Origin is issued in accordance with international trade practices.', 
      width / 2, height - 50, { 
        size: 8, 
        align: 'center', 
        maxWidth: width - 100 
      })

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

    // Create a buffer from the PDF bytes
    const buffer = Buffer.from(pdfBytes)

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

    const uploadStream = bucket.openUploadStream(`${certificateNumber}.pdf`, {
      metadata: {
        contentType: 'application/pdf',
        bolId: bolDocument._id
      }
    })

    // Upload to GridFS
    await new Promise((resolve, reject) => {
      const readStream = require('stream').Readable.from(buffer)
      readStream
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve)
    })

    // Create document record
    const coo = await Document.create({
      clientId: bolDocument.clientId,
      fileName: `${certificateNumber}.pdf`,
      fileId: uploadStream.id,
      type: 'COO',
      relatedBolId: bolDocument._id,
      cooData: {
        certificateNumber,
        dateOfIssue: documentDate,
        exporterInfo: {
          name: 'Texas Worldwide Oil Services, LLC',
          address: '6300 N Main Rd, Houston, TX 77009, USA',
          taxId: '38-4120041'
        },
        importerInfo: {
          name: client.name,
          address: client.address || '',
          taxId: client.rif || ''
        },
        productInfo: bolDocument.items?.map((item: any) => ({
          description: item.description,
          hsCode: '2710.19.30', // Default HS code for base oils
          origin: 'USA',
          quantity: {
            value: parseFloat(item.quantity.litros.replace(/,/g, '')),
            unit: 'L'
          }
        })) || []
      }
    })

    return NextResponse.json({
      success: true,
      document: {
        id: coo._id,
        type: coo.type,
        fileName: coo.fileName
      }
    })
  } catch (error) {
    console.error('Error generating certificate of origin:', error)
    return NextResponse.json(
      { error: 'Failed to generate certificate of origin' },
      { status: 500 }
    )
  }
} 