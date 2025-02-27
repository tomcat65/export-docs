import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('Checking auth...')
    const session = await auth()
    
    if (!session?.user?.isAdmin) {
      console.log('Unauthorized access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Connecting to MongoDB...')
    await connectDB()
    console.log('Successfully connected to MongoDB')
    
    const { id } = await params
    const client = await Client.findById(id)
    console.log('Found client:', client)
    
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    
    return NextResponse.json(client)
  } catch (error) {
    console.error('Error in /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, rif, address, contact, requiredDocuments } = body

    if (!name || !rif || !address) {
      return NextResponse.json({ error: 'Name, RIF, and address are required' }, { status: 400 })
    }

    await connectDB()
    
    // Check if another client has the same RIF (excluding current client)
    const existingClient = await Client.findOne({
      rif: rif.trim().toUpperCase(),
      _id: { $ne: id }
    })
    
    if (existingClient) {
      return NextResponse.json({ error: 'Another client with this RIF already exists' }, { status: 400 })
    }

    const updatedClient = await Client.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        rif: rif.trim().toUpperCase(),
        address: address.trim(),
        contact,
        requiredDocuments,
        updatedAt: new Date()
      },
      { new: true }
    )

    if (!updatedClient) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json(updatedClient)
  } catch (error) {
    console.error('Error updating client:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
} 