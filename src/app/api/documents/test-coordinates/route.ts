import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * API endpoint to test custom coordinates for document regeneration
 * This helps fine-tune the coordinates without modifying code
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get document ID and coordinates from request
    const { documentId, coordinates, debug } = await request.json()
    
    // Ensure debug is strictly boolean false by default
    const debugMode = debug === true
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }
    
    console.log('Testing coordinates:', JSON.stringify(coordinates, null, 2));
    
    // Make a request to the regenerate endpoint with custom coordinates
    const regenerateUrl = `/api/documents/${documentId}/regenerate`
    const response = await fetch(new URL(regenerateUrl, request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '' // Forward cookies for auth
      },
      body: JSON.stringify({
        coordinates, // Contains both topRight and original section coordinates
        debug: debugMode // Ensure debug mode is explicitly boolean
      })
    })
    
    // Forward the response back to the client
    const data = await response.json()
    return NextResponse.json({
      message: 'Regeneration with custom coordinates completed',
      result: data,
      // Include the coordinates used for reference
      coordinatesUsed: coordinates
    })
  } catch (error) {
    console.error('Error testing coordinates:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to test coordinates' },
      { status: 500 }
    )
  }
} 