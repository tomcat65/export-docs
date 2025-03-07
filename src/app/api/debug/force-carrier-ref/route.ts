import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import mongoose from 'mongoose'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bolNumber, carrierReference } = body

    if (!bolNumber || !carrierReference) {
      return NextResponse.json({ 
        error: 'BOL number and carrier reference are required' 
      }, { status: 400 })
    }

    // Connect to the database
    await connectDB()
    console.log(`Looking for document with BOL number: ${bolNumber}`)

    // First find the document by BOL number
    const docs = await Document.find({ 'bolData.bolNumber': bolNumber })
    
    if (!docs || docs.length === 0) {
      console.error(`Document with BOL number ${bolNumber} not found`)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    console.log(`Found ${docs.length} matching documents`)
    const updatePromises = []

    // Update each document - try multiple approaches to update the carrier reference
    for (const doc of docs) {
      console.log(`Updating document ${doc._id}`)
      
      // Approach 1: Direct update of the field
      updatePromises.push(
        Document.updateOne(
          { _id: doc._id },
          { $set: { 'bolData.carrierReference': carrierReference } }
        )
      )
      
      // Approach 2: Update via findOne and save
      const updateDoc = async () => {
        const document = await Document.findById(doc._id)
        if (document && document.bolData) {
          document.bolData.carrierReference = carrierReference
          document.markModified('bolData')
          await document.save()
          console.log(`Document ${doc._id} updated via save method`)
        }
      }
      
      updatePromises.push(updateDoc())
    }

    // Run all updates
    await Promise.all(updatePromises)
    
    // Verify the updates
    const verifiedDocs = await Document.find({ 'bolData.bolNumber': bolNumber })
    
    for (const doc of verifiedDocs) {
      console.log(`Verification for ${doc._id}: Carrier Reference = ${doc.bolData?.carrierReference || 'NOT FOUND'}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Carrier references updated',
      count: docs.length
    })
  } catch (error) {
    console.error('Error updating carrier references:', error)
    return NextResponse.json(
      { error: 'Failed to update carrier references' },
      { status: 500 }
    )
  }
} 