import { config } from 'dotenv'
import mongoose from 'mongoose'
import { AdminUser } from '../src/models/AdminUser'

// Load environment variables
config()

const MONGODB_URI = process.env.MONGODB_URI!
console.log('MongoDB URI:', MONGODB_URI)

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env')
}

async function createAdmin() {
  try {
    console.log('Attempting to connect to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    const adminEmails = [
      { email: 'de@txwos.com', name: 'Diego' },
      { email: 'talvarez@txwos.com', name: 'Tomas' },
      { email: 'txwos.diego@gmail.com', name: 'Diego' },
      { email: 'txwos.tomas@gmail.com', name: 'Tomas' }
    ]

    for (const admin of adminEmails) {
      console.log(`Checking admin: ${admin.email}`)
      const existingAdmin = await AdminUser.findOne({ email: admin.email.toLowerCase() })
      
      if (!existingAdmin) {
        await AdminUser.create({
          email: admin.email.toLowerCase(),
          name: admin.name
        })
        console.log(`Created admin user: ${admin.email}`)
      } else {
        console.log(`Admin user already exists: ${admin.email}`)
      }
    }

    console.log('Admin users created successfully')
  } catch (error) {
    console.error('Error creating admin users:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

createAdmin() 