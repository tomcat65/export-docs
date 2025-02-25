import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env')
}

let cached = global as any

if (!cached.mongoose) {
  cached.mongoose = { conn: null, promise: null }
}

export async function connectDB() {
  if (cached.mongoose.conn) {
    console.log('Using cached database connection')
    return cached.mongoose.conn
  }

  if (!cached.mongoose.promise) {
    console.log('Creating new database connection')
    console.log('MongoDB URI:', MONGODB_URI)
    
    const opts = {
      bufferCommands: false,
    }

    cached.mongoose.promise = mongoose.connect(MONGODB_URI, opts)
  }

  try {
    console.log('Awaiting database connection...')
    cached.mongoose.conn = await cached.mongoose.promise
    console.log('Successfully connected to database')
  } catch (e) {
    console.error('Error connecting to database:', e)
    cached.mongoose.promise = null
    throw e
  }

  return cached.mongoose.conn
} 