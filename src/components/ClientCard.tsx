'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

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
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="line-clamp-1" title={client.name}>
          {client.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="space-y-2">
          <div>
            <span className="text-sm text-muted-foreground">RIF:</span>
            <span className="ml-2">{client.rif}</span>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Last Document:</span>
            <span className="ml-2">
              {client.lastDocument ? formatDate(client.lastDocument) : 'No documents yet'}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <Link href={`/dashboard/clients/${client.id}`}>
            View Details
          </Link>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          asChild
        >
          <Link href={`/dashboard/clients/${client.id}/documents/upload`}>
            Upload Document
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
} 