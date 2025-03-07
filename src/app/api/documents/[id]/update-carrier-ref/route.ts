import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'
import { auth } from '@/lib/auth'

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

    // Extract document ID from params
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Parse request body
    const body = await request.json()
    const { carrierReference } = body

    if (!carrierReference) {
      return NextResponse.json({ error: 'Carrier reference is required' }, { status: 400 })
    }

    console.log(`Updating carrier reference for document ${id} to "${carrierReference}"`)

    // Connect to the database
    await connectDB()

    // Find the document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Ensure bolData exists
    if (!document.bolData) {
      document.bolData = {
        bolNumber: '',
        shipper: '',
        portOfLoading: '',
        portOfDischarge: '',
        totalContainers: '',
        totalWeight: {
          kg: '0',
          lbs: '0'
        }
      }
    }

    // Set the carrier reference
    document.bolData.carrierReference = carrierReference
    document.markModified('bolData') // Force Mongoose to recognize the change

    // Save the document
    await document.save()
    
    // Triple-check: verify the update was successful
    const verifiedDoc = await Document.findById(id)
    console.log('Verification - carrier reference after update:', verifiedDoc?.bolData?.carrierReference)

    // Also perform a direct database update as a failsafe
    await Document.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { 'bolData.carrierReference': carrierReference } }
    )

    return NextResponse.json({
      success: true,
      message: 'Carrier reference updated successfully',
      carrierReference
    })
  } catch (error) {
    console.error('Error updating carrier reference:', error)
    return NextResponse.json(
      { error: 'Failed to update carrier reference' },
      { status: 500 }
    )
  }
} 