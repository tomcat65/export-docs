'use client'

import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { notFound, redirect } from 'next/navigation'
import { EditClientForm } from '@/components/edit-client-form'

interface EditClientPageProps {
  params: {
    id: string
  }
}

async function getClient(id: string) {
  await connectDB()
  const client = await Client.findById(id).lean()
  if (!client) return null

  return {
    id: client._id.toString(),
    name: client.name,
    rif: client.rif
  }
}

export default async function EditClientPage({ params }: EditClientPageProps) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    redirect('/login')
  }

  const client = await getClient(params.id)
  if (!client) notFound()

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Edit Client</h1>
      <EditClientForm client={client} />
    </div>
  )
} 