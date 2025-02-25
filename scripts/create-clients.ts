import { config } from 'dotenv'
import mongoose from 'mongoose'
import path from 'path'

// Load environment variables from the project root .env file
config({ path: path.resolve(__dirname, '../.env') })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env')
}

// Define the Client schema directly in the script to avoid path issues
const ClientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  rif: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  address: {
    type: String,
    required: true
  },
  contact: {
    name: String,
    email: String,
    phone: String
  },
  requiredDocuments: [{
    type: String,
    enum: ['COO', 'COA', 'Invoice', 'PackingList', 'SED']
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

const Client = mongoose.models.Client || mongoose.model('Client', ClientSchema)

async function createClients() {
  try {
    console.log('Connecting to MongoDB...')
    console.log('MongoDB URI:', MONGODB_URI)
    
    await mongoose.connect(MONGODB_URI!)
    console.log('Successfully connected to MongoDB')
    
    // Create Industrias Quimicas LMV CA
    const lmv = await Client.create({
      name: 'Industrias Quimicas LMV CA',
      rif: 'J-00000000-0', // Placeholder RIF
      address: 'Venezuela',
      contact: {
        name: '',
        email: '',
        phone: ''
      },
      requiredDocuments: ['COO', 'COA', 'Invoice', 'PackingList']
    })
    console.log('Created client:', lmv.name)

    // Create Keystone
    const keystone = await Client.create({
      name: 'Keystone',
      rif: 'K-00000000-0', // Placeholder RIF
      address: 'United States',
      contact: {
        name: '',
        email: '',
        phone: ''
      },
      requiredDocuments: ['COO', 'COA', 'Invoice', 'PackingList', 'SED']
    })
    console.log('Created client:', keystone.name)

  } catch (error) {
    console.error('Error creating clients:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
    process.exit()
  }
}

createClients() 