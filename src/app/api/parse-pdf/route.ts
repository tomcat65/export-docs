import { NextRequest } from 'next/server'
import * as pdfParse from 'pdf-parse'

// Configure the runtime to use Node.js
export const runtime = 'nodejs'

// Configure the allowed methods
export const dynamic = 'force-dynamic'

// Configure CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  })
}

export async function POST(request: NextRequest) {
  console.log('PDF parsing request received')
  console.log('Request headers:', Object.fromEntries(request.headers.entries()))

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    
    if (!file) {
      console.error('No file provided')
      return new Response(
        JSON.stringify({ error: 'No file uploaded' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Processing file:', {
      name: file.name,
      type: file.type,
      size: file.size
    })

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      console.error('Invalid file type:', file.type)
      return new Response(
        JSON.stringify({ error: 'File must be a PDF' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    console.log('Buffer size:', buffer.length)

    const result = await pdfParse(buffer)
    console.log('PDF parsed, text length:', result.text?.length)

    if (!result.text) {
      console.error('No text extracted')
      return new Response(
        JSON.stringify({ error: 'No text extracted' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({
        text: result.text,
        pageCount: result.numpages
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('PDF parsing error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to parse PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
} 