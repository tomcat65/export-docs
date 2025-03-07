import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { z } from 'zod'
import { Types } from 'mongoose'

const clientSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  rif: z.string().min(1, 'RIF is required')
})

interface MongoClient {
  _id: Types.ObjectId
  name: string
  rif: string
  address?: string
  contact?: Record<string, any>
  requiredDocuments?: any[]
  lastDocumentDate?: string
  createdAt: Date
  updatedAt: Date
  __v: number
}

export async function GET(request: NextRequest) {
  try {
    console.log('API: Connecting to database...')
    await connectDB()
    
    console.log('API: Fetching clients...')
    const clients = (await Client.find({}).lean().exec()) as unknown as MongoClient[]
    
    if (!Array.isArray(clients)) {
      console.error('API: Expected clients to be an array but got:', typeof clients)
      return NextResponse.json([], { status: 500 })
    }

    const mappedClients = clients.map(client => ({
      id: client._id.toString(),
      name: client.name,
      rif: client.rif,
      address: client.address,
      lastDocument: client.lastDocumentDate ? {
        date: client.lastDocumentDate,
        type: 'BOL'
      } : undefined
    }))

    console.log('API: Successfully retrieved clients:', mappedClients.length)
    return NextResponse.json(mappedClients)
  } catch (error) {
    console.error('API: Error fetching clients:', error)
    return NextResponse.json([], { status: 500 })
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