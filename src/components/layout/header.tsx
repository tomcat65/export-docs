'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { UserNav } from '@/components/user-nav'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Trash2, FileImage } from 'lucide-react'
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

  const handleCleanup = async () => {
    try {
      setIsCleaning(true)
      const response = await fetch('/api/documents/cleanup', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to cleanup documents')
      }

      const data = await response.json()
      
      toast({
        title: 'Cleanup Complete',
        description: `Processed ${data.stats.processed} BOLs, deleted ${data.stats.deleted} duplicates${data.stats.errors ? `, with ${data.stats.errors} errors` : ''}`
      })

      router.refresh()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cleanup documents',
        variant: 'destructive'
      })
    } finally {
      setIsCleaning(false)
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
                isCleaning ? 'text-foreground' : 'text-foreground/60'
              )}
              onClick={handleCleanup}
              disabled={isCleaning}
            >
              {isCleaning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cleanup Files
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