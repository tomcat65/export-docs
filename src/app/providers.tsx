'use client'

import { SessionProvider } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { SwrProvider } from '@/hooks/swr/swr-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <SessionProvider>
      <SwrProvider>
        {children}
      </SwrProvider>
    </SessionProvider>
  )
} 