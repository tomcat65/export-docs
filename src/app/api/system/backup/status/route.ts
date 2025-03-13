import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { SystemStatus } from '@/models/SystemStatus'
import mongoose from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Try to connect to the database
    try {
      await connectDB()
    } catch (dbError) {
      console.error('Database connection error:', dbError)
      // Return a default status object instead of failing
      return NextResponse.json({ 
        status: { 
          type: 'backup',
          status: 'idle', 
          message: 'Could not connect to database to check status',
          updatedAt: new Date()
        },
        connectionError: true
      })
    }
    
    // Check if the SystemStatus model is defined
    if (!mongoose.models.SystemStatus) {
      console.warn('SystemStatus model is not defined')
      return NextResponse.json({ 
        status: { 
          type: 'backup',
          status: 'idle', 
          message: 'System status tracking is not available',
          updatedAt: new Date()
        },
        modelError: true
      })
    }
    
    // Get backup status from database
    try {
      const status = await SystemStatus.findOne({ type: 'backup' })
      
      return NextResponse.json({ 
        status: status || { 
          type: 'backup',
          status: 'idle', 
          message: 'No backup status found',
          updatedAt: new Date()
        } 
      })
    } catch (modelError) {
      console.error('Error querying SystemStatus model:', modelError)
      // Return a default status object instead of failing
      return NextResponse.json({ 
        status: { 
          type: 'backup',
          status: 'idle', 
          message: 'Error retrieving backup status',
          updatedAt: new Date()
        },
        queryError: true
      })
    }
  } catch (error) {
    console.error('Error fetching backup status:', error)
    return NextResponse.json({ 
      status: { 
        type: 'backup',
        status: 'idle', 
        message: 'Failed to fetch backup status',
        updatedAt: new Date()
      },
      error: 'An unexpected error occurred'
    })
  }
} 