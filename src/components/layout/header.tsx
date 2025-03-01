'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { UserNav } from '@/components/user-nav'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Trash2, FileImage, Database } from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Clients', href: '/dashboard/clients' },
  { name: 'Assets', href: '/dashboard/assets', icon: FileImage }
]

export function Header() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { toast } = useToast()
  const router = useRouter()
  const [isCleaning, setIsCleaning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleCleanup = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/documents/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cleanupFiles: true
        })
      })
      
      if (!response.ok) {
        throw new Error('Database cleanup failed')
      }
      
      const result = await response.json()
      toast({
        title: 'Database Cleanup Complete',
        description: result.message || `Cleaned up ${result.totalDeleted} items`,
      })
    } catch (error) {
      toast({
        title: 'Cleanup Failed',
        description: error instanceof Error ? error.message : 'An error occurred during cleanup',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <header className="border-b">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center">
          <Link href="/dashboard" className="mr-6">
            <Image src="/txwos-logo.png" alt="TXWOS Logo" width={24} height={24} priority />
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'transition-colors hover:text-foreground/80 flex items-center',
                  pathname === item.href ? 'text-foreground' : 'text-foreground/60'
                )}
              >
                {item.icon && <item.icon className="w-4 h-4 mr-2" />}
                {item.name}
              </Link>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'transition-colors hover:text-foreground/80',
                isLoading ? 'text-foreground' : 'text-foreground/60'
              )}
              onClick={handleCleanup}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  Cleanup DB
                </>
              )}
            </Button>
          </nav>
        </div>
        {session?.user && <UserNav user={session.user} />}
      </div>
    </header>
  )
} 