import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-react'
import { signOut } from 'next-auth/react'

interface UserNavProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export function UserNav({ user }: UserNavProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-accent">
          <User className="h-5 w-5 text-muted-foreground" />
          <span className="hidden sm:inline text-sm font-medium">
            {user.name || user.email?.split('@')[0] || 'User'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium leading-none mb-1">{user.name || 'User'}</p>
          {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
        </div>
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-sm cursor-pointer flex items-center gap-2"
        >
          <LogOut className="h-4 w-4 mr-1" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 