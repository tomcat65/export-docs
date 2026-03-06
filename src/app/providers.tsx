'use client'

import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, useRef } from 'react'
import { SwrProvider } from '@/hooks/swr/swr-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const queryClientRef = useRef<QueryClient | null>(null)
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30 * 1000, // 30 seconds
          retry: 1,
        },
      },
    })
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClientRef.current}>
        <SwrProvider>
          {children}
        </SwrProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
} 