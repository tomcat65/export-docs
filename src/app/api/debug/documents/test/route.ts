import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Client } from '@/models/Client'
import mongoose from 'mongoose'

/**
 * Simple test API endpoint to verify database connectivity and document retrieval
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Test API: Connecting to database...')
    await connectDB()
    console.log('Test API: Connected to database successfully')

    // Get DB stats
    const dbStats = {
      isConnected: mongoose.connection.readyState === 1,
      connectedTo: mongoose.connection.db?.databaseName,
      collections: {}
    }

    // Get collections list
    const collections = await mongoose.connection.db.listCollections().toArray()
    console.log(`Test API: Found ${collections.length} collections`)
    
    // Get counts of documents in each collection
    const countPromises = collections.map(async (collection) => {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments()
      return { name: collection.name, count }
    })
    
    const collectionCounts = await Promise.all(countPromises)
    dbStats.collections = Object.fromEntries(
      collectionCounts.map(item => [item.name, item.count])
    )

    // Get aggregate document type counts
    console.log('Test API: Counting documents by type')
    const documentTypeCounts = await Document.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ])

    // Get client count
    const clientCount = await Client.countDocuments()
    console.log(`Test API: Found ${clientCount} clients`)

    // Return DB stats and document counts
    return NextResponse.json({
      status: 'success',
      message: 'Database connection and document retrieval test successful',
      dbStats,
      documentCounts: {
        byType: Object.fromEntries(
          documentTypeCounts.map(item => [item._id || 'NULL', item.count])
        ),
        totalClients: clientCount
      }
    })
  } catch (error) {
    console.error('Test API error:', error)
    return NextResponse.json(
      { 
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : null
      },
      { status: 500 }
    )
  }
} 