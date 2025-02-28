'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function ErrorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  useEffect(() => {
    // Log the error for debugging
    if (error) {
      console.error('Auth error:', error)
    }
  }, [error])

  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Authentication Error</CardTitle>
          <CardDescription>
            {error === 'AccessDenied' 
              ? 'You do not have permission to access this application.' 
              : 'There was a problem with your authentication.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error === 'AccessDenied' 
              ? 'Only authorized administrators can access this application.'
              : error === 'Configuration' 
                ? 'There is a problem with the server configuration.' 
                : 'Please try signing in again or contact support if the problem persists.'}
          </p>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/login')}>
            Back to Login
          </Button>
          <Button>
            <Link href="mailto:support@txwos.com">Contact Support</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
} 