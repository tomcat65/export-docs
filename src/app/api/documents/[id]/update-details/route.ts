import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'

interface UpdateDetailsRequest {
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

    // Connect to database
    await connectDB()

    // Get the document ID from params
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Get update data from request body
    const updateData = await request.json() as UpdateDetailsRequest
    
    // Log the update data for debugging
    console.log('Received update data:', JSON.stringify(updateData))
    console.log('PO Number type:', typeof updateData.poNumber, 'Value:', updateData.poNumber)
    
    if (!updateData || (
      !updateData.documentNumber && 
      !updateData.date && 
      (updateData.poNumber === undefined)
    )) {
      return NextResponse.json({ 
        error: 'At least one of documentNumber, date, or poNumber must be provided' 
      }, { status: 400 })
    }

    // Find the document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if document is a Packing List
    if (document.type !== 'PL') {
      return NextResponse.json({ 
        error: 'This endpoint only supports updating Packing List documents' 
      }, { status: 400 })
    }

    // Update document details
    if (!document.packingListData) {
      document.packingListData = {}
    }

    // Explicitly log current values before update
    console.log('Before update:', {
      documentNumber: document.packingListData.documentNumber,
      date: document.packingListData.date,
      poNumber: document.packingListData.poNumber
    })

    // Update each field exactly as received from the form
    if (updateData.documentNumber !== undefined) {
      document.packingListData.documentNumber = updateData.documentNumber
    }

    if (updateData.date !== undefined) {
      document.packingListData.date = updateData.date
    }

    if (updateData.poNumber !== undefined) {
      document.packingListData.poNumber = updateData.poNumber
    }

    // Log the document state after updates
    console.log('After update:', {
      documentNumber: document.packingListData.documentNumber,
      date: document.packingListData.date,
      poNumber: document.packingListData.poNumber
    })

    // Update document in database
    await document.save()
    
    console.log('Document saved successfully')

    // Regenerate the PDF with updated details
    // This would ideally call a utility function that shares code with the original generation route
    // For now, we'll return a message that the document needs to be regenerated
    
    return NextResponse.json({
      success: true,
      document: {
        id: document._id,
        packingListData: document.packingListData
      },
      message: "Document details updated successfully. You may need to regenerate the document to see the changes in the PDF."
    })
  } catch (error) {
    console.error('Error updating document details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update document details' },
      { status: 500 }
    )
  }
} 