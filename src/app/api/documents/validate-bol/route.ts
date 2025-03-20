import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Types } from 'mongoose'
import { Client } from '@/models/Client'

interface BolDocument {
  _id: Types.ObjectId;
  clientId: Types.ObjectId;
  bolData?: {
    bolNumber: string;
  };
  type: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the uploaded file and clientId
    const formData = await request.formData()
    const file = formData.get('file') as File
    const clientId = formData.get('clientId') as string
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!clientId) {
      return NextResponse.json({ error: 'No client selected' }, { status: 400 })
    }

    // Check file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File must be a PDF or image (JPEG, PNG)' }, { status: 400 })
    }

    // Extract BOL number from filename
    const bolNumberMatch = file.name.match(/(\d{9})/)?.[1] // Assuming BOL numbers are 9 digits
    if (!bolNumberMatch) {
      return NextResponse.json(
        { error: 'Could not find BOL number in filename. Expected format: MDRA0101_123456789.pdf' },
        { status: 400 }
      )
    }

    await connectDB()

    // Check if BOL already exists
    const existingBol = await Document.findOne({
      'bolData.bolNumber': bolNumberMatch,
      type: 'BOL'
    }).lean() as BolDocument | null

    if (existingBol) {
      return NextResponse.json(
        { error: `BOL ${bolNumberMatch} already exists in the system` },
        { status: 400 }
      )
    }

    // Verify client exists
    const clientExists = await Client.exists({ _id: clientId })
    if (!clientExists) {
      return NextResponse.json({ error: 'Selected client not found' }, { status: 400 })
    }

    // Return validation result
    return NextResponse.json({
      valid: true,
      bolNumber: bolNumberMatch,
      clientId
    })
  } catch (error) {
    console.error('Error validating BOL:', error)
    // Always return a properly formatted JSON response
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred while validating the BOL'
    }, { status: 500 })
  }
} 