'use client'

import { Button } from '@/components/ui/button'
import { signOut, useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { FileText, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'

export function NavMenu() {
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4 container mx-auto">
        <div className="flex items-center gap-4">
          <Image
            src="/txwos-logo.png"
            alt="TXWOS Logo"
            width={40}
            height={40}
          />
          <span className="font-semibold">Document Export System</span>
        </div>

        <nav className="flex items-center ml-auto space-x-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            <Button variant="ghost" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
            </Button>
          </Link>

          <div className="ml-auto flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              {session?.user?.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      </div>
    </div>
  )
} 