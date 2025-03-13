'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

export function BackupNotification() {
  const [backupInProgress, setBackupInProgress] = useState(false)
  const [errorCount, setErrorCount] = useState(0)
  
  useEffect(() => {
    // Helper function to check backup status
    const checkBackupStatus = async () => {
      try {
        const response = await fetch('/api/system/backup/status')
        
        if (!response.ok) {
          // Error or unauthorized, don't show notification
          setErrorCount(prev => prev + 1)
          return
        }
        
        // Reset error count on successful request
        setErrorCount(0)
        
        const data = await response.json()
        setBackupInProgress(data.status?.status === 'in_progress')
      } catch (error) {
        console.error('Failed to check backup status:', error)
        setErrorCount(prev => prev + 1)
      }
    }
    
    // Check status immediately
    checkBackupStatus()
    
    // Calculate interval based on error count (exponential backoff)
    // Start with 30 seconds, but increase with errors up to 5 minutes maximum
    const interval = setInterval(
      checkBackupStatus, 
      Math.min(30000 * Math.pow(1.5, errorCount), 300000)
    )
    
    // Clean up the interval when the component unmounts
    return () => clearInterval(interval)
  }, [errorCount])
  
  // If no backup is in progress, don't render anything
  if (!backupInProgress) {
    return null
  }
  
  // Show a notification banner for active backups
  return (
    <div className="fixed top-0 inset-x-0 bg-amber-100 text-amber-800 py-1 px-4 flex items-center justify-center z-50">
      <Loader2 className="animate-spin h-4 w-4 mr-2" />
      <span className="text-sm">System backup in progress. Some operations may be slower than usual.</span>
    </div>
  )
} 