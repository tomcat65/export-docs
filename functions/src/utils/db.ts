import * as mongoose from 'mongoose';
import * as logger from 'firebase-functions/logger';
import * as dotenv from 'dotenv';
import * as functions from 'firebase-functions';

dotenv.config();

// MongoDB connection string from environment variable or Firebase config
const MONGODB_URI = process.env.MONGODB_URI || 
  (functions.config().mongodb?.uri || '');

// Check if MongoDB URI is set
if (!MONGODB_URI) {
  logger.error('MongoDB URI is not configured. Check environment variables or Firebase config.');
}

// Connection cache to reuse the same connection
let cachedConnection: typeof mongoose | null = null;

/**
 * Connect to MongoDB. This function uses a cached connection 
 * to avoid creating multiple connections in the same function instance.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (cachedConnection) {
    logger.debug('Using cached MongoDB connection');
    return cachedConnection;
  }

  if (!MONGODB_URI) {
    throw new Error('MongoDB URI is not configured. Check environment variables or Firebase config.');
  }

  logger.info('Connecting to MongoDB...');
  
  try {
    // Set mongoose options
    mongoose.set('strictQuery', false);
    
    // Connect to MongoDB
    const conn = await mongoose.connect(MONGODB_URI);
    
    logger.info('MongoDB connected successfully');
    
    // Cache connection
    cachedConnection = conn;
    return conn;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDB(): Promise<void> {
  if (cachedConnection) {
    await mongoose.disconnect();
    cachedConnection = null;
    logger.info('MongoDB disconnected');
  }
} 