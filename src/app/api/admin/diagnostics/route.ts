import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

interface DiagnosticResult {
  type: 'error' | 'warning' | 'info'
  message: string
  details?: any
  canFix?: boolean
  fixAction?: string
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const diagnostics: DiagnosticResult[] = []
    
    // Get GridFS bucket
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })

    // 1. Check for documents without files
    const allDocuments = await Document.find().lean()
    const documentsWithoutFiles = []
    
    for (const doc of allDocuments) {
      try {
        const file = await bucket.find({ _id: doc.fileId }).next()
        if (!file) {
          documentsWithoutFiles.push(doc)
          diagnostics.push({
            type: 'error',
            message: `Document missing GridFS file: ${doc.fileName}`,
            details: {
              documentId: doc._id,
              fileName: doc.fileName,
              type: doc.type,
              fileId: doc.fileId
            },
            canFix: true,
            fixAction: 'regenerate'
          })
        }
      } catch (error) {
        console.error(`Error checking file for document ${doc._id}:`, error)
      }
    }

    // 2. Check for orphaned files in GridFS
    const allFiles = await bucket.find({}).toArray()
    const documentFileIds = new Set(allDocuments.map(doc => doc.fileId.toString()))
    
    for (const file of allFiles) {
      if (!documentFileIds.has(file._id.toString())) {
        diagnostics.push({
          type: 'warning',
          message: `Orphaned file in GridFS: ${file.filename}`,
          details: {
            fileId: file._id,
            filename: file.filename,
            uploadDate: file.uploadDate,
            metadata: file.metadata
          },
          canFix: true,
          fixAction: 'delete'
        })
      }
    }

    // 3. Check for BOL documents without dates
    const bolsWithoutDates = await Document.find({
      type: 'BOL',
      'bolData.dateOfIssue': { $exists: false }
    }).lean()
    
    if (bolsWithoutDates.length > 0) {
      diagnostics.push({
        type: 'warning',
        message: `Found ${bolsWithoutDates.length} BOL(s) without dates`,
        details: bolsWithoutDates.map(doc => ({
          documentId: doc._id,
          fileName: doc.fileName
        })),
        canFix: false
      })
    }

    // 4. Check for documents with invalid client references
    const allClients = await Client.find().lean()
    const clientIds = new Set(allClients.map(client => client._id.toString()))
    
    const documentsWithInvalidClients = allDocuments.filter(
      doc => !clientIds.has(doc.clientId.toString())
    )
    
    if (documentsWithInvalidClients.length > 0) {
      diagnostics.push({
        type: 'error',
        message: `Found ${documentsWithInvalidClients.length} document(s) with invalid client references`,
        details: documentsWithInvalidClients.map(doc => ({
          documentId: doc._id,
          fileName: doc.fileName,
          clientId: doc.clientId
        })),
        canFix: false
      })
    }

    // 5. Check for duplicate BOL numbers
    const bolDocuments = allDocuments.filter(doc => doc.type === 'BOL')
    const bolNumbers = new Map<string, any[]>()
    
    bolDocuments.forEach(doc => {
      const bolNumber = doc.bolData?.bolNumber
      if (bolNumber) {
        if (!bolNumbers.has(bolNumber)) {
          bolNumbers.set(bolNumber, [])
        }
        bolNumbers.get(bolNumber)!.push(doc)
      }
    })
    
    bolNumbers.forEach((docs, bolNumber) => {
      if (docs.length > 1) {
        diagnostics.push({
          type: 'warning',
          message: `Duplicate BOL number found: ${bolNumber}`,
          details: docs.map(doc => ({
            documentId: doc._id,
            fileName: doc.fileName,
            clientId: doc.clientId,
            createdAt: doc.createdAt
          })),
          canFix: false
        })
      }
    })

    // Return diagnostic results
    return NextResponse.json({
      diagnostics,
      summary: {
        total: diagnostics.length,
        errors: diagnostics.filter(d => d.type === 'error').length,
        warnings: diagnostics.filter(d => d.type === 'warning').length,
        info: diagnostics.filter(d => d.type === 'info').length
      }
    })
  } catch (error) {
    console.error('Error running diagnostics:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error running diagnostics' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const { action, documentId, fileId } = await request.json()

    if (!action) {
      return NextResponse.json({ error: 'No action specified' }, { status: 400 })
    }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'documents'
    })

    switch (action) {
      case 'delete-orphaned-file':
        if (!fileId) {
          return NextResponse.json({ error: 'No fileId provided' }, { status: 400 })
        }
        await bucket.delete(new mongoose.Types.ObjectId(fileId))
        return NextResponse.json({ message: 'Orphaned file deleted successfully' })

      case 'regenerate-document':
        if (!documentId) {
          return NextResponse.json({ error: 'No documentId provided' }, { status: 400 })
        }
        
        const document = await Document.findById(documentId)
        if (!document) {
          return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // Trigger regeneration based on document type
        const baseUrl = new URL(request.url).origin
        let regenerateUrl: string
        
        switch (document.type) {
          case 'COO':
            if (!document.relatedBolId) {
              return NextResponse.json({ error: 'No related BOL ID found' }, { status: 400 })
            }
            regenerateUrl = `${baseUrl}/api/documents/${document.relatedBolId}/generate/coo`
            break
            
          case 'PL':
            regenerateUrl = `${baseUrl}/api/documents/${documentId}/generate/pl`
            break
            
          default:
            return NextResponse.json(
              { error: `Cannot regenerate document of type ${document.type}` },
              { status: 400 }
            )
        }

        const response = await fetch(regenerateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: request.headers.get('cookie') || ''
          },
          body: JSON.stringify({ mode: 'overwrite' })
        })

        if (!response.ok) {
          throw new Error(`Failed to regenerate document: ${response.statusText}`)
        }

        return NextResponse.json({ message: 'Document regenerated successfully' })

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error fixing issue:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fixing issue' },
      { status: 500 }
    )
  }
} 