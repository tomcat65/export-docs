'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LoginForm } from '@/components/login-form'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    console.log('Login page auth state:', { status, isAdmin: session?.user?.isAdmin })
    
    // Only redirect if we're authenticated and admin
    if (status === 'authenticated' && session?.user?.isAdmin) {
      console.log('Redirecting to dashboard from login - user is admin')
      router.push('/dashboard')
    }
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

  // Show login form for unauthenticated users or non-admin users
  return <LoginForm />
} 