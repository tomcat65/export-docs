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

    // Get mode from request (default to 'new')
    const { mode = 'new' }: GenerateRequest = await req.json()

    // If mode is 'new' and there are existing PLs, create a new version
    // If mode is 'overwrite' and there are existing PLs, update the latest one
    let packingListNumber = ''
    if (mode === 'overwrite' && existingPLs.length > 0) {
      // We'll overwrite the latest PL
      packingListNumber = existingPLs[0].packingListData?.documentNumber || `${bolDocument.bolData?.bolNumber}-PL-1`
    } else {
      // Create a new PL with incremented number
      packingListNumber = `${bolDocument.bolData?.bolNumber}-PL-${existingPLs.length + 1}`
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([612, 792]) // Letter size
    const { width, height } = page.getSize()
    
    // Fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    
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

    // Header
    page.drawText('PACKING LIST', {
      x: width / 2 - 80,
      y: height - 80,
      size: 18,
      font: helveticaBold,
    })

    // Document number
    page.drawText(`Document No: ${packingListNumber}`, {
      x: width - 250,
      y: height - 120,
      size: 10,
      font: helveticaFont,
    })

    // Date (use BOL date)
    const bolDate = bolDocument.bolData?.date 
      ? new Date(bolDocument.bolData.date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

    page.drawText(`Date: ${bolDate}`, {
      x: width - 250,
      y: height - 140,
      size: 10,
      font: helveticaFont,
    })

    // Exporter information
    page.drawText('Exporter:', {
      x: 50,
      y: height - 160,
      size: 12,
      font: helveticaBold,
    })

    page.drawText(`${client.name}`, {
      x: 50,
      y: height - 180,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`${client.address?.street || ''}`, {
      x: 50,
      y: height - 195,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`${client.address?.city || ''}, ${client.address?.state || ''} ${client.address?.zip || ''}`, {
      x: 50,
      y: height - 210,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`${client.address?.country || ''}`, {
      x: 50,
      y: height - 225,
      size: 10,
      font: helveticaFont,
    })

    // Importer information
    page.drawText('Importer:', {
      x: width / 2,
      y: height - 160,
      size: 12,
      font: helveticaBold,
    })

    const importerName = bolDocument.bolData?.consignee?.name || ''
    const importerAddress = bolDocument.bolData?.consignee?.address || ''
    
    page.drawText(importerName, {
      x: width / 2,
      y: height - 180,
      size: 10,
      font: helveticaFont,
    })

    // Split address into multiple lines if needed
    const addressLines = importerAddress.split('\n')
    addressLines.forEach((line: string, index: number) => {
      page.drawText(line, {
        x: width / 2,
        y: height - 195 - (index * 15),
        size: 10,
        font: helveticaFont,
      })
    })

    // Booking information
    const yPos = height - 280
    
    page.drawText('Booking Information:', {
      x: 50,
      y: yPos,
      size: 12,
      font: helveticaBold,
    })

    page.drawText(`Booking No: ${bolDocument.bolData?.bookingNumber || ''}`, {
      x: 50,
      y: yPos - 20,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`B/L No: ${bolDocument.bolData?.bolNumber || ''}`, {
      x: 50,
      y: yPos - 35,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`Vessel: ${bolDocument.bolData?.vessel || ''}`, {
      x: 50,
      y: yPos - 50,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`Voyage: ${bolDocument.bolData?.voyage || ''}`, {
      x: 50,
      y: yPos - 65,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`Port of Loading: ${bolDocument.bolData?.portOfLoading || ''}`, {
      x: width / 2,
      y: yPos - 20,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`Port of Discharge: ${bolDocument.bolData?.portOfDischarge || ''}`, {
      x: width / 2,
      y: yPos - 35,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`Place of Receipt: ${bolDocument.bolData?.placeOfReceipt || ''}`, {
      x: width / 2,
      y: yPos - 50,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`Place of Delivery: ${bolDocument.bolData?.placeOfDelivery || ''}`, {
      x: width / 2,
      y: yPos - 65,
      size: 10,
      font: helveticaFont,
    })

    // Container information
    const containerYPos = yPos - 100
    
    page.drawText('Container Information:', {
      x: 50,
      y: containerYPos,
      size: 12,
      font: helveticaBold,
    })

    // Container table headers
    const tableTop = containerYPos - 25
    const colWidths = [120, 100, 100, 100, 100]
    const colStarts = [50]
    
    for (let i = 1; i < colWidths.length; i++) {
      colStarts[i] = colStarts[i-1] + colWidths[i-1]
    }

    // Draw table headers
    page.drawText('Container No.', {
      x: colStarts[0] + 10,
      y: tableTop,
      size: 10,
      font: helveticaBold,
    })

    page.drawText('Seal No.', {
      x: colStarts[1] + 10,
      y: tableTop,
      size: 10,
      font: helveticaBold,
    })

    page.drawText('Type', {
      x: colStarts[2] + 10,
      y: tableTop,
      size: 10,
      font: helveticaBold,
    })

    page.drawText('Gross Weight', {
      x: colStarts[3] + 10,
      y: tableTop,
      size: 10,
      font: helveticaBold,
    })

    page.drawText('Net Weight', {
      x: colStarts[4] + 10,
      y: tableTop,
      size: 10,
      font: helveticaBold,
    })

    // Draw horizontal lines for table header
    page.drawLine({
      start: { x: 50, y: tableTop + 15 },
      end: { x: width - 50, y: tableTop + 15 },
      thickness: 1,
      color: rgb(0, 0, 0),
    })

    page.drawLine({
      start: { x: 50, y: tableTop - 5 },
      end: { x: width - 50, y: tableTop - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    })

    // Draw container data
    let currentY = tableTop - 25
    const containers = bolDocument.bolData?.containers || []
    
    containers.forEach((container: any, index: number) => {
      page.drawText(container.containerNumber || '', {
        x: colStarts[0] + 10,
        y: currentY,
        size: 10,
        font: helveticaFont,
      })

      page.drawText(container.sealNumber || '', {
        x: colStarts[1] + 10,
        y: currentY,
        size: 10,
        font: helveticaFont,
      })

      page.drawText(container.containerType || '', {
        x: colStarts[2] + 10,
        y: currentY,
        size: 10,
        font: helveticaFont,
      })

      page.drawText(`${container.grossWeight || ''} ${container.weightUnit || 'KG'}`, {
        x: colStarts[3] + 10,
        y: currentY,
        size: 10,
        font: helveticaFont,
      })

      page.drawText(`${container.netWeight || ''} ${container.weightUnit || 'KG'}`, {
        x: colStarts[4] + 10,
        y: currentY,
        size: 10,
        font: helveticaFont,
      })

      // Draw line after each row
      currentY -= 20
      page.drawLine({
        start: { x: 50, y: currentY + 10 },
        end: { x: width - 50, y: currentY + 10 },
        thickness: 1,
        color: rgb(0, 0, 0),
      })
    })

    // Product information
    const productYPos = currentY - 30
    
    page.drawText('Product Information:', {
      x: 50,
      y: productYPos,
      size: 12,
      font: helveticaBold,
    })

    // Product table headers
    const productTableTop = productYPos - 25
    const productColWidths = [200, 100, 100, 150]
    const productColStarts = [50]
    
    for (let i = 1; i < productColWidths.length; i++) {
      productColStarts[i] = productColStarts[i-1] + productColWidths[i-1]
    }

    // Draw product table headers
    page.drawText('Description', {
      x: productColStarts[0] + 10,
      y: productTableTop,
      size: 10,
      font: helveticaBold,
    })

    page.drawText('Quantity', {
      x: productColStarts[1] + 10,
      y: productTableTop,
      size: 10,
      font: helveticaBold,
    })

    page.drawText('Unit', {
      x: productColStarts[2] + 10,
      y: productTableTop,
      size: 10,
      font: helveticaBold,
    })

    page.drawText('HS Code', {
      x: productColStarts[3] + 10,
      y: productTableTop,
      size: 10,
      font: helveticaBold,
    })

    // Draw horizontal lines for product table header
    page.drawLine({
      start: { x: 50, y: productTableTop + 15 },
      end: { x: width - 50, y: productTableTop + 15 },
      thickness: 1,
      color: rgb(0, 0, 0),
    })

    page.drawLine({
      start: { x: 50, y: productTableTop - 5 },
      end: { x: width - 50, y: productTableTop - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    })

    // Draw product data
    let productCurrentY = productTableTop - 25
    const items = bolDocument.bolData?.items || []
    
    items.forEach((item: any, index: number) => {
      page.drawText(item.description || '', {
        x: productColStarts[0] + 10,
        y: productCurrentY,
        size: 10,
        font: helveticaFont,
      })

      page.drawText(item.quantity?.toString() || '', {
        x: productColStarts[1] + 10,
        y: productCurrentY,
        size: 10,
        font: helveticaFont,
      })

      page.drawText(item.unit || '', {
        x: productColStarts[2] + 10,
        y: productCurrentY,
        size: 10,
        font: helveticaFont,
      })

      page.drawText(item.hsCode || '', {
        x: productColStarts[3] + 10,
        y: productCurrentY,
        size: 10,
        font: helveticaFont,
      })

      // Draw line after each row
      productCurrentY -= 20
      page.drawLine({
        start: { x: 50, y: productCurrentY + 10 },
        end: { x: width - 50, y: productCurrentY + 10 },
        thickness: 1,
        color: rgb(0, 0, 0),
      })
    })

    // Footer
    const footerY = 100
    
    page.drawText('We hereby certify that the information contained in this Packing List is true and correct.', {
      x: 50,
      y: footerY,
      size: 10,
      font: helveticaFont,
    })

    // Signature
    page.drawText('Authorized Signature: _______________________', {
      x: 50,
      y: footerY - 40,
      size: 10,
      font: helveticaFont,
    })

    page.drawText(`Date: ${bolDate}`, {
      x: 50,
      y: footerY - 60,
      size: 10,
      font: helveticaFont,
    })

    // Company stamp
    page.drawText('Company Stamp:', {
      x: width / 2,
      y: footerY - 40,
      size: 10,
      font: helveticaFont,
    })

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

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

    // Create document record
    let documentRecord

    if (mode === 'overwrite' && existingPLs.length > 0) {
      // Update existing document
      documentRecord = await Document.findByIdAndUpdate(
        existingPLs[0]._id,
        {
          fileId,
          fileName: `${packingListNumber}.pdf`,
          packingListData: {
            documentNumber: packingListNumber,
            date: bolDocument.bolData?.date || new Date(),
            exporter: {
              name: client.name,
              address: `${client.address?.street || ''}, ${client.address?.city || ''}, ${client.address?.state || ''} ${client.address?.zip || ''}, ${client.address?.country || ''}`
            },
            importer: {
              name: bolDocument.bolData?.consignee?.name || '',
              address: bolDocument.bolData?.consignee?.address || ''
            },
            booking: {
              bookingNumber: bolDocument.bolData?.bookingNumber || '',
              bolNumber: bolDocument.bolData?.bolNumber || '',
              vessel: bolDocument.bolData?.vessel || '',
              voyage: bolDocument.bolData?.voyage || '',
              portOfLoading: bolDocument.bolData?.portOfLoading || '',
              portOfDischarge: bolDocument.bolData?.portOfDischarge || '',
              placeOfReceipt: bolDocument.bolData?.placeOfReceipt || '',
              placeOfDelivery: bolDocument.bolData?.placeOfDelivery || ''
            },
            containers: bolDocument.bolData?.containers || [],
            items: bolDocument.bolData?.items || []
          },
          updatedAt: new Date()
        },
        { new: true }
      )
    } else {
      // Create new document
      documentRecord = await Document.create({
        clientId: bolDocument.clientId,
        fileName: `${packingListNumber}.pdf`,
        fileId,
        type: 'PL',
        relatedBolId: bolDocument._id,
        packingListData: {
          documentNumber: packingListNumber,
          date: bolDocument.bolData?.date || new Date(),
          exporter: {
            name: client.name,
            address: `${client.address?.street || ''}, ${client.address?.city || ''}, ${client.address?.state || ''} ${client.address?.zip || ''}, ${client.address?.country || ''}`
          },
          importer: {
            name: bolDocument.bolData?.consignee?.name || '',
            address: bolDocument.bolData?.consignee?.address || ''
          },
          booking: {
            bookingNumber: bolDocument.bolData?.bookingNumber || '',
            bolNumber: bolDocument.bolData?.bolNumber || '',
            vessel: bolDocument.bolData?.vessel || '',
            voyage: bolDocument.bolData?.voyage || '',
            portOfLoading: bolDocument.bolData?.portOfLoading || '',
            portOfDischarge: bolDocument.bolData?.portOfDischarge || '',
            placeOfReceipt: bolDocument.bolData?.placeOfReceipt || '',
            placeOfDelivery: bolDocument.bolData?.placeOfDelivery || ''
          },
          containers: bolDocument.bolData?.containers || [],
          items: bolDocument.bolData?.items || []
        },
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }

    return NextResponse.json({
      success: true,
      document: documentRecord
    })
  } catch (error) {
    console.error('Error generating packing list:', error)
    return NextResponse.json(
      { error: 'Failed to generate packing list' },
      { status: 500 }
    )
  }
} 