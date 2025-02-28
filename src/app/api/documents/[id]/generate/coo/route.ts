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

interface SignatureSectionData {
  signatureImage: PDFImage | undefined;
  signatoryName: string;
  signatoryTitle: string;
  signatoryCompany: string;
  signatoryAddress: string;
  signatoryContact: string;
}

interface NotaryFooterData {
  notarySignatureImage: PDFImage | undefined;
  notarySealImage: PDFImage | undefined;
  notaryDate: {
    city: string;
    county: string;
    state: string;
    day: string;
    month: string;
    year: string;
  };
  notaryInfo: {
    name: string;
    id: string;
    expirationDate: string;
  };
}

// Fix the logo in drawDocumentHeader
function drawDocumentHeader(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  },
  logoImage: PDFImage | undefined,
  date: string,
  clientData: {
    name: string;
    address: string[];
    taxId: string;
  }
) {
  const { width, height } = page.getSize();
  
  // Logo section - adjust size to 80% of the current size
  if (logoImage) {
    // Get logo dimensions
    const originalWidth = logoImage.width;
    const originalHeight = logoImage.height;
    
    // Set width to 80% of the previous 125px value (= 100px)
    const logoWidth = 100; // Reduced to 80% of 125px
    const logoHeight = (logoWidth / originalWidth) * originalHeight;
    
    page.drawImage(logoImage, {
      x: 50,
      y: height - 95, // Keeping the same position
      width: logoWidth,
      height: logoHeight
    });
  }
  
  // Date - format to match the sample (November 01, 2024)
  const dateObj = new Date();
  const month = dateObj.toLocaleString('en-US', { month: 'long' });
  const day = dateObj.getDate().toString().padStart(2, '0');
  const year = dateObj.getFullYear();
  const formattedDate = `${month} ${day}, ${year}`;
  
  page.drawText(formattedDate, {
    x: 50,
    y: height - 115,
    size: 10,
    font: fonts.regular
  });
  
  // Title centered with proper spacing and font
  const title = "CERTIFICATE OF ORIGIN";
  const titleWidth = fonts.bold.widthOfTextAtSize(title, 16);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 135,
    size: 16,
    font: fonts.bold
  });
  
  return height - 160; // Return Y coordinate for next section
}

// Adjust the spacing in drawDocumentBody
function drawDocumentBody(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  },
  yStart: number,
  data: {
    buyerName: string;
    buyerAddress: string[];
    buyerTaxId: string;
    bolNumber: string;
    vesselName: string;
    voyageNumber: string;
    containers: Array<{containerNumber: string, sealNumber: string}>;
    productName: string;
    portOfLoading: string;
    portOfDischarge: string;
  }
) {
  const { width } = page.getSize()
  const margin = 50
  const contentWidth = width - (margin * 2)
  const lineHeight = 14
  const compactLineHeight = 12 // For smaller spacing in some sections
  
  let currentY = yStart

  // Section title - Buyer
  page.drawText('BUYER:', {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.bold
  })
  currentY -= lineHeight * 1.2

  // First line: Company name with C.A.
  page.drawText(`${data.buyerName}, C.A.`, {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.regular
  })
  currentY -= lineHeight

  // Get the full address as string
  const fullAddressText = data.buyerAddress.join(", ");
  
  // Find a natural break point for the address (ideally around the middle)
  const splitPoint = Math.floor(fullAddressText.length / 2);
  
  // Find a comma near the midpoint for a clean break
  let breakIndex = fullAddressText.indexOf(',', splitPoint - 10);
  if (breakIndex === -1 || breakIndex > splitPoint + 20) {
    // If no comma found near midpoint, or it's too far, look for a space
    breakIndex = fullAddressText.indexOf(' ', splitPoint);
  }
  
  // Fallback if no good split point found
  if (breakIndex === -1) {
    breakIndex = splitPoint;
  }
  
  // Create the two address lines
  const addressLine1 = fullAddressText.substring(0, breakIndex + 1).trim();
  const addressLine2 = fullAddressText.substring(breakIndex + 1).trim();
  
  // Second line: First part of address
  page.drawText(addressLine1, {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.regular
  })
  currentY -= lineHeight
  
  // Third line: Second part of address
  page.drawText(addressLine2, {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.regular
  })
  currentY -= lineHeight
  
  // Fourth line: RIF number
  page.drawText(`RIF ${data.buyerTaxId}`, {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.regular
  })
  currentY -= lineHeight * 2 // Keep the same total spacing after buyer info

  // Maritime Booking Section
  page.drawText("Maritime Booking:", {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.bold
  })
  currentY -= lineHeight
  
  // BOL Number with proper alignment
  if (data.bolNumber) {
    page.drawText("BOL Number:", {
      x: margin,
      y: currentY,
      size: 10,
      font: fonts.bold
    });
    
    page.drawText(data.bolNumber, {
      x: margin + 130,
      y: currentY,
      size: 10,
      font: fonts.regular
    });
    currentY -= lineHeight
  }
  
  // Container vessel with proper alignment
  if (data.vesselName) {
    page.drawText("Container vessel:", {
      x: margin,
      y: currentY,
      size: 10,
      font: fonts.bold
    });
    
    page.drawText(`${data.vesselName}${data.voyageNumber ? ' / Voyage ' + data.voyageNumber : ''}`, {
      x: margin + 130,
      y: currentY,
      size: 10,
      font: fonts.regular
    });
    currentY -= lineHeight
  }
  
  // Containers and Seals - improved table format with smaller spacing
  if (data.containers.length > 0) {
    page.drawText("Containers and Seals:", {
      x: margin,
      y: currentY,
      size: 10,
      font: fonts.bold
    });
    currentY -= compactLineHeight
    
    // Create a proper table with two columns
    // Table headers with proper formatting and alignment
    const containerLabel = "Container";
    const sealLabel = "Load seal";
    
    // Create container column
    const containerX = margin + 80;
    page.drawText(containerLabel, {
      x: containerX,
      y: currentY,
      size: 10, // Reduced font size
      font: fonts.bold
    });
    
    // Create seal column
    const sealX = margin + 280;
    page.drawText(sealLabel, {
      x: sealX,
      y: currentY,
      size: 10, // Reduced font size
      font: fonts.bold
    });
    currentY -= compactLineHeight
    
    // Container rows with better alignment and smaller spacing
    for (const container of data.containers) {
      page.drawText(container.containerNumber, {
        x: containerX,
        y: currentY,
        size: 10, // Reduced font size
        font: fonts.regular
      });
      
      page.drawText(container.sealNumber, {
        x: sealX,
        y: currentY,
        size: 10, // Reduced font size
        font: fonts.regular
      });
      currentY -= compactLineHeight // Using compact line height
    }
  }
  
  // Product and Ports info
  currentY -= lineHeight
  
  // Product name
  page.drawText("Product name:", {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.bold
  });
  
  // Format product name to match sample (Base Oil Group II, ARAMCO PRIMA 600N)
  const formattedProductName = data.productName
    .replace(/flexi tank/i, '')
    .replace(/base oil group ii/i, 'Base Oil Group II,')
    .replace(/600n/i, '600N')
    .toUpperCase();
  
  page.drawText(formattedProductName, {
    x: margin + 130,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY -= lineHeight
  
  // Port of loading with "/ USA" added to match sample
  page.drawText("Port of loading:", {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.bold
  });
  
  page.drawText(data.portOfLoading + " / USA", {
    x: margin + 130,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY -= lineHeight
  
  // Port of discharge with "/ Venezuela" added to match sample
  page.drawText("Port of discharge:", {
    x: margin,
    y: currentY,
    size: 10,
    font: fonts.bold
  });
  
  page.drawText(data.portOfDischarge + " / Venezuela", {
    x: margin + 130,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY -= lineHeight
  
  // Add more space between Port of discharge and certification text
  currentY -= lineHeight
  
  // Certification text
  const certText = "In accordance with the above mentioned shipment we certify that above goods are of";
  const certTextWidth = fonts.regular.widthOfTextAtSize(certText, 10);
  page.drawText(certText, {
    x: (width - certTextWidth) / 2,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  // Add more space between certification text and USA ORIGIN
  currentY -= lineHeight * 1.5
  
  // U.S.A. ORIGIN text - reduced size
  const originText = "U.S.A. ORIGIN";
  const originTextWidth = fonts.bold.widthOfTextAtSize(originText, 20); // Reduced from 22 to 20
  page.drawText(originText, {
    x: (width - originTextWidth) / 2,
    y: currentY,
    size: 20, // Reduced from 22
    font: fonts.bold
  });
  
  // Return a larger spacing after the U.S.A. ORIGIN text
  return currentY - lineHeight * 1.5; // Increased spacing to lower "Yours faithfully"
}

// Fix the signature section to properly position elements and match the sample
function drawSignatureSection(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  },
  yStart: number,
  data: SignatureSectionData
) {
  const lineHeight = 14;
  const compactLineHeight = 12; // Smaller line height for signature block
  
  // Start with "Yours faithfully" text - position similar to sample but lowered
  let currentY = yStart - 20; // Increased from 10 to 20 to lower it further
  
  page.drawText("Yours faithfully,", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  // Add more space between "Yours faithfully" and signature
  currentY -= compactLineHeight * 3; // Increased from 1.5 to 3 to lower the signature more
  
  // Signature image with proper positioning
  if (data.signatureImage) {
    const signatureWidth = 150;
    const signatureHeight = 50;
    page.drawImage(data.signatureImage, {
      x: 50,
      y: currentY - signatureHeight + 20,
      width: signatureWidth,
      height: signatureHeight
    });
    currentY -= signatureHeight - 10;
  }
  
  // Draw a line under the signature - extend it slightly to match sample
  page.drawLine({
    start: { x: 50, y: currentY },
    end: { x: 230, y: currentY }, // Extended from 200 to 230
    thickness: 1,
    color: rgb(0, 0, 0)
  });
  currentY -= compactLineHeight;
  
  // Name with comma separator to match sample
  page.drawText(data.signatoryName + ",", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY -= compactLineHeight;
  
  // Title on its own line
  page.drawText("Vicepresident Latin America", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY -= compactLineHeight;
  
  // Company name in proper format (not all caps) to match sample
  page.drawText("Texas Worldwide Oil Services LLC", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.bold
  });
  currentY -= compactLineHeight;
  
  // Address
  page.drawText("4743 Merwin St, Houston TX 77027", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY -= compactLineHeight;
  
  // Contact information
  page.drawText("USA Direct +1(713) 309-6637", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  return currentY - lineHeight * 3; // Keep the original spacing to the footer
}

function drawDocumentFooter(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  },
  yStart: number,
  data: NotaryFooterData
) {
  const { width, height } = page.getSize();
  const lineHeight = 14;
  
  // Simplified footer to match the sample's cleaner layout
  let currentY = yStart;
  
  // City, County, State on a single line with proper capitalization
  page.drawText("CITY: Houston", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  page.drawText("COUNTY: Harris", {
    x: 220,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  page.drawText("STATE: TX", {
    x: 390,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY += lineHeight * 1.5;
  
  // Clean date format similar to sample
  page.drawText("On this", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  // Format date to match sample (1st day of November, 2024)
  const dateObj = new Date();
  const day = dateObj.getDate();
  const getOrdinalSuffix = (n: number): string => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  const month = dateObj.toLocaleString('en-US', { month: 'long' });
  const year = dateObj.getFullYear();
  
  page.drawText(`${day}${getOrdinalSuffix(day)} day of ${month}, ${year}`, {
    x: 90,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  page.drawText("personally appeared before me,", {
    x: 340,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY += lineHeight;
  
  // Simplified certification text into two clean lines instead of multiple segments
  page.drawText("who executed the foregoing instrument and", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY += lineHeight;
  
  page.drawText("acknowledge it to be of free act and deed.", {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY += lineHeight * 2;
  
  // Draw notary seal at bottom left - slightly larger to match sample
  if (data.notarySealImage) {
    const sealWidth = 130; // Increased from 120
    const sealHeight = 90; // Increased from 80
    page.drawImage(data.notarySealImage, {
      x: 50,
      y: currentY - sealHeight + 20,
      width: sealWidth,
      height: sealHeight
    });
  }
  
  // Draw notary signature at bottom right - slightly larger to match sample
  if (data.notarySignatureImage) {
    const signatureWidth = 160; // Increased from 150
    const signatureHeight = 65; // Increased from 60
    page.drawImage(data.notarySignatureImage, {
      x: width - signatureWidth - 50,
      y: currentY - signatureHeight + 20,
      width: signatureWidth,
      height: signatureHeight
    });
    
    // Add "(Notary Public)" text under signature to match sample
    page.drawText("(Notary Public)", {
      x: width - 120,
      y: currentY - signatureHeight - 10,
      size: 10,
      font: fonts.regular
    });
  }
  
  return currentY - 80;
}

async function loadAssetImage(bucket: any, filename: string): Promise<Buffer | null> {
  try {
    // Find the file by filename
    const file = await bucket.find({ filename }).next();
    if (!file) {
      console.error(`Asset file ${filename} not found`);
      return null;
    }

    // Download the file
    const chunks: Buffer[] = [];
    const downloadStream = bucket.openDownloadStream(file._id);
    
    for await (const chunk of downloadStream) {
      chunks.push(Buffer.from(chunk));
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error(`Error loading asset ${filename}:`, error);
    return null;
  }
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
    const showSection = body?.showSection // 'header', 'body', 'footer', or null for full document
    
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

    // US Letter size: 8.5 x 11 inches = 612 x 792 points
    const page = pdfDoc.addPage([612, 792])

    // Set page margins (in points)
    const margin = { 
      top: 50,    // Increased from 36 for better spacing
      right: 50,  // Increased from 36 for better spacing
      bottom: 50, // Adjusted from 90 to be consistent
      left: 50    // Increased from 36 for better spacing
    }

    // Calculate usable dimensions
    const width = page.getWidth()        // 612 points
    const height = page.getHeight()      // 792 points
    const contentWidth = width - margin.left - margin.right
    const contentHeight = height - margin.top - margin.bottom

    // Load fonts from StandardFonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    
    const fonts = {
      regular: helveticaFont,
      bold: helveticaBold
    }

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
    const formatDateFormal = (date: Date): string => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dayOfWeek = days[date.getDay()]
      const day = date.getDate()
      const month = date.toLocaleString('default', { month: 'long' })
      const year = date.getFullYear()
      
      const getOrdinalSuffix = (n: number): string => {
        if (n > 3 && n < 21) return 'th'
        switch (n % 10) {
          case 1: return 'st'
          case 2: return 'nd'
          case 3: return 'rd'
          default: return 'th'
        }
      }

      return `${dayOfWeek}, ${day}${getOrdinalSuffix(day)} day of ${month}, ${year}`
    };

    const formattedBusinessDay = formatDateFormal(businessDateObj);
    const businessDayName = businessDateObj.toLocaleString('en-US', { weekday: 'long' });
    const businessMonth = businessDateObj.toLocaleString('en-US', { month: 'long' });
    const businessDay = businessDateObj.getDate();
    const businessYear = businessDateObj.getFullYear();

    // Load logo
    let logoPath;
    try {
      // Try to load the logo from the public directory
      logoPath = path.join(process.cwd(), 'public', 'txwos-logo.png');
      if (!fs.existsSync(logoPath)) {
        console.log('Logo file not found at path:', logoPath);
        logoPath = null;
      }
    } catch (error) {
      console.error('Error checking for logo file:', error);
      logoPath = null;
    }
    
    let logoImage;
    if (logoPath) {
      try {
        const logoBytes = fs.readFileSync(logoPath);
        logoImage = await pdfDoc.embedPng(logoBytes);
      } catch (error) {
        console.error('Error embedding logo:', error);
        logoImage = undefined;
      }
    }

    // Create GridFS bucket for assets
    const assetsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'assets'
    });

    // Load notary signature from assets
    const notarySignatureBuffer = await loadAssetImage(assetsBucket, 'Notary_signature.jpg');
    let notarySignatureImage;
    if (notarySignatureBuffer) {
      notarySignatureImage = await pdfDoc.embedJpg(notarySignatureBuffer);
    }

    // Load signature and notary assets
    let signatureImage, notarySealImage;
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
        font: textFont = fonts.regular, 
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

    let y = 0;
    
    // Check if we're rendering a specific section or the full document
    if (showSection) {
      // We're only showing a specific section
      switch (showSection) {
        case 'header':
          // Draw only the header section
          drawDocumentHeader(
            page,
            pdfDoc,
            fonts,
            logoImage,
            formattedBusinessDay,
            {
              name: client.name,
              address: client.address ? client.address.split('\n') : [],
              taxId: client.rif || ''
            }
          );
          break;
          
        case 'body':
          // Draw only the body section
          drawDocumentBody(
            page,
            pdfDoc,
            fonts,
            height - margin.top, // Start at the top of the page
            {
              buyerName: client.name,
              buyerAddress: client.address ? client.address.split('\n') : [],
              buyerTaxId: client.rif || '',
              bolNumber: bolDocument.bolData?.bolNumber || '',
              vesselName: bolDocument.bolData?.vessel || '',
              voyageNumber: bolDocument.bolData?.voyage || '',
              containers,
              productName: uniqueProducts.size > 0 ? Array.from(uniqueProducts)[0] : '',
              portOfLoading: bolDocument.bolData?.portOfLoading || '',
              portOfDischarge: bolDocument.bolData?.portOfDischarge || ''
            }
          );
          break;
          
        case 'footer':
          // Draw only the footer section
          drawSignatureSection(
            page,
            pdfDoc,
            fonts,
            height - margin.top, // Start at the top of the page
            {
              signatureImage,
              signatoryName: userName,
              signatoryTitle: 'Vicepresident Latin America',
              signatoryCompany: 'Texas Worldwide Oil Services LLC',
              signatoryAddress: '4743 Merwin St, Houston TX 77027',
              signatoryContact: 'USA Direct +1(713) 309-6637'
            }
          );
          break;
      }
    } else {
      // Draw the complete document with all sections
      
      // Draw header
      const headerY = drawDocumentHeader(
        page,
        pdfDoc,
        fonts,
        logoImage,
        formattedBusinessDay,
        {
          name: client.name,
          address: client.address ? client.address.split('\n') : [],
          taxId: client.rif || ''
        }
      );
      
      // Draw body
      const bodyY = drawDocumentBody(
        page,
        pdfDoc,
        fonts,
        headerY,
        {
          buyerName: client.name,
          buyerAddress: client.address ? client.address.split('\n') : [],
          buyerTaxId: client.rif || '',
          bolNumber: bolDocument.bolData?.bolNumber || '',
          vesselName: bolDocument.bolData?.vessel || '',
          voyageNumber: bolDocument.bolData?.voyage || '',
          containers,
          productName: uniqueProducts.size > 0 ? Array.from(uniqueProducts)[0] : '',
          portOfLoading: bolDocument.bolData?.portOfLoading || '',
          portOfDischarge: bolDocument.bolData?.portOfDischarge || ''
        }
      );
      
      // Draw signature section
      const signatureY = drawSignatureSection(
        page,
        pdfDoc,
        fonts,
        bodyY,
        {
          signatureImage,
          signatoryName: userName,
          signatoryTitle: 'Vicepresident Latin America',
          signatoryCompany: 'Texas Worldwide Oil Services LLC',
          signatoryAddress: '4743 Merwin St, Houston TX 77027',
          signatoryContact: 'USA Direct +1(713) 309-6637'
        }
      );

      // Draw footer with notary information
      const footerY = drawDocumentFooter(
        page,
        pdfDoc,
        fonts,
        signatureY,
        {
          notarySignatureImage,
          notarySealImage,
          notaryDate: {
            city: 'Houston',
            county: 'Harris',
            state: 'Texas',
            day: formattedBusinessDay,
            month: businessDateObj.toLocaleString('default', { month: 'long' }),
            year: businessDateObj.getFullYear().toString()
          },
          notaryInfo: {
            name: 'TOMAS ALVAREZ',
            id: '133713739',
            expirationDate: '03/14/2027'
          }
        }
      );
    }

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