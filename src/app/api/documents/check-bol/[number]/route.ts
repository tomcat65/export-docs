import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'

export async function GET(
  request: NextRequest,
  context: { params: { number: string } }
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

    await connectDB()

    // Check if BOL exists
    const existingBol = await Document.findOne({
      'bolData.bolNumber': number,
      type: 'BOL'
    }).select('_id fileName clientId createdAt').lean()

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