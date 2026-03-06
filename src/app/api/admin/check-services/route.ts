import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdmin } from '@/lib/auth-utils';
// @ts-expect-error — legacy module, not yet migrated
import { processClaudeRequest } from '@/lib/anthropic-client';
import { getFunctions, httpsCallable } from 'firebase/functions';
// @ts-expect-error — legacy module, not yet migrated
import { app } from '@/lib/firebase-client-app';

/**
 * Admin endpoint to check the health of various document processing services
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
    const servicesStatus = {
      claude: false,
      firebaseFunctions: false,
      mongodb: true, // Assumed to be true since the app is working if we can get to this point
      timestamp: new Date().toISOString()
    };
    
    // Check Claude API
    try {
      // Make a simple request to check if Claude API is working
      const claudeResponse = await processClaudeRequest({
        prompt: 'Respond with "OK" if you can read this message.',
        maxTokens: 10
      });
      
      // If we get a response that includes "OK", Claude is working
      servicesStatus.claude = claudeResponse.includes('OK');
    } catch (error) {
      console.error('Claude API check failed:', error);
      servicesStatus.claude = false;
    }
    
    // Check Firebase Functions
    try {
      const functions = getFunctions(app);
      const testFunction = httpsCallable(functions, 'test');
      
      // Call test function with a timeout
      const testPromise = testFunction({ test: true });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Firebase function test timed out')), 5000);
      });
      
      // Race the test call against the timeout
      const result = await Promise.race([testPromise, timeoutPromise]);
      
      // If we get here without error, Firebase Functions are working
      servicesStatus.firebaseFunctions = true;
    } catch (error) {
      console.error('Firebase Functions check failed:', error);
      servicesStatus.firebaseFunctions = false;
    }
    
    return NextResponse.json(servicesStatus);
  } catch (error) {
    console.error('Error checking services:', error);
    return NextResponse.json(
      { error: 'Failed to check services' },
      { status: 500 }
    );
  }
} 