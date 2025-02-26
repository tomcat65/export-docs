import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { Document } from '@/models/Document'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { processDocumentWithClaude } from '@/lib/claude'
import { unlink } from 'fs/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  id: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  let fileName: string | undefined

  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Get client ID from params
    const { id } = await params

    // Find client
    const client = await Client.findById(id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const documentStr = formData.get('document') as string

    if (!file || !documentStr) {
      return NextResponse.json({ error: 'Missing file or document data' }, { status: 400 })
    }

    const documentData = JSON.parse(documentStr) as { type: 'pdf' | 'image'; data: string }

    try {
      // Create uploads directory if it doesn't exist
      const uploadsDir = join(process.cwd(), 'public', 'uploads', id)
      await mkdir(uploadsDir, { recursive: true })

      // Save file
      const buffer = Buffer.from(await file.arrayBuffer())
      fileName = join(uploadsDir, file.name)
      await writeFile(fileName, buffer)

      // Create relative URL for file access
      const fileUrl = `/uploads/${id}/${file.name}`

      // Process document with Claude
      const processedData = await processDocumentWithClaude(documentData)
      
      if (!processedData || !processedData.shipmentDetails || !processedData.shipmentDetails.bolNumber) {
        throw new Error('Failed to extract required information from document')
      }

      // Map the processed data to our document schema
      const dbDocumentData = {
        clientId: id,
        fileName: file.name,
        filePath: fileName,
        fileUrl,
        type: 'BOL' as const,
        items: processedData.containers.map((container, index) => ({
          itemNumber: index + 1,
          containerNumber: container.containerNumber,
          seal: container.sealNumber || '',
          description: container.product.description,
          quantity: {
            litros: container.quantity.volume.liters.toFixed(2),
            kg: container.quantity.weight.kg.toFixed(3)
          }
        })),
        bolData: {
          bolNumber: processedData.shipmentDetails.bolNumber,
          bookingNumber: processedData.shipmentDetails.bookingNumber || '',
          shipper: processedData.parties.shipper.name,
          vessel: processedData.shipmentDetails.vesselName || '',
          portOfLoading: processedData.shipmentDetails.portOfLoading,
          portOfDischarge: processedData.shipmentDetails.portOfDischarge,
          dateOfIssue: processedData.shipmentDetails.dateOfIssue || '',
          totalContainers: processedData.containers.length.toString(),
          totalWeight: {
            kg: processedData.containers.reduce((sum, container) => 
              sum + container.quantity.weight.kg, 0).toFixed(3),
            lbs: processedData.containers.reduce((sum, container) => 
              sum + container.quantity.weight.lbs, 0).toFixed(2)
          }
        }
      }

      // Check if document with same BOL number exists
      let existingDocument = await Document.findOne({
        clientId: id,
        'bolData.bolNumber': processedData.shipmentDetails.bolNumber
      })

      if (existingDocument) {
        // Update existing document
        existingDocument.set(dbDocumentData)
        await existingDocument.save()
      } else {
        // Create new document record
        existingDocument = await Document.create(dbDocumentData)
      }

      // Update client's last document date
      await Client.findByIdAndUpdate(
        id,
        { lastDocumentDate: new Date() },
        { new: true }
      )

      return NextResponse.json({
        success: true,
        document: {
          id: existingDocument._id,
          fileUrl: existingDocument.fileUrl,
          bolData: existingDocument.bolData,
          items: existingDocument.items
        }
      })
    } catch (error) {
      console.error('Error saving file or processing document:', error)
      // Delete the file if it was created
      if (fileName) {
        try {
          await unlink(fileName)
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError)
        }
      }
      throw error
    }
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save document' },
      { status: 500 }
    )
  }
} 