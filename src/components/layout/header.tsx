'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { UserNav } from '@/components/user-nav'
import { useSession } from 'next-auth/react'
import Image from 'next/image'

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Clients', href: '/dashboard/clients' },
  { name: 'Documents', href: '/dashboard/documents' }
]

export function Header() {
  const pathname = usePathname()
  const { data: session } = useSession()

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
                  'transition-colors hover:text-foreground/80',
                  pathname === item.href ? 'text-foreground' : 'text-foreground/60'
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
        {session?.user && <UserNav user={session.user} />}
      </div>
    </header>
  )
} 