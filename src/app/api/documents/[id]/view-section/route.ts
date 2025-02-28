import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFImage, PDFFont } from 'pdf-lib'
import mongoose from 'mongoose'
import { Types } from 'mongoose'

interface ViewSectionRequest {
  section: 'header' | 'body' | 'footer' | null // null means view the whole document
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      console.error('Authentication failed in view-section route')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body for section
    let body;
    try {
      body = await request.json()
    } catch (error) {
      console.error('Failed to parse request body', error)
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    
    const section = body?.section || null // Default to viewing the whole document
    
    try {
      await connectDB()
    } catch (error) {
      console.error('Database connection failed', error)
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    // Get the ID from params
    const { id } = await context.params
    if (!id || !Types.ObjectId.isValid(id)) {
      console.error('Invalid document ID', id)
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
    }

    // Find the document
    let document;
    try {
      document = await Document.findById(id)
      if (!document) {
        console.error('Document not found', id)
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
    } catch (error) {
      console.error('Error finding document', error)
      return NextResponse.json({ error: 'Error finding document' }, { status: 500 })
    }

    // Verify this is a COO document
    if (document.type !== 'COO') {
      console.error('Not a COO document', document.type)
      return NextResponse.json({ error: 'Not a COO document' }, { status: 400 })
    }

    // Find the related BOL document
    let bolDocument;
    try {
      bolDocument = await Document.findById(document.relatedBolId)
      if (!bolDocument) {
        console.error('Related BOL document not found', document.relatedBolId)
        return NextResponse.json({ error: 'Related BOL document not found' }, { status: 404 })
      }
    } catch (error) {
      console.error('Error finding related BOL document', error)
      return NextResponse.json({ error: 'Error finding related BOL document' }, { status: 500 })
    }

    // Find the client
    let client;
    try {
      client = await Client.findById(document.clientId)
      if (!client) {
        console.error('Client not found', document.clientId)
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }
    } catch (error) {
      console.error('Error finding client', error)
      return NextResponse.json({ error: 'Error finding client' }, { status: 500 })
    }

    // If we're viewing the whole document, just redirect to the standard view endpoint
    if (!section) {
      return NextResponse.json({
        redirect: `/api/documents/${id}/view`
      })
    }

    console.log(`Viewing ${section} section of COO document ${id}`)
    
    // For now, we'll just redirect to the existing document view
    // In a production implementation, you would implement section-specific rendering
    return NextResponse.json({
      redirect: `/api/documents/${id}/view`,
      section
    })
  } catch (error) {
    console.error('Unexpected error in view-section route:', error)
    return NextResponse.json(
      { error: 'Unexpected error viewing document section' },
      { status: 500 }
    )
  }
} 