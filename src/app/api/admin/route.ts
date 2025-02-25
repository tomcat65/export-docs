import { getAuth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { AdminUser } from '@/models/AdminUser'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getAuth()
    
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()
    const admins = await AdminUser.find({}).select('-__v').sort({ createdAt: -1 })
    
    return NextResponse.json(admins)
  } catch (error) {
    console.error('Error fetching admins:', error)
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
    const { email, name } = body

    if (!email || !name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
    }

    await connectDB()
    
    const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase() })
    if (existingAdmin) {
      return NextResponse.json({ error: 'Admin already exists' }, { status: 400 })
    }

    const newAdmin = await AdminUser.create({
      email: email.toLowerCase(),
      name
    })

    return NextResponse.json(newAdmin)
  } catch (error) {
    console.error('Error creating admin:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuth()
    
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    await connectDB()
    
    const result = await AdminUser.findOneAndDelete({ email: email.toLowerCase() })
    if (!result) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Admin deleted successfully' })
  } catch (error) {
    console.error('Error deleting admin:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
} 