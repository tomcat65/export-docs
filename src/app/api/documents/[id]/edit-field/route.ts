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
    const { fieldPath, value } = body

    if (!fieldPath) {
      return NextResponse.json({ error: 'Field path is required' }, { status: 400 })
    }

    console.log(`Updating field "${fieldPath}" for document ${id} to:`, value)

    // Connect to the database
    await connectDB()

    // Find the document first to verify it exists
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Create an update object for MongoDB
    const updateData: Record<string, any> = {}
    updateData[fieldPath] = value

    // Update the document using direct update
    const updateResult = await Document.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: updateData }
    )

    if (updateResult.modifiedCount === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'Document was found but no changes were made' 
      }, { status: 200 })
    }

    // Refetch the document to verify changes
    const updatedDocument = await Document.findById(id)
    
    // Get the updated value (handling nested paths)
    let updatedValue = updatedDocument
    const pathParts = fieldPath.split('.')
    
    for (const part of pathParts) {
      if (updatedValue && typeof updatedValue === 'object') {
        updatedValue = (updatedValue as any)[part]
      } else {
        updatedValue = undefined
        break
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Document updated successfully',
      fieldPath,
      oldValue: value,
      newValue: updatedValue
    })
  } catch (error) {
    console.error('Error updating document field:', error)
    return NextResponse.json(
      { error: 'Failed to update document field' },
      { status: 500 }
    )
  }
} 