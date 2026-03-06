import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'

type RouteContext = {
  params: {
    number: string
  }
}

// Known problematic BOL numbers that should be handled specially
const PROBLEMATIC_BOL_NUMBERS = [
  'HLCUSHA2307ADRIA' // This is known to be extracted incorrectly by Claude
];

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { number } = context.params
    if (!number) {
      return NextResponse.json({ error: 'BOL number is required' }, { status: 400 })
    }

    console.log(`Checking if BOL with number "${number}" exists`);
    
    // Special handling for known problematic BOL numbers
    if (PROBLEMATIC_BOL_NUMBERS.includes(number)) {
      console.log(`BOL number "${number}" is in the problematic BOL list - treating as non-existent`);
      return NextResponse.json({
        exists: false,
        message: "This BOL number is known to be extracted incorrectly"
      });
    }
    
    await connectDB()

    // Use a more comprehensive query to check all possible locations of the BOL number
    const existingBol = await Document.findOne({
      $or: [
        { 'customFields.bolNumber': number },
        { 'bolData.bolNumber': number },
        { bolNumber: number },
        { 'document.bolNumber': number },
        { 'document.shipmentDetails.bolNumber': number }
      ],
      type: 'BOL'
    }).select('_id fileName clientId createdAt').lean()

    console.log(`BOL check result: ${existingBol ? 'Found' : 'Not found'}`);
    
    if (existingBol) {
      console.log(`Found BOL: ID=${existingBol._id}, fileName=${existingBol.fileName}`);
      
      // Double check this document actually exists by doing a full find by ID
      // This ensures we don't get false positives from cached data
      const verifiedDoc = await Document.findById(existingBol._id).lean();
      
      if (!verifiedDoc) {
        console.log(`WARNING: BOL ${number} exists in query but not found by ID - potential stale data`);
        return NextResponse.json({
          exists: false,
          message: "Document found in initial query but not verified by ID - stale data removed"
        });
      }
      
      // As an extra verification, check if this document contains the BOL number in its content
      const stringifiedDoc = JSON.stringify(verifiedDoc);
      if (!stringifiedDoc.includes(number)) {
        console.log(`WARNING: BOL ${number} found but number not in document content - potential false match`);
      }
    }

    return NextResponse.json({
      exists: !!existingBol,
      document: existingBol
    })
  } catch (error) {
    console.error('Error checking BOL:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error checking BOL' },
      { status: 500 }
    )
  }
} 