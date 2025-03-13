import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get backup logs directory
    const logsDir = path.join(process.cwd(), 'logs')
    
    // Check if logs directory exists
    if (!fs.existsSync(logsDir)) {
      return NextResponse.json({ 
        history: [] 
      })
    }
    
    // Read log files
    const files = await readdir(logsDir)
    
    // Filter for backup log files
    const backupLogs = files.filter(file => file.startsWith('backup-'))
    
    // Get details for each log file
    const logDetails = await Promise.all(
      backupLogs.map(async (file) => {
        const filePath = path.join(logsDir, file)
        const stats = await stat(filePath)
        
        // Parse file name to get backup type
        // Format: backup-TYPE-DATE.log
        const parts = file.split('-')
        const type = parts[1] // daily, weekly, monthly
        
        return {
          file,
          type,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        }
      })
    )
    
    // Sort by modification time, newest first
    const sortedLogs = logDetails.sort((a, b) => 
      b.modifiedAt.getTime() - a.modifiedAt.getTime()
    )
    
    return NextResponse.json({ 
      history: sortedLogs 
    })
  } catch (error) {
    console.error('Error fetching backup history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch backup history' },
      { status: 500 }
    )
  }
} 