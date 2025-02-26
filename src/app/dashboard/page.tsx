import { ClientCard } from '@/components/client-card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { BolUploadSection } from '@/components/bol-upload-section'
import { Types } from 'mongoose'

async function getClients() {
  await connectDB()
  const clients = await Client.find({})
    .sort({ name: 1 })
    .lean()
  
  return clients.map(client => ({
    id: client._id?.toString() || '',
    name: client.name as string,
    rif: client.rif as string,
    lastDocument: client.lastDocument as { date: string; type: string } | undefined
  }))
}

export default async function DashboardPage() {
  const clients = await getClients()

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link href="/dashboard/clients/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No clients found. Add your first client to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <BolUploadSection clients={clients} />

          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Clients</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {clients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 