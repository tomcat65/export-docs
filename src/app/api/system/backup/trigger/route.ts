import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exec } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get backup type from request
    const { type = 'daily' } = await request.json()
    
    // Validate backup type
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return NextResponse.json({ 
        error: 'Invalid backup type. Must be daily, weekly, or monthly.' 
      }, { status: 400 })
    }
    
    // Get path to backup script
    const scriptPath = path.join(process.cwd(), 'scripts', 'backup', 'backup-database.js')
    
    // Run backup asynchronously (don't wait for it to complete)
    const childProcess = exec(`node ${scriptPath} ${type}`)
    
    // Return success response immediately
    return NextResponse.json({ 
      success: true, 
      message: `${type} backup triggered` 
    })
  } catch (error) {
    console.error('Error triggering backup:', error)
    return NextResponse.json(
      { error: 'Failed to trigger backup' },
      { status: 500 }
    )
  }
} 