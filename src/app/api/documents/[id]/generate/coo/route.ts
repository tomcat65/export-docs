import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import { Asset } from '@/models/Asset'
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFImage, PDFFont } from 'pdf-lib'
import mongoose, { Types } from 'mongoose'
import fs from 'fs'
import path from 'path'
import { GridFSBucket } from 'mongodb'
import { Readable } from 'stream'

// Helper function to extract product name from description
function extractProductName(description: string): string {
  if (!description) return '';
  
  // Even more aggressively remove packaging info patterns
  const cleanedDesc = description
    // First remove common quantity + packaging patterns
    .replace(/^\d+\s+(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|CONTAINER|BULK|TOTE)s?\s+/i, '')
    // Then remove standalone packaging words (without quantities)
    .replace(/^(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|CONTAINER|BULK|TOTE)s?\s+/i, '')
    // Strip any remaining numeric prefixes that might be part of packaging (e.g. "1 Base Oil")
    .replace(/^\d+\s+/, '')
    // Remove any "X" that might appear at the beginning (sometimes used as a count)
    .replace(/^X\s+/i, '')
    .trim();
  
  console.log(`COO extractProductName transform: "${description}" -> "${cleanedDesc}"`);
  return cleanedDesc;
}

interface GenerateRequest {
  mode?: 'overwrite' | 'new'
  customDate?: string // Allow custom date to be provided
  showSection?: 'header' | 'body' | 'footer' | null
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
  notaryPlace:{
    city: string;
    county: string;
    state: string;
  };
  notaryDate: {
    day: string;
    month: string;
    year: string;
  };
 
}
// Near the top of your route handler function
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
): number {
  // DEBUG - Log the date being used in the header
  console.log("🔍 HEADER FUNCTION date parameter:", date);
  
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
  console.log("🔴 CRITICAL FIX - Using provided date:", date);
  
  // The date parameter is already formatted, display it directly
  page.drawText(date, {
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
  // Add safety checks to handle empty product names
  const productNameTrimmed = (data.productName || '').trim();
  console.log("Raw product name before formatting:", productNameTrimmed);
  
  // Check if the product name still contains packaging info and remove it
  // Here we guarantee that no packaging info remains in the product name
  const cleanedProductName = extractProductName(productNameTrimmed);
  console.log("Product name after removing packaging:", cleanedProductName);
  
  // Ensure all packaging references are removed before formatting
  const formattedProductName = cleanedProductName
    ? cleanedProductName
        .replace(/base oil group ii/i, 'Base Oil Group II,')
        .replace(/600n/i, '600N')
        .replace(/(\d+)n/i, '$1N') // Generic replacement for any number followed by 'N'
        .toUpperCase()
    : "[NO PRODUCT NAME FOUND]"; // Default text if no product name is available
  
  console.log("Formatted product name for document:", formattedProductName);
  
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
  const certText = "In accordance with the above mentioned shipment we certify that the above goods are of";
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
  return currentY - lineHeight * 0.8; // Reduced spacing to bring "Yours faithfully" closer
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
  
  // Start with "Yours faithfully" text - position closer to USA ORIGIN
  let currentY = yStart - 10; // Reduced from 20 to 10 to bring it closer
  
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
    const baseSignatureWidth = 150;
    const baseSignatureHeight = 50;
    // Compress horizontally by 3% and expand vertically by 3%
    const signatureWidth = baseSignatureWidth * 0.97; // 3% narrower
    const signatureHeight = baseSignatureHeight * 1.03; // 3% taller
    
    // Store the signature position for line positioning
    const signatureY = currentY - signatureHeight + 20;
    
    page.drawImage(data.signatureImage, {
      x: 50,
      y: signatureY,
      width: signatureWidth,
      height: signatureHeight
    });
    
    // Draw a line under the signature that slightly overlaps with it
    // The line is moved up by 5 points to overlap with the bottom of the signature
    const lineY = signatureY + 5; // Move line up by positioning it at signature bottom + 5
    
    page.drawLine({
      start: { x: 50, y: lineY },
      end: { x: 230, y: lineY }, // Extended from 200 to 230
      thickness: 1,
      color: rgb(0, 0, 0)
    });
    
    // Update currentY to continue with the rest of the content
    currentY = lineY - compactLineHeight;
  } else {
    // If no signature image, just draw the line
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: 230, y: currentY },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
    currentY -= compactLineHeight;
  }
  
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
  
  // Use the company name properly
  page.drawText(data.signatoryCompany, {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.bold
  });
  currentY -= compactLineHeight;
  
  // Address
  page.drawText(data.signatoryAddress, {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  currentY -= compactLineHeight * 0.9; // Reduce spacing by 10%
  
  // Contact information
  page.drawText(data.signatoryContact, {
    x: 50,
    y: currentY,
    size: 10,
    font: fonts.regular
  });
  
  return currentY - lineHeight * 4; // Increased from 2.5 to 4 to create more space before footer
}

function drawDocumentFooter(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
  },
  yStart: number,
  data: NotaryFooterData,
  userName: string
) {
  const { width } = page.getSize();
  const margin = 50; // Set margin to match other sections
  let currentY = yStart; // Start from the yStart position
  const lineHeight = 14; // Define lineHeight constant to match other sections
  
  // Helper function for ordinal suffixes
  const getOrdinalSuffix = (n: number): string => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  
  // Start the footer section - position properly
  let footerCurrentY = 115;
  
  // City, County, State on a single line at the bottom of the page
  page.drawText("CITY: Houston", {
    x: 55,
    y: footerCurrentY,
    size: 10,
    font: fonts.regular
  });
  
  page.drawText("COUNTY: Harris", {
    x: 260,
    y: footerCurrentY,
    size: 10,
    font: fonts.regular
  });
  
  page.drawText("STATE: TX", {
    x: 470,
    y: footerCurrentY,
    size: 10,
    font: fonts.regular
  });
  
  // Add proper spacing below the City/County/State line
  const notaryY = footerCurrentY + 14; // Use fixed value of 14 for lineHeight
  
  // Draw notary seal on the left side
  if (data.notarySealImage) {
    const sealWidth = 96;
    const sealHeight = 46;
    
    page.drawImage(data.notarySealImage, {
      x: Math.floor(Math.random() * (350 - 325 + 1)) + 325,
      y: 20,
      width: sealWidth,
      height: sealHeight
    });
  }
  
  // Draw notary signature on the right side
  if (data.notarySignatureImage) {
    const notarySignatureWidth = 130;
    const notarySignatureHeight = 45;
    
    page.drawImage(data.notarySignatureImage, {
      x: 450,
      y: Math.floor(Math.random() * (35 - 25 + 1)) + 25,
      width: notarySignatureWidth,
      height: notarySignatureHeight
    });
  } else {
    // If no signature image, just write the name
    page.drawText('Notary Signature', {
      x: 450,
      y: 35,
      size: 10,
      font: fonts.regular
    });
  }
  
   

  // Notary text to be positioned in the middle section  
  page.drawText("On this", {
    x: 53,
    y: 95,
    size: 10,
    font: fonts.regular
  });
  
  // Notary date and seal section
  
  
  // CRITICAL FIX: Use the notaryDate from data parameter instead of a new Date()
  console.log("🔴 NOTARY SECTION - Using provided date:", data.notaryDate);
  
  // Extract the date components from the provided notaryDate
  const day = parseInt(data.notaryDate.day.match(/\d+/)?.[0] || "1", 10);
  const month = data.notaryDate.month;
  const year = data.notaryDate.year;
  
  // Text for the notary date line with the correct spacing
  page.drawText(`${day}${getOrdinalSuffix(day)}    day of    ${month}, ${year},`, {
    x: 100,
    y: 95,
    size: 10,
    font: fonts.regular
  })
  
  page.drawText("personally appeared before me,", {
    x: 290,
    y: 95,
    size: 10,
    font: fonts.regular
  });
  // Second line of text (personally appeared before me)
  page.drawText(userName, {
    x: 445,
    y: 95,
    size: 10,
    font: fonts.regular
  });

  
  
  page.drawText("doing business at,", {
    x: 53,
    y: 83,
    size: 10,
    font: fonts.regular
  });
  
 

  page.drawText("4743 Merwin St, Houston TX 77027", {
    x: 140,
    y: 83,
    size: 10,
    font: fonts.regular
  });

  page.drawText("personally known or sufficiently identified to me,", {
    x: 320,
    y: 83,
    size: 10,
    font: fonts.regular
  });

  page.drawText("who certifies that     he      is", {
    x: 53,
    y: 71,
    size: 10,
    font: fonts.regular
  });
  // Add the remaining text lines below
  page.drawText("(is) (are) the individual(s) who executed the foregoing instrument and", {
    x: 220,
    y: 71,
    size: 10,
    font: fonts.regular
  });
  
  page.drawText("acknowledge it to be of free act and deed.", {
    x: 53,
    y: 59,
    size: 10,
    font: fonts.regular
  });
  
  return notaryY + 20; // Return proper position for the end of the document
}

async function loadAssetImage(bucket: mongoose.mongo.GridFSBucket, filename: string): Promise<Buffer | null> {
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
    
    // Get authenticated user's name
    const userName = session?.user?.name || 'Authorized Representative'
    
    // Debug logs
    console.log("Session user:", {
      id: session?.user?.id,
      name: session?.user?.name,
      email: session?.user?.email,
      isAdmin: session?.user?.isAdmin
    });
    console.log("Using userName value:", userName);

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
    let bolDocument = await Document.findById(id)
      .populate('bolData') // Ensure we fully populate the BOL data
    
    if (!bolDocument || bolDocument.type !== 'BOL') {
      return NextResponse.json({ error: 'BOL document not found' }, { status: 404 })
    }

    // Try to get the BOL date directly from the document, then from bolData relationship,
    // and finally try a direct query as a last resort
    let dateOfIssue = bolDocument.dateOfIssue || (bolDocument.bolData && bolDocument.bolData.dateOfIssue);
    
    // If we still don't have a date, try to look it up separately
    if (!dateOfIssue && bolDocument.bolData && bolDocument.bolData.bolNumber) {
      try {
        // Get BolData model
        const BolData = mongoose.models.BolData || mongoose.model('BolData', new mongoose.Schema({}));
        
        // Query for the latest BOL data with this number
        const latestBolData = await BolData.findOne({ 
          bolNumber: bolDocument.bolData.bolNumber 
        });
        
        if (latestBolData && latestBolData.dateOfIssue) {
          dateOfIssue = latestBolData.dateOfIssue;
          console.log("Found BOL date from separate query:", dateOfIssue);
          
          // Update the document in memory for consistency
          if (bolDocument.bolData) {
            bolDocument.bolData.dateOfIssue = dateOfIssue;
          }
        }
      } catch (error) {
        console.error("Error fetching latest BOL data:", error);
      }
    }

    // Log the BOL document details for debugging
    console.log('Found BOL document:', {
      id: bolDocument._id,
      hasDateOfIssue: !!(bolDocument.bolData && bolDocument.bolData.dateOfIssue),
      dateOfIssue: (bolDocument.bolData && bolDocument.bolData.dateOfIssue) || 'NOT SET',
      bolNumber: (bolDocument.bolData && bolDocument.bolData.bolNumber) || 'NOT SET',
      manuallyFoundDate: dateOfIssue || 'NONE'
    });

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

    // Debug logging for enhanced clarity
    console.log("==================== COO DATE DIAGNOSTIC ====================");
    console.log("RAW bolDocument:", {
      hasDateOfIssue: !!bolDocument.dateOfIssue,
      dateOfIssue: bolDocument.dateOfIssue || "NOT SET",
      hasBolData: !!bolDocument.bolData,
      bolDataDateOfIssue: bolDocument.bolData?.dateOfIssue || "NOT SET",
      bolNumber: bolDocument.bolData?.bolNumber || "NOT SET"
    });
    
    // IMPORTANT: USE DIRECT DATE APPROACH LIKE THE PACKING LIST
    // Instead of using any complex logic that might be failing,
    // use the exact same approach that works in the packing list:
    // Simple direct reference to bolDocument.bolData.dateOfIssue
    
    let businessDateObj: Date;
    let dateSource: string;
    
    try {
      if (bolDocument.bolData?.dateOfIssue) {
        businessDateObj = new Date(bolDocument.bolData.dateOfIssue);
        dateSource = "BOL.bolData.dateOfIssue";
        console.log("👉 DIRECT ACCESS: Using bolDocument.bolData.dateOfIssue:", 
          bolDocument.bolData.dateOfIssue,
          "→", businessDateObj.toISOString());
      } else if (customDate) {
        businessDateObj = new Date(customDate);
        dateSource = "Custom date";
        console.log("Using custom date:", customDate);
      } else {
        // CRITICAL! Force use of BOL's date, even if null to ensure we're not using today by default
        console.log("⚠️ WARNING: No BOL date found, checking for backups...");
        
        // Additional fallback to other sources in bolDocument
        if (bolDocument.dateOfIssue) {
          businessDateObj = new Date(bolDocument.dateOfIssue);
          dateSource = "bolDocument.dateOfIssue (fallback)";
          console.log("Using fallback date from bolDocument.dateOfIssue:", bolDocument.dateOfIssue);
        } else {
          // Only use today's date if absolutely necessary
          console.log("❌ CRITICAL: No date available from BOL, using today's date as a last resort");
          businessDateObj = new Date();
          dateSource = "Current date (no BOL date)";
        }
      }
      
      // Validate the date is valid
      if (isNaN(businessDateObj.getTime())) {
        console.warn("Invalid date detected, resetting to current date");
        businessDateObj = new Date();
        dateSource = "Current date (invalid date)";
      }
    } catch (error) {
      // If any date parsing fails, use current date as fallback
      console.error("Date parsing error:", error);
      businessDateObj = new Date();
      dateSource = "Current date (parsing error)";
    }
    
    console.log("Date to be used for COO:", {
      source: dateSource,
      dateString: businessDateObj.toString(),
      isoString: businessDateObj.toISOString(),
      year: businessDateObj.getFullYear(),
      month: businessDateObj.getMonth() + 1,
      day: businessDateObj.getDate()
    });

    // Debug: Compare current date with the BOL date
    const now = new Date();
    console.log("Current date comparison:", {
      now: now.toISOString(),
      bolDate: businessDateObj.toISOString(),
      isPastDate: businessDateObj < now ? "yes - BOL date is in the past" : "no - BOL date is not in the past",
      daysDifference: Math.floor((businessDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    });

    // Get the next business day (excluding weekends)
    const getNextBusinessDay = (date: Date): Date => {
      // Force a copy to ensure we don't modify the original date
      console.log("🔄 getNextBusinessDay input date:", date.toISOString(), "source:", dateSource);
      
      // We intentionally use the BOL date even if it's in the future
      // This ensures consistent behavior for all documents
      const result = new Date(date.getTime()); // Create a proper copy
      result.setDate(result.getDate() + 1);
      
      // If it's a weekend (0 = Sunday, 6 = Saturday), adjust to the next business day
      if (result.getDay() === 0) { // Sunday
        result.setDate(result.getDate() + 1); // Move to Monday
      } else if (result.getDay() === 6) { // Saturday
        result.setDate(result.getDate() + 2); // Move to Monday
      }
      
      console.log("✅ getNextBusinessDay output date:", result.toISOString());
      return result;
    };
    
    // Update businessDateObj to the next business day
    businessDateObj = getNextBusinessDay(businessDateObj);
    console.log("Next business day:", {
      date: businessDateObj.toISOString(),
      year: businessDateObj.getFullYear(),
      month: businessDateObj.getMonth() + 1, 
      day: businessDateObj.getDate(),
      weekday: businessDateObj.getDay(),
      source: dateSource,
      isFutureDate: businessDateObj > now ? "yes" : "no"
    });

    const formatDateFormal = (date: Date): string => {
      console.log("📅 formatDateFormal input date:", date.toISOString(), "source:", dateSource);
      
      const day = date.getDate();
      const month = date.toLocaleString('default', { month: 'long' });
      const year = date.getFullYear();
      // Day of week is no longer needed
      // const dayOfWeek = date.toLocaleString('default', { weekday: 'long' });

      const getOrdinalSuffix = (n: number): string => {
        if (n > 3 && n < 21) return 'th';
        switch (n % 10) {
          case 1: return 'st';
          case 2: return 'nd';
          case 3: return 'rd';
          default: return 'th';
        }
      };

      // New format: "Month, Day Year" (e.g., "December, 26th 2025")
      const formatted = `${month}, ${day}${getOrdinalSuffix(day)} ${year}`;
      console.log("🔤 formatDateFormal result:", formatted);
      return formatted;
    };

    // Store the formatted date for consistent use throughout the document
    const formattedBusinessDay = formatDateFormal(businessDateObj);
    console.log("📝 FINAL DATE TO BE USED IN COO:", formattedBusinessDay);
    
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
      console.log("BOL Document items dump:", JSON.stringify(bolDocument.items, null, 2));
      
      bolDocument.items.forEach((item: any) => {
        containers.push({
          containerNumber: item.containerNumber,
          sealNumber: item.seal
        });
      });
    } else {
      console.log("No items found in bolDocument or empty array");
    }

    // Extract unique product descriptions
    const uniqueProducts = new Set<string>();
    const productDebugInfo: any[] = [];
    
    if (bolDocument.items && bolDocument.items.length > 0) {
      bolDocument.items.forEach((item: any, index: number) => {
        // Debug information
        productDebugInfo.push({
          index,
          hasProduct: !!item.product,
          product: item.product,
          hasDescription: !!item.description,
          description: item.description,
          packaging: item.packaging,
          packagingQuantity: item.packagingQuantity
        });
        
        // First try to use the dedicated product field
        if (item.product && typeof item.product === 'string' && item.product.trim() !== '') {
          // Clean up the product field before adding to the set
          const cleanedProduct = extractProductName(item.product.trim());
          uniqueProducts.add(cleanedProduct);
        } 
        // If product field doesn't exist or is empty, extract product from description
        else if (item.description && typeof item.description === 'string' && item.description.trim() !== '') {
          const extractedProduct = extractProductName(item.description);
          uniqueProducts.add(extractedProduct);
        }
      });
    }
    
    console.log("Product extraction debug info:", JSON.stringify(productDebugInfo, null, 2));
    console.log("Extracted unique products:", JSON.stringify(Array.from(uniqueProducts), null, 2));
    
    // Get authenticated user's name
    

    let y = 0;
    
    // Check if we're rendering a specific section or the full document
    if (showSection) {
      // We're only showing a specific section
      switch (showSection) {
        case 'header':
          // Draw only the header section
          console.log("🛑 BEFORE DRAWING DOCUMENT HEADER, date to use:", formattedBusinessDay, "source:", dateSource);
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
          console.log("✅ AFTER DRAWING DOCUMENT HEADER");
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
              productName: uniqueProducts.size > 0 ? extractProductName(Array.from(uniqueProducts)[0]) : '',
              portOfLoading: bolDocument.bolData?.portOfLoading || '',
              portOfDischarge: bolDocument.bolData?.portOfDischarge || ''
            }
          );
          
          // Log the product name being used
          const cleanedBodyProductName = uniqueProducts.size > 0 ? extractProductName(Array.from(uniqueProducts)[0]) : '';
          console.log("Product name used for section 'body':", cleanedBodyProductName || '[EMPTY]');
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
      
      // Get a cleaned product name for use throughout the document
      const cleanedDocProductName = uniqueProducts.size > 0 ? extractProductName(Array.from(uniqueProducts)[0]) : '';
      console.log("Cleaned product name for full document:", cleanedDocProductName);
      
      // Draw header
      console.log("🛑 BEFORE DRAWING DOCUMENT HEADER, date to use:", formattedBusinessDay, "source:", dateSource);
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
      console.log("✅ AFTER DRAWING DOCUMENT HEADER");
      
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
          productName: cleanedDocProductName,
          portOfLoading: bolDocument.bolData?.portOfLoading || '',
          portOfDischarge: bolDocument.bolData?.portOfDischarge || ''
        }
      );
      
      // Log the product name being used in the complete document
      const selectedProductName = cleanedDocProductName;
      const finalProductName = extractProductName(selectedProductName); // Extra cleanup to be sure
      console.log("Product name used in complete document:", finalProductName || '[EMPTY]');
      
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

      // Draw footer with notary information and authenticated user's name
      const footerY = drawDocumentFooter(
        page,
        pdfDoc,
        fonts,
        signatureY,
        {
          notarySignatureImage,
          notarySealImage,
          notaryPlace: {
            city: 'Houston',
            county: 'Harris',
            state: 'Texas',
          },
          notaryDate: {
            day: businessDateObj.getDate().toString(),
            month: businessDateObj.toLocaleString('default', { month: 'long' }),
            year: businessDateObj.getFullYear().toString()
          },
          
        },
        userName
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

    // Generate filename with BOL number - updated format
    const bolNumber = bolDocument.bolData?.bolNumber || 'UNKNOWN_BOL';
    const fileName = `COO_${bolNumber}.pdf`;
    console.log(`Using filename: ${fileName}`);

    // Upload the file to GridFS
    const uploadStream = bucket.openUploadStream(fileName, {
      contentType: 'application/pdf',
      metadata: {
        bolId: bolDocument._id,
        clientId: client._id,
        contentType: 'application/pdf',
        uploadedBy: session.user?.email,
        uploadedAt: new Date().toISOString(),
        fileName: fileName
      }
    })

    console.log('Starting GridFS upload for file:', {
      fileName,
      streamId: uploadStream.id,
      metadata: uploadStream.options.metadata
    })

    // Convert Uint8Array to Buffer and upload
    const buffer = Buffer.from(pdfBytes)
    try {
      await new Promise((resolve, reject) => {
        const readStream = Readable.from(buffer)
        
        // Add error handling for the read stream
        readStream.on('error', (error: Error) => {
          console.error('Error in read stream:', error)
          reject(error)
        })
        
        // Add error and finish handlers for the upload stream
        uploadStream.on('error', (error: Error) => {
          console.error('Error in GridFS upload stream:', error)
          reject(error)
        })
        
        uploadStream.on('finish', () => {
          console.log('GridFS upload completed successfully:', {
            fileId: uploadStream.id,
            fileName,
            length: buffer.length
          })
          resolve(uploadStream.id)
        })
        
        readStream.pipe(uploadStream)
      })

      // Verify the file was uploaded
      const uploadedFile = await bucket.find({ _id: uploadStream.id }).next()
      if (!uploadedFile) {
        throw new Error('File not found in GridFS after upload')
      }
      
      console.log('Verified file in GridFS:', {
        fileId: uploadedFile._id,
        fileName: uploadedFile.filename,
        length: uploadedFile.length
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

      // Debug the notary date that will appear in the document
      console.log("📌 NOTARY DATE IN DOCUMENT:", {
        day: businessDateObj.getDate().toString(),
        month: businessDateObj.toLocaleString('default', { month: 'long' }),
        year: businessDateObj.getFullYear().toString(),
        originalDate: bolDocument.bolData?.dateOfIssue || "[NO BOL DATE]"
      });

      return NextResponse.json({
        document: {
          _id: newDocument._id,
          fileName: newDocument.fileName,
          type: newDocument.type
        }
      })
    } catch (error) {
      console.error('Error during file upload process:', error)
      
      // Try to clean up any partial uploads
      try {
        await bucket.delete(uploadStream.id)
        console.log('Cleaned up partial upload:', uploadStream.id)
      } catch (cleanupError) {
        console.error('Error cleaning up partial upload:', cleanupError)
      }
      
      throw error // Re-throw to be caught by the outer try-catch
    }
  } catch (error) {
    console.error('Error generating Certificate of Origin:', error)
    return NextResponse.json(
      { error: 'Error generating Certificate of Origin' },
      { status: 500 }
    )
  }
}