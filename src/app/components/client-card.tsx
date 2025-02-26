import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

interface ClientCardProps {
  client: {
    id: string
    name: string
    rif: string
    lastDocument?: Date | null
  }
}

export function ClientCard({ client }: ClientCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="font-semibold">{client.name}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Link href={`/dashboard/clients/${client.id}/edit`} className="w-full">
                Edit Client
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href={`/dashboard/clients/${client.id}/documents`} className="w-full">
                View Documents
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          RIF: {client.rif}
        </div>
        <div className="mt-4">
          <Link href={`/dashboard/clients/${client.id}/documents`}>
            <Button variant="outline" className="w-full">
              <FileText className="mr-2 h-4 w-4" />
              View Documents
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
} 