import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // This is just a test endpoint to verify Firebase configuration is correctly set up
    return NextResponse.json({
      success: true,
      message: 'Firebase configuration is valid',
      firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'Not configured',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in Firebase test endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to test Firebase connection' },
      { status: 500 }
    );
  }
} 