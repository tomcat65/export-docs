import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdmin } from '@/lib/auth-utils';

/**
 * Admin endpoint to check if required API credentials are properly configured
 */
export async function GET() {
  try {
    // Check authentication and admin permissions
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Only allow admins to access this endpoint
    if (!isAdmin(session)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }
    
    // Initialize the status object
    const credentialsStatus = {
      anthropic: false,
      firebase: false,
      mongodb: false,
      timestamp: new Date().toISOString()
    };
    
    // Check if Anthropic API key exists
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    credentialsStatus.anthropic = !!anthropicApiKey && anthropicApiKey.length > 10;
    
    // Check Firebase credentials
    const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
    credentialsStatus.firebase = !!firebaseApiKey && !!firebaseAppId;
    
    // Check MongoDB connection string
    const mongodbUri = process.env.MONGODB_URI;
    credentialsStatus.mongodb = !!mongodbUri && mongodbUri.length > 10;
    
    return NextResponse.json(credentialsStatus);
  } catch (error) {
    console.error('Error checking credentials:', error);
    return NextResponse.json(
      { error: 'Failed to check credentials' },
      { status: 500 }
    );
  }
} 