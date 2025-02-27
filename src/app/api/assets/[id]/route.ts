import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Asset } from '@/models/Asset'
import mongoose from 'mongoose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
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

    // Get the ID from params
    const { id } = await params
    if (!id || id === 'undefined') {
      return NextResponse.json({ error: 'Invalid asset ID' }, { status: 400 })
    }

    // Find asset
    const asset = await Asset.findById(id)
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    // Delete file from GridFS
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json({ error: 'Database connection not established' }, { status: 500 })
    }

    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: 'assets'
    })

    try {
      // Convert fileId to ObjectId if it's a string
      const fileId = typeof asset.fileId === 'string' 
        ? new mongoose.Types.ObjectId(asset.fileId)
        : asset.fileId;
        
      await bucket.delete(fileId)
    } catch (error) {
      console.error('Error deleting file from GridFS:', error)
      // Continue with asset deletion even if file deletion fails
    }

    // Delete asset from database
    await Asset.findByIdAndDelete(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting asset:', error)
    return NextResponse.json(
      { error: 'Failed to delete asset' },
      { status: 500 }
    )
  }
} 