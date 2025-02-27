import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { ClientCard } from '@/components/client-card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Types } from 'mongoose'

interface MongoClient {
  _id: Types.ObjectId
  name: string
  rif: string
  address?: string
  lastDocumentDate?: string
  __v: number
  createdAt: Date
  updatedAt: Date
}

async function getClients() {
  await connectDB()
  const clients = await Client.find({}).sort({ name: 1 }).lean().exec()
  
  return (clients as unknown as MongoClient[]).map(client => ({
    id: client._id.toString(),
    name: client.name,
    rif: client.rif,
    address: client.address,
    lastDocument: client.lastDocumentDate ? {
      date: client.lastDocumentDate,
      type: 'BOL'
    } : undefined
  }))
}

export default async function ClientsPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    redirect('/login')
  }

  const clients = await getClients()

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Clients</h1>
        <Link href="/dashboard/clients/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="text-center">
          <p className="text-muted-foreground">No clients found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  )
} 