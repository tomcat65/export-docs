import { NextResponse } from 'next/server'

/**
 * Simple health check endpoint to verify the API is working
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'API is operational'
  })
} 