'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { createSwrConfig } from '@/hooks/swr/swr-config'
import { useSession } from 'next-auth/react'

export function BackupNotification() {
  // Always call hooks at the top level, never inside conditions
  // This ensures hooks are called in the same order on every render
  const { data: session, status } = useSession({ required: false })
  const isAuthenticated = status === 'authenticated'
  
  // Create the SWR config once per component instance
  const swrConfig = createSwrConfig({
    refreshInterval: 300000, // 5 minutes
    revalidateOnFocus: false, // Don't need to check on focus for this feature
    dedupingInterval: 60000, // 1 minute
  })
  
  // Always call useSWR with a key, even if it's conditionally null
  // This way the hook is always called in the same order
  const { data, error } = useSWR(
    isAuthenticated ? '/api/system/backup/status' : null,
    async (url) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch backup status')
      }
      return response.json()
    },
    swrConfig
  )
  
  // Process data only if authenticated
  if (!isAuthenticated) {
    return null
  }
  
  // Derive backup status from SWR data
  const backupInProgress = data?.status?.status === 'in_progress'
  
  // If no backup is in progress or data is still loading, don't render anything
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