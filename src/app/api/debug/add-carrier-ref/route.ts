import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'

export async function GET(request: NextRequest) {
  try {
    // Connect to the database
    await connectDB()
    
    // BOL number and carrier reference
    const bolNumber = 'HLCUBSC250265371'
    const carrierReference = '18763708'
    
    console.log(`Looking for document with BOL number: ${bolNumber}`)
    
    // Find the document by BOL number
    const docs = await Document.find({ 'bolData.bolNumber': bolNumber })
    
    if (!docs || docs.length === 0) {
      console.error(`Document with BOL number ${bolNumber} not found`)
      return NextResponse.json({ 
        error: 'Document not found' 
      }, { status: 404 })
    }
    
    console.log(`Found ${docs.length} matching documents`)
    let updatedCount = 0
    
    // Update each document with the carrier reference
    for (const doc of docs) {
      console.log(`Updating document ${doc._id}`)
      
      if (!doc.bolData) {
        console.log(`Document ${doc._id} has no bolData, skipping`)
        continue
      }
      
      doc.bolData.carrierReference = carrierReference
      doc.markModified('bolData')
      await doc.save()
      updatedCount++
      
      console.log(`Updated document ${doc._id} with carrier reference: ${carrierReference}`)
    }
    
    return NextResponse.json({
      success: true,
      message: `Updated ${updatedCount} documents with carrier reference: ${carrierReference}`,
      documents: docs.map(doc => ({
        id: doc._id.toString(),
        bolNumber: doc.bolData?.bolNumber,
        carrierReference: doc.bolData?.carrierReference
      }))
    })
  } catch (error) {
    console.error('Error updating carrier reference:', error)
    return NextResponse.json({ error: 'Failed to update carrier reference' }, { status: 500 })
  }
} 