'use client'

import { Button } from '@/components/ui/button'
import { Plus, Building2, FileText } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Client {
  _id: string
  name: string
  rif: string
  contact: {
    name: string
    email: string
  }
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('Fetching clients...')
    fetch('/api/clients')
      .then(res => {
        console.log('Response status:', res.status)
        return res.json()
      })
      .then(data => {
        console.log('Received client data:', data)
        setClients(data)
        setLoading(false)
      })
      .catch(error => {
        console.error('Error fetching clients:', error)
        setLoading(false)
      })
  }, [])

  console.log('Current clients state:', clients)
  console.log('Loading state:', loading)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Clients</h1>
        <Link href="/dashboard/clients/new">
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <Link
            key={client._id}
            href={`/dashboard/clients/${client._id}`}
            className="bg-white p-6 rounded-lg shadow-sm border hover:border-primary transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-semibold">{client.name}</h3>
                  <p className="text-sm text-muted-foreground">RIF: {client.rif}</p>
                  {client.contact?.name && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Contact: {client.contact.name}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </Link>
        ))}

        {clients.length === 0 && (
          <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg border border-dashed">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No clients yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Get started by adding your first client
            </p>
            <Link href="/dashboard/clients/new">
              <Button variant="outline" className="mt-4">
                Add Client
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
} 