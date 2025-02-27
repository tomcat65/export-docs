'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Edit, Trash2, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { useRouter } from 'next/navigation'

interface Client {
  id: string
  name: string
  rif: string
  address?: string
  lastDocument?: {
    date: string
    type: string
  }
}

interface ClientCardProps {
  client: Client
}

export function ClientCard({ client }: ClientCardProps) {
  const router = useRouter()
  const { toast } = useToast()

  async function handleDelete() {
    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete client')
      }

      toast({
        title: 'Success',
        description: 'Client deleted successfully'
      })

      router.refresh()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete client',
        variant: 'destructive'
      })
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="space-y-0 pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">{client.name}</CardTitle>
            <CardDescription>RIF: {client.rif}</CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/clients/${client.id}/edit`} className="flex items-center">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Client
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/clients/${client.id}/documents`} className="flex items-center">
                  <FileText className="mr-2 h-4 w-4" />
                  View Documents
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {client.address && (
          <CardDescription className="mt-2 text-sm border-l-2 border-muted pl-3">
            {client.address}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {client.lastDocument ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Last Document</p>
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span className="text-sm">{client.lastDocument.type}</span>
              <span className="text-sm text-muted-foreground">
                ({new Date(client.lastDocument.date).toLocaleDateString()})
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No documents yet</p>
        )}
      </CardContent>
      <CardFooter>
        <Link href={`/dashboard/clients/${client.id}/documents`} className="w-full">
          <Button variant="outline" className="w-full">
            <FileText className="mr-2 h-4 w-4" />
            View Documents
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
} 