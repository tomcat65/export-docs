import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract document ID from params
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Connect to the database
    await connectDB()

    // Find the document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Debug - log the document's carrier reference
    console.log(`Fetched document ${id}, Carrier Reference:`, document.bolData?.carrierReference || 'NOT FOUND')

    // Serialize and return the document
    const serializedDocument = {
      _id: document._id.toString(),
      clientId: document.clientId.toString(),
      fileName: document.fileName,
      fileId: document.fileId.toString(),
      type: document.type,
      relatedBolId: document.relatedBolId?.toString(),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      bolData: document.bolData ? {
        bolNumber: document.bolData.bolNumber,
        bookingNumber: document.bolData.bookingNumber,
        shipper: document.bolData.shipper,
        carrierReference: document.bolData.carrierReference,
        vessel: document.bolData.vessel,
        voyage: document.bolData.voyage,
        portOfLoading: document.bolData.portOfLoading,
        portOfDischarge: document.bolData.portOfDischarge,
        dateOfIssue: document.bolData.dateOfIssue,
        totalContainers: document.bolData.totalContainers,
        totalWeight: document.bolData.totalWeight
      } : undefined,
      items: document.items,
      packingListData: document.packingListData,
      cooData: document.cooData
    }

    return NextResponse.json({
      success: true,
      document: serializedDocument
    })
  } catch (error) {
    console.error('Error fetching document:', error)
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    )
  }
} 