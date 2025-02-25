import { getAuth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Client } from '@/models/Client'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('Checking auth...')
    const session = await getAuth()
    
    if (!session?.user?.isAdmin) {
      console.log('Unauthorized access attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Connecting to MongoDB...')
    await connectDB()
    console.log('Successfully connected to MongoDB')
    
    const clients = await Client.find({}).sort({ name: 1 })
    console.log('Found clients:', clients)
    
    return NextResponse.json(clients)
  } catch (error) {
    console.error('Error in /api/clients:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuth()
    
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, rif, address, contact, requiredDocuments } = body

    if (!name || !rif || !address) {
      return NextResponse.json({ error: 'Name, RIF, and address are required' }, { status: 400 })
    }

    await connectDB()
    
    const existingClient = await Client.findOne({ rif: rif.trim().toUpperCase() })
    if (existingClient) {
      return NextResponse.json({ error: 'Client with this RIF already exists' }, { status: 400 })
    }

    const newClient = await Client.create({
      name: name.trim(),
      rif: rif.trim().toUpperCase(),
      address: address.trim(),
      contact,
      requiredDocuments
    })

    return NextResponse.json(newClient)
  } catch (error) {
    console.error('Error creating client:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
} 