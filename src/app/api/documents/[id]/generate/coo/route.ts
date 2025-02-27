import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import { Asset } from '@/models/Asset'
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFImage, PDFFont } from 'pdf-lib'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { Types } from 'mongoose'

interface GenerateRequest {
  mode?: 'overwrite' | 'new'
  customDate?: string // Allow custom date to be provided
}

// Define types for function parameters
type FontConfig = {
  font: PDFFont;
  boldFont: PDFFont;
  italicFont?: PDFFont;
}

type PageConfig = {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  contentWidth: number;
}

type HeaderAssets = {
  formattedBusinessDay: string;
  logoImage: PDFImage | undefined;
}

type DrawFunctions = {
  drawText: (text: string, x: number, y: number, options?: any) => void;
  drawLine: (startX: number, startY: number, endX: number, endY: number, thickness?: number) => void;
  drawRect?: (x: number, y: number, width: number, height: number, options?: any) => void;
  getOrdinalSuffix?: (day: number) => string;
}

type DocumentData = {
  client: any;
  bolDocument: any;
  containers: Array<{containerNumber: string, sealNumber: string}>;
  uniqueProducts: Set<string>;
}

type SignatureAssets = {
  currentY: number;
  signatureImage: PDFImage | undefined;
  notarySignatureImage: PDFImage | undefined;
  notarySealImage: PDFImage | undefined;
  businessDateObj: Date;
  userName: string;
}

// Draw document header: logo, title, and date
function drawDocumentHeader(
  page: PDFPage,
  { font, boldFont }: FontConfig,
  { width, height, margin, contentWidth }: PageConfig,
  { formattedBusinessDay, logoImage }: HeaderAssets,
  { drawText, drawLine }: DrawFunctions
) {
  // Draw logo
  if (logoImage) {
    const logoWidth = 70;
    const logoHeight = logoImage.height * (logoWidth / logoImage.width);
    
    page.drawImage(logoImage, {
      x: margin.left,
      y: height - margin.top - 20,
      width: logoWidth,
      height: logoHeight,
    });
  }
  
  // Draw document date at top left where logo is
  drawText(formattedBusinessDay, margin.left, margin.top + 40, { font: font, size: 11 });
  
  // Draw document title - centered
  drawText('CERTIFICATE OF ORIGIN', width / 2, margin.top + 70, { 
    font: boldFont, 
    size: 14, // Slightly smaller to prevent overflow
    align: 'center'
  });
}

// Draw document body: consignee info, booking details, container table, products
function drawDocumentBody(
  page: PDFPage,
  { font, boldFont, italicFont }: FontConfig,
  { width, height, margin, contentWidth }: PageConfig,
  { client, bolDocument, containers, uniqueProducts }: DocumentData,
  { drawText, drawLine, drawRect }: DrawFunctions
) {
  let currentY = margin.top + 120; // Start below the header
  
  // Draw buyer information
  drawText('Buyer:', margin.left, currentY, { font: boldFont, size: 10 });
  currentY += 15;
  drawText(client.name, margin.left, currentY, { size: 10 });
  currentY += 15;
  drawText(`RIF: ${client.rif}`, margin.left, currentY, { size: 10 });
  currentY += 20;

  // Extract maritime booking and vessel information
  const bookingNumber = bolDocument.bolData?.bookingNumber || 'N/A';
  const vessel = bolDocument.bolData?.vessel || 'N/A';
  const voyage = bolDocument.bolData?.voyage || 'N/A';
  
  // Log for debugging
  console.log('BOL Data for COO generation:', {
    bookingNumber,
    vessel,
    voyage,
    dateOfIssue: bolDocument.bolData?.dateOfIssue,
  });
  
  // Draw maritime booking information
  drawText('Maritime Booking:', margin.left, currentY, { font: boldFont, size: 10 });
  currentY += 15;
  drawText(`${bookingNumber}`, margin.left, currentY, { size: 10 });
  currentY += 15;
  drawText(`Vessel / Voyage: ${vessel} / ${voyage}`, margin.left, currentY, { size: 10 });
  currentY += 20;

  // Draw container and seal table header
  drawText('Container', margin.left, currentY, { font: boldFont, size: 8 });
  drawText('Seal', margin.left + 200, currentY, { font: boldFont, size: 8 });
  currentY += 10;
  
  // Draw line under header
  drawLine(margin.left, currentY, margin.left + contentWidth, currentY);
  currentY += 5;

  // Draw container and seal table rows with smaller font and tighter spacing
  if (containers && containers.length > 0) {
    containers.forEach(({ containerNumber, sealNumber }) => {
      drawText(containerNumber, margin.left, currentY, { size: 8 });
      drawText(sealNumber, margin.left + 200, currentY, { size: 8 });
      currentY += 10; // Reduced row spacing even further to match sample
    });
  } else if (bolDocument.items && bolDocument.items.length > 0) {
    bolDocument.items.forEach((item: any) => {
      drawText(item.containerNumber, margin.left, currentY, { size: 8 });
      drawText(item.seal, margin.left + 200, currentY, { size: 8 });
      currentY += 10; // Reduced row spacing to match sample
    });
  } else {
    drawText('No container data available', margin.left, currentY, { size: 8, color: [0.6, 0.6, 0.6] });
    currentY += 10;
  }

  // Draw line after the container table
  drawLine(margin.left, currentY, margin.left + contentWidth, currentY);
  currentY += 20;

  // Draw product information
  drawText('Product:', margin.left, currentY, { font: boldFont, size: 10 });
  currentY += 15;
  
  // Get product descriptions
  const products = Array.from(uniqueProducts).map(desc => desc);

  // Draw product descriptions
  if (products.length > 0) {
    products.forEach((product, index) => {
      // Format as "1. 1 FLEXI TANK Base Oil Group II 600N"
      drawText(`${index + 1}. ${product}`, margin.left, currentY, { size: 9 });
      currentY += 15;
    });
  } else {
    drawText('No product data available', margin.left, currentY, { size: 9, color: [0.6, 0.6, 0.6] });
    currentY += 15;
  }

  // Draw port information
  const portOfLoading = bolDocument.bolData?.portOfLoading || 'N/A';
  const portOfDischarge = bolDocument.bolData?.portOfDischarge || 'N/A';
  
  drawText(`Port of loading: ${portOfLoading}`, margin.left, currentY, { size: 9 });
  currentY += 15;
  drawText(`Port of discharge: ${portOfDischarge}`, margin.left, currentY, { size: 9 });
  currentY += 30;

  // Draw U.S.A. ORIGIN text centered with reduced font size
  drawText('U.S.A. ORIGIN', width / 2, currentY, { 
    font: boldFont, 
    size: 14, 
    align: 'center' 
  });
  currentY += 30;

  return currentY;
}

// Draw document signature and notary section
function drawSignatureAndNotary(
  page: PDFPage,
  { font, boldFont, italicFont }: FontConfig,
  { width, height, margin, contentWidth }: PageConfig,
  { currentY, signatureImage, notarySignatureImage, notarySealImage, businessDateObj, userName }: SignatureAssets,
  { drawText, drawLine, drawRect, getOrdinalSuffix }: DrawFunctions
) {
  // 1. SIGNATURE BLOCK - More compact
  currentY += 25; // Reduced spacing
  drawText('Yours faithfully,', margin.left, currentY, { size: 10 });
  
  // Draw signature
  currentY += 15; // Reduced spacing
  if (signatureImage) {
    const signatureWidth = Math.min(90, signatureImage.width); // Slightly smaller
    const signatureHeight = signatureImage.height * (signatureWidth / signatureImage.width);
    
    page.drawImage(signatureImage, {
      x: margin.left,
      y: height - (currentY + 30),
      width: signatureWidth,
      height: signatureHeight,
    });
    
    currentY += signatureHeight + 5; // Reduced spacing
  } else {
    // Signature line if no image
    drawLine(margin.left, currentY + 30, margin.left + 150, currentY + 30, 1);
    currentY += 35; // Reduced spacing
  }
  
  // Signature details with more compact spacing
  drawText(`${userName},`, margin.left, currentY, { size: 10 });
  currentY += 15;
  drawText('Vicepresident Latin America', margin.left, currentY, { size: 10 });
  currentY += 15;
  drawText('Texas Worldwide Oil Services LLC', margin.left, currentY, { size: 10 });
  currentY += 15;
  drawText('4743 Merwin St, Houston TX 77027', margin.left, currentY, { size: 10 });
  currentY += 15;
  drawText('USA Direct +1(713) 309-6637', margin.left, currentY, { size: 10 });
  
  // 2. NOTARY SECTION - Make sure it fits on the page
  currentY += 15; // Reduced spacing more to avoid overlap with footer
  
  // Ensure the notary section has enough space, or adjust position
  const remainingSpace = height - margin.bottom - currentY;
  const notaryHeight = 110; // Reduced approximate height needed for notary section
  
  if (remainingSpace < notaryHeight) {
    // Move up some elements if there's not enough space
    currentY = height - margin.bottom - notaryHeight;
  }
  
  // Draw notary statement with proper formatting - more compact
  drawText('CITY: Houston', margin.left, currentY, { size: 9 });
  drawText('COUNTY: Harris', margin.left + 150, currentY, { size: 9 });
  drawText('STATE: TX', margin.left + 300, currentY, { size: 9 });

  // Format the notary date with ordinal suffix
  const notaryDateObj = businessDateObj;
  const notaryDay = notaryDateObj.getDate();
  const daySuffix = getOrdinalSuffix?.(notaryDay) || '';
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[notaryDateObj.getMonth()];

  // Draw the notary date line
  currentY += 18; // Reduced spacing
  const notaryLineY = currentY;
  drawText('On this', margin.left, currentY, { size: 9 });
  drawText(`${notaryDay}${daySuffix}`, margin.left + 40, currentY, { font: boldFont, size: 9 });
  drawText('day of', margin.left + 60, currentY, { size: 9 });
  drawText(`${monthName}`, margin.left + 95, currentY, { font: boldFont, size: 9 });
  drawText(`, ${notaryDateObj.getFullYear()}`, margin.left + 160, currentY, { size: 9 });
  drawText('personally appeared before me,', margin.left + 200, currentY, { size: 9 });
  drawText(userName, margin.left + 380, currentY, { font: boldFont, size: 9 });

  // Address line
  currentY += 18; // Reduced spacing
  drawText('doing business at', margin.left, currentY, { size: 9 });
  drawText('4743 Merwin St, Houston, TX 77027', margin.left + 80, currentY, { font: boldFont, size: 9 });
  
  // Identity confirmation
  currentY += 18; // Reduced spacing
  drawText('personally known or sufficiently identified to me,', margin.left, currentY, { size: 9 });

  // Certification line
  currentY += 18; // Reduced spacing
  drawText('who certifies that he is the individual who executed the foregoing instrument', margin.left, currentY, { size: 9 });
  
  // Acknowledgment line
  currentY += 18; // Reduced spacing
  drawText('and acknowledge it to be of free act and deed.', margin.left, currentY, { size: 9 });

  // Draw notary signature with reduced size
  if (notarySignatureImage) {
    const signatureWidth = Math.min(90, notarySignatureImage.width); // Slightly smaller
    const signatureHeight = notarySignatureImage.height * (signatureWidth / notarySignatureImage.width);
    
    page.drawImage(notarySignatureImage, {
      x: width - margin.right - signatureWidth,
      y: height - (notaryLineY + 55),
      width: signatureWidth,
      height: signatureHeight,
    });
  } else {
    // Signature line if no image
    drawLine(width - margin.right - 120, notaryLineY + 55, width - margin.right, notaryLineY + 55, 1);
  }
  
  // Draw notary seal - adjust position for visibility
  if (notarySealImage) {
    const sealWidth = Math.min(75, notarySealImage.width); // Slightly smaller
    const sealHeight = notarySealImage.height * (sealWidth / notarySealImage.width);
    
    page.drawImage(notarySealImage, {
      x: margin.left + 200,
      y: height - (notaryLineY + 45),
      width: sealWidth,
      height: sealHeight,
    });
  } else {
    // Draw a rectangle for the notary seal if no image
    drawRect?.(margin.left + 200, notaryLineY + 35, 75, 35, {
      borderWidth: 1,
      borderColor: [0, 0, 0]
    });
    
    drawText('NOTARY SEAL', margin.left + 237, notaryLineY + 53, { 
      font: italicFont, 
      size: 9,
      align: 'center',
      maxWidth: 75
    });
  }

  // Draw notary label
  drawText('(Notary Public)', width - margin.right - 60, notaryLineY + 75, { 
    font: italicFont, 
    size: 9
  });
}

// Draw document footer
function drawDocumentFooter(
  page: PDFPage,
  { font }: { font: PDFFont },
  { width, height, margin, contentWidth }: PageConfig,
  { drawText, drawLine }: DrawFunctions
) {
  // Add a separator line before footer
  drawLine(margin.left, height - margin.bottom - 50, width - margin.right, height - margin.bottom - 50, 1);
  
  // Footer - ensure it's clearly separated from the body
  drawText('This Certificate of Origin is issued in accordance with international trade practises.', width / 2, height - margin.bottom - 40, {
    size: 9,
    align: 'center'
  });
  
  drawText('TEXAS WORLDWIDE OIL SERVICES LLC', width / 2, height - margin.bottom - 25, {
    size: 8,
    align: 'center'
  });
  
  drawText('USA Direct +1 (713) 309-6637 / +1 (713) 409-1637', width / 2, height - margin.bottom - 15, {
    size: 8,
    align: 'center'
  });
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

    // Parse request body for mode and customDate
    const body = await request.json()
    const mode = body?.mode || 'new'
    const customDate = body?.customDate
    
    await connectDB()

    // Get the ID from params
    const { id } = await context.params
    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    // Find document and related client
    const bolDocument = await Document.findById(id)
    if (!bolDocument || bolDocument.type !== 'BOL') {
      return NextResponse.json({ error: 'BOL document not found' }, { status: 404 })
    }

    const client = await Client.findById(bolDocument.clientId)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check if there's already a COO document associated with this BOL
    if (mode !== 'overwrite') {
      const existingCOO = await Document.findOne({
        relatedBolId: new Types.ObjectId(id),
        type: 'COO'
      })

      if (existingCOO) {
        return NextResponse.json({
          document: {
            _id: existingCOO._id,
            fileName: existingCOO.fileName,
            type: existingCOO.type
          }
        })
      }
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792]) // US Letter size
    
    // Set page margins
    const margin = { top: 36, right: 36, bottom: 90, left: 36 }
    const width = page.getWidth()
    const height = page.getHeight()
    const contentWidth = width - margin.left - margin.right

    // Load fonts from StandardFonts
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
    const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic)

    // Date handling logic - correctly parse from BOL data
    let businessDateObj = new Date()
    
    // First, try to get date from BOL's dateOfIssue
    if (bolDocument.bolData?.dateOfIssue) {
      console.log("Using BOL dateOfIssue:", bolDocument.bolData.dateOfIssue);
      try {
        // Handle different date formats: MM/DD/YYYY or YYYY-MM-DD
        if (bolDocument.bolData.dateOfIssue.includes('/')) {
          const [month, day, year] = bolDocument.bolData.dateOfIssue.split('/').map((num: string) => parseInt(num, 10));
          console.log("Parsed date components:", { month, day, year });
          
          // Ensure proper year format (handle 2-digit years)
          const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
          businessDateObj = new Date(fullYear, month - 1, day);
          
          console.log("Converted date object:", {
            date: businessDateObj.toISOString(),
            year: businessDateObj.getFullYear(),
            month: businessDateObj.getMonth() + 1,
            day: businessDateObj.getDate()
          });
        } else if (bolDocument.bolData.dateOfIssue.includes('-')) {
          businessDateObj = new Date(bolDocument.bolData.dateOfIssue);
          console.log("Parsed ISO date:", businessDateObj.toISOString());
        }
      } catch (error) {
        console.error("Error parsing BOL date:", error);
      }
    } 
    // If no BOL date or parsing failed, try customDate
    else if (customDate) {
      console.log("Using custom date:", customDate);
      try {
        businessDateObj = new Date(customDate);
        console.log("Parsed custom date:", businessDateObj.toISOString());
      } catch (error) {
        console.error("Error parsing custom date:", error);
      }
    } 
    // Fallback to current date
    else {
      console.log("Using current date as fallback:", new Date().toISOString());
    }

    // Properly format the date for display
    const getOrdinalSuffix = (day: number): string => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    const formatDateFormal = (date: Date): string => {
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'long' });
      const year = date.getFullYear();
      return `${month} ${day}, ${year}`;
    };

    const getNextBusinessDay = (date: Date): Date => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() + 1);
      
      // Skip weekends
      const day = newDate.getDay();
      if (day === 0) newDate.setDate(newDate.getDate() + 1); // Sunday, move to Monday
      if (day === 6) newDate.setDate(newDate.getDate() + 2); // Saturday, move to Monday
      
      return newDate;
    };

    // Format dates for various parts of the document
    const formattedBusinessDay = formatDateFormal(businessDateObj);
    const businessDayName = businessDateObj.toLocaleString('en-US', { weekday: 'long' });
    const businessMonth = businessDateObj.toLocaleString('en-US', { month: 'long' });
    const businessDay = businessDateObj.getDate();
    const businessYear = businessDateObj.getFullYear();

    // Load logo
    let logoImage;
    try {
      const logo = await Asset.findOne({ type: 'letterhead', name: /logo/i });
      
      if (logo && mongoose.connection.db) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'assets'
        });
        
        const fileId = typeof logo.fileId === 'string' 
          ? new mongoose.Types.ObjectId(logo.fileId)
          : logo.fileId;
          
        const downloadStream = bucket.openDownloadStream(fileId);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of downloadStream) {
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        
        // Embed logo image
        if (logo.contentType.startsWith('image/')) {
          if (logo.contentType === 'image/png') {
            logoImage = await pdfDoc.embedPng(buffer);
          } else if (logo.contentType === 'image/jpeg' || logo.contentType === 'image/jpg') {
            logoImage = await pdfDoc.embedJpg(buffer);
          }
        }
      }
    } catch (error) {
      console.error('Error embedding logo:', error);
    }

    // Load signature and notary assets
    let signatureImage, notarySignatureImage, notarySealImage;
    try {
      // Get the first name from the user's full name to search for their signature
      const firstName = session.user?.name?.split(' ')[0] || '';
      
      const signatures = await Asset.find({ 
        type: 'signature', 
        name: { $regex: new RegExp(firstName, 'i') } 
      });
      
      const signature = signatures.length > 0 
        ? signatures[Math.floor(Math.random() * signatures.length)] 
        : await Asset.findOne({ type: 'signature' });
      
      const notarySignature = await Asset.findOne({ type: 'signature', name: /notary/i });
      const notarySeal = await Asset.findOne({ type: 'notary_seal' });
      
      if (mongoose.connection.db) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'assets'
        });
        
        // Process signature
        if (signature) {
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
        
        // Process notary signature if available
        if (notarySignature) {
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
        
        // Process notary seal if available
        if (notarySeal) {
          const fileId = typeof notarySeal.fileId === 'string' 
            ? new mongoose.Types.ObjectId(notarySeal.fileId)
            : notarySeal.fileId;
            
          const downloadStream = bucket.openDownloadStream(fileId);
          
          // Convert stream to buffer
          const chunks: Buffer[] = [];
          for await (const chunk of downloadStream) {
            chunks.push(Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);
          
          // Embed notary seal image
          if (notarySeal.contentType.startsWith('image/')) {
            if (notarySeal.contentType === 'image/png') {
              notarySealImage = await pdfDoc.embedPng(buffer);
            } else if (notarySeal.contentType === 'image/jpeg' || notarySeal.contentType === 'image/jpg') {
              notarySealImage = await pdfDoc.embedJpg(buffer);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error embedding signature/notary assets:', error);
    }

    // Helper functions for drawing
    const drawText = (text: string, x: number, y: number, options: { 
      font?: PDFFont, 
      size?: number,
      color?: [number, number, number],
      align?: 'left' | 'center' | 'right',
      maxWidth?: number
    } = {}) => {
      const { 
        font: textFont = font, 
        size = 10, 
        color = [0, 0, 0], 
        align = 'left',
        maxWidth
      } = options;
      
      const textWidth = textFont.widthOfTextAtSize(text, size);
      let xPosition = x;
      
      if (align === 'center') {
        xPosition = x - (textWidth / 2);
      } else if (align === 'right') {
        xPosition = x - textWidth;
      }
      
      page.drawText(text, {
        x: xPosition,
        y: height - y,
        size,
        font: textFont,
        color: rgb(color[0], color[1], color[2]),
        maxWidth
      });
    };

    const drawLine = (startX: number, startY: number, endX: number, endY: number, thickness: number = 1) => {
      page.drawLine({
        start: { x: startX, y: height - startY },
        end: { x: endX, y: height - endY },
        thickness,
        color: rgb(0, 0, 0)
      });
    };

    const drawRect = (x: number, y: number, rectWidth: number, rectHeight: number, options: {
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
      
      page.drawRectangle({
        x,
        y: height - y - rectHeight,
        width: rectWidth,
        height: rectHeight,
        color: fill ? rgb(color[0], color[1], color[2]) : undefined,
        borderColor: borderWidth > 0 ? rgb(borderColor[0], borderColor[1], borderColor[2]) : undefined,
        borderWidth: borderWidth > 0 ? borderWidth : undefined
      });
    };

    // Extract container numbers and seals from BOL
    const containers: Array<{containerNumber: string, sealNumber: string}> = [];
    
    if (bolDocument.items && bolDocument.items.length > 0) {
      bolDocument.items.forEach((item: any) => {
        containers.push({
          containerNumber: item.containerNumber,
          sealNumber: item.seal
        });
      });
    }

    // Extract unique product descriptions
    const uniqueProducts = new Set<string>();
    
    if (bolDocument.items && bolDocument.items.length > 0) {
      bolDocument.items.forEach((item: any) => {
        if (item.description) {
          uniqueProducts.add(item.description);
        }
      });
    }
    
    // Get authenticated user's name
    const userName = session.user?.name || 'Authorized Representative';

    // Draw header
    drawDocumentHeader(
      page,
      { font, boldFont },
      { width, height, margin, contentWidth },
      { formattedBusinessDay, logoImage },
      { drawText, drawLine }
    );

    // Draw body content
    const currentY = drawDocumentBody(
      page,
      { font, boldFont, italicFont },
      { width, height, margin, contentWidth },
      { client, bolDocument, containers, uniqueProducts },
      { drawText, drawLine, drawRect }
    );

    // Draw signature and notary
    drawSignatureAndNotary(
      page,
      { font, boldFont, italicFont },
      { width, height, margin, contentWidth },
      { 
        currentY, 
        signatureImage, 
        notarySignatureImage, 
        notarySealImage, 
        businessDateObj,
        userName
      },
      { drawText, drawLine, drawRect, getOrdinalSuffix }
    );

    // Draw footer
    drawDocumentFooter(
      page,
      { font },
      { width, height, margin, contentWidth },
      { drawText, drawLine }
    );

    // Save the PDF
    const pdfBytes = await pdfDoc.save()

    // Connect to GridFS
    if (!mongoose.connection.db) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
    }
    
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'documents'
    })

    // Generate filename with BOL number
    const fileName = `${bolDocument.bolData?.bolNumber || client.name.replace(/\s+/g, '_')}-COO.pdf`

    // Upload the file to GridFS
    const uploadStream = bucket.openUploadStream(fileName, {
      contentType: 'application/pdf',
      metadata: {
        bolId: bolDocument._id
      }
    })

    // Convert Uint8Array to Buffer and upload
    const buffer = Buffer.from(pdfBytes)
    await new Promise((resolve, reject) => {
      const readStream = require('stream').Readable.from(buffer)
      readStream
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve)
    })

    // Create a new document record
    const newDocument = await Document.create({
      clientId: client._id,
      fileName,
      fileId: uploadStream.id,
      type: 'COO',
      relatedBolId: bolDocument._id,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    return NextResponse.json({
      document: {
        _id: newDocument._id,
        fileName: newDocument.fileName,
        type: newDocument.type
      }
    })
  } catch (error) {
    console.error('Error generating Certificate of Origin:', error)
    return NextResponse.json(
      { error: 'Error generating Certificate of Origin' },
      { status: 500 }
    )
  }
}