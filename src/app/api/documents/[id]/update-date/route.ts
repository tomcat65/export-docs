import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface UpdateDateRequest {
  dateOfIssue: string
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

    // Get the document ID from params
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    // Get the date from request body
    const { dateOfIssue } = await request.json() as UpdateDateRequest
    if (!dateOfIssue) {
      return NextResponse.json({ error: 'Date of Issue is required' }, { status: 400 })
    }

    // Find the document
    const document = await Document.findById(id)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if document is a BOL
    if (document.type !== 'BOL') {
      return NextResponse.json({ error: 'Only BOL documents can be updated' }, { status: 400 })
    }

    // Update the dateOfIssue field
    // Use mongoose's set method to update the nested field
    document.set('bolData.dateOfIssue', dateOfIssue)

    // Save the document
    await document.save()

    console.log(`Updated dateOfIssue for document ${id} to ${dateOfIssue}`)

    return NextResponse.json({
      success: true,
      message: 'Date of Issue updated successfully'
    })
  } catch (error) {
    console.error('Error updating date:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update date' },
      { status: 500 }
    )
  }
} 