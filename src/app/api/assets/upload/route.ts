import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Asset } from '@/models/Asset'
import mongoose from 'mongoose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const name = formData.get('name') as string
    const type = formData.get('type') as string
    const description = formData.get('description') as string
    const owner = formData.get('owner') as string

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
    }

    // Validate asset type
    const validTypes = ['signature', 'notary_seal', 'letterhead', 'other']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
    }

    // Get file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Store in GridFS
    if (!mongoose.connection.db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }
    
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'assets'
    })

    const uploadStream = bucket.openUploadStream(file.name, {
      metadata: {
        contentType: file.type,
        assetType: type,
        owner
      }
    })

    // Upload to GridFS
    await new Promise((resolve, reject) => {
      const readStream = require('stream').Readable.from(buffer)
      readStream
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve)
    })

    // Create asset record
    const asset = await Asset.create({
      name,
      type,
      description,
      fileId: uploadStream.id,
      contentType: file.type,
      owner
    })

    return NextResponse.json({
      success: true,
      asset: {
        id: asset._id,
        name: asset.name,
        type: asset.type
      }
    })
  } catch (error) {
    console.error('Error uploading asset:', error)
    return NextResponse.json(
      { error: 'Failed to upload asset' },
      { status: 500 }
    )
  }
} 