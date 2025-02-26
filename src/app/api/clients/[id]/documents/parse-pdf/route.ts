import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function convertPDFPageToImage(pdfBytes: ArrayBuffer, pageNum: number): Promise<string> {
  // Load the PDF document
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const page = pdfDoc.getPages()[pageNum]
  
  // Get page dimensions
  const { width, height } = page.getSize()
  
  // Create a new document with just this page
  const singlePageDoc = await PDFDocument.create()
  const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageNum])
  singlePageDoc.addPage(copiedPage)
  
  // Convert to PNG with high resolution
  const singlePageBytes = await singlePageDoc.save()
  
  // Use sharp to convert PDF to high-quality PNG
  const imageBuffer = await sharp(Buffer.from(singlePageBytes))
    .png()
    .resize(Math.round(width * 2), Math.round(height * 2), {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toBuffer()

  // Convert to base64
  return `data:image/png;base64,${imageBuffer.toString('base64')}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Get client ID from params
    const { id } = await params
    console.log('PDF parsing request received for client:', id)
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      console.error('No file provided')
      return new NextResponse('No file provided', { status: 400 })
    }

    console.log('Processing file:', {
      name: file.name,
      type: file.type,
      size: file.size
    })

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      console.error('Invalid file type:', file.type)
      return new NextResponse('File must be a PDF', { status: 400 })
    }

    // Read the PDF file
    const pdfBytes = await file.arrayBuffer()
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const pageCount = pdfDoc.getPageCount()
    
    console.log(`Processing ${pageCount} pages`)
    
    // Convert each page to an image
    const pageImages: string[] = []
    for (let i = 0; i < pageCount; i++) {
      console.log(`Converting page ${i + 1} to image`)
      const base64Image = await convertPDFPageToImage(pdfBytes, i)
      pageImages.push(base64Image)
    }
    
    console.log('PDF processed successfully:', {
      pageCount,
      imagesGenerated: pageImages.length
    })

    return NextResponse.json({
      images: pageImages,
      pageCount
    })
  } catch (error) {
    console.error('Error processing PDF:', error)
    return new NextResponse(
      'Error processing PDF file',
      { status: 500 }
    )
  }
} 