import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Asset } from '@/models/Asset'
import mongoose from 'mongoose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    await connectDB()

    // Get the ID from params
    const { id } = await params
    if (!id || id === 'undefined') {
      return new NextResponse('Invalid asset ID', { status: 400 })
    }

    // Find asset
    const asset = await Asset.findById(id)
    if (!asset) {
      return new NextResponse('Asset not found', { status: 404 })
    }

    // Get file from GridFS
    const db = mongoose.connection.db
    if (!db) {
      return new NextResponse('Database connection not established', { status: 500 })
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'assets'
    })

    try {
      // Convert fileId to ObjectId if it's a string
      const fileId = typeof asset.fileId === 'string' 
        ? new mongoose.Types.ObjectId(asset.fileId)
        : asset.fileId;
        
      const file = await bucket.find({ _id: fileId }).next()
      if (!file) {
        return new NextResponse('File not found', { status: 404 })
      }

      const downloadStream = bucket.openDownloadStream(fileId)

      return new Response(downloadStream as unknown as ReadableStream, {
        headers: {
          'Content-Type': asset.contentType,
          'Content-Disposition': 'inline',
          'Cache-Control': 'no-cache'
        }
      })
    } catch (error) {
      console.error('Error streaming file:', error)
      return new NextResponse('Error streaming file', { status: 500 })
    }
  } catch (error) {
    console.error('Error in asset view route:', error)
    return new NextResponse(
      'Error processing request',
      { status: 500 }
    )
  }
} 