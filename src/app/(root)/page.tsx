'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    console.log('Root page auth state:', { status, isAdmin: session?.user?.isAdmin })
    
    // Only redirect if we have a definitive session state
    if (status === 'authenticated') {
      if (session?.user?.isAdmin) {
        console.log('Redirecting to dashboard - user is admin')
        router.push('/dashboard')
      } else {
        console.log('Redirecting to login - user is not admin')
        router.push('/login')
      }
    } else if (status === 'unauthenticated') {
      console.log('Redirecting to login - user is not authenticated')
      router.push('/login')
    }
    // Don't redirect while loading
  }, [session, status, router])

  // Show loading state while determining session
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Loading...</h2>
        </div>
      </div>
    )
  }

  return null
} 