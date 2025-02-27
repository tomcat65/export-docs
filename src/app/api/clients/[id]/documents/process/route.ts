import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { Document } from '@/models/Document'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  id: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const { id } = await params
    const client = await Client.findById(id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const { documentId, processedData } = await request.json()

    // Find the document
    const document = await Document.findById(documentId)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Update document with processed data
    document.bolData = {
      ...document.bolData,
      ...processedData
    }
    await document.save()

    return NextResponse.json({
      success: true,
      document: {
        id: document._id,
        bolData: document.bolData
      }
    })
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json(
      { error: 'Failed to process document' },
      { status: 500 }
    )
  }
} 