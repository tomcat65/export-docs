import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { z } from 'zod'

const clientSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  rif: z.string().min(1, 'RIF is required')
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    const clients = await Client.find({}).sort({ name: 1 }).lean()

    return Response.json(clients.map(client => ({
      id: client._id.toString(),
      name: client.name,
      rif: client.rif,
      lastDocument: client.lastDocument
    })))
  } catch (error) {
    console.error('Error fetching clients:', error)
    return Response.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = clientSchema.parse(body)

    await connectDB()

    // Check if client with RIF already exists
    const existingClient = await Client.findOne({ rif: validatedData.rif })
    if (existingClient) {
      return Response.json(
        { error: 'A client with this RIF already exists' },
        { status: 400 }
      )
    }

    const client = await Client.create(validatedData)

    return Response.json({
      id: client._id.toString(),
      name: client.name,
      rif: client.rif
    })
  } catch (error) {
    console.error('Error creating client:', error)
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Invalid client data', details: error.errors },
        { status: 400 }
      )
    }
    return Response.json(
      { error: 'Failed to create client' },
      { status: 500 }
    )
  }
} 