import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document, IDocument } from '@/models/Document'
import mongoose from 'mongoose'

interface UpdateRequest {
  documentNumber?: string
  date?: string
  poNumber?: string
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

    await connectDB()

    // Get document ID from params
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Find document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if document is a Packing List
    if (document.type !== 'PL') {
      return NextResponse.json({ error: 'Only Packing List documents can be updated' }, { status: 400 })
    }

    // Get update data from request
    const updateData: UpdateRequest = await request.json()
    console.log('Received update data:', updateData)

    // Update document details
    if (!document.packingListData) {
      document.packingListData = {}
    }

    // Update fields if provided
    if (updateData.documentNumber !== undefined) {
      document.packingListData.documentNumber = updateData.documentNumber
    }
    
    if (updateData.date !== undefined) {
      document.packingListData.date = updateData.date
    }
    
    if (updateData.poNumber !== undefined) {
      // Ensure poNumber is stored as a string, even if empty
      const poNumber = String(updateData.poNumber) // Use String() for explicit conversion
      document.packingListData.poNumber = poNumber
      console.log(`Setting poNumber to: "${poNumber}" (type: ${typeof poNumber})`)
      
      // Also perform a direct update to ensure the field is set
      await Document.updateOne(
        { _id: id },
        { $set: { 'packingListData.poNumber': poNumber } }
      )
      console.log('Performed direct update of poNumber field')
    }

    // Save the updated document
    await document.save()
    console.log('Updated document details:', {
      documentNumber: document.packingListData.documentNumber,
      date: document.packingListData.date,
      poNumber: document.packingListData.poNumber,
      poNumberType: typeof document.packingListData.poNumber
    })

    // Make sure we're working with the latest data - add proper type annotation
    const refreshedDocument = await Document.findById(id).lean() as IDocument | null
    if (!refreshedDocument || !refreshedDocument.packingListData) {
      return NextResponse.json({ error: 'Failed to verify saved document data' }, { status: 500 })
    }

    console.log('Verified document data after save (using lean()):', {
      documentNumber: refreshedDocument.packingListData.documentNumber,
      date: refreshedDocument.packingListData.date,
      poNumber: refreshedDocument.packingListData.poNumber,
      poNumberType: typeof refreshedDocument.packingListData.poNumber
    })

    // Force an explicit update of the poNumber field if it seems to be missing
    if (updateData.poNumber !== undefined && 
        (refreshedDocument.packingListData.poNumber === undefined || 
         refreshedDocument.packingListData.poNumber === null)) {
      console.log('poNumber appears to be lost after save, forcing direct update');
      await Document.updateOne(
        { _id: id },
        { $set: { 'packingListData.poNumber': String(updateData.poNumber) } }
      );
      console.log('Forced update of poNumber field');
    }

    // Call the regenerate endpoint to update the PDF
    const regenerateUrl = `/api/documents/${id}/regenerate`
    const regenerateResponse = await fetch(new URL(regenerateUrl, request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '' // Forward cookies for auth
      }
    })

    if (!regenerateResponse.ok) {
      const errorData = await regenerateResponse.json()
      return NextResponse.json({ 
        error: 'Document details updated but PDF regeneration failed',
        regenerateError: errorData.error
      }, { status: 500 })
    }

    const regenerateData = await regenerateResponse.json()

    return NextResponse.json({
      success: true,
      document: {
        id: document._id,
        fileId: document.fileId,
        packingListData: document.packingListData
      },
      message: "Document details updated and PDF regenerated successfully"
    })
  } catch (error) {
    console.error('Error updating document details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update document details' },
      { status: 500 }
    )
  }
} 