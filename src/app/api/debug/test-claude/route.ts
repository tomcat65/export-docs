import { NextRequest, NextResponse } from 'next/server';
import { sendTextToClaude, testAnthropicConnection } from '@/lib/anthropic-fetch';

export async function GET(request: NextRequest) {
  console.log('Testing Claude API connection...');
  
  try {
    // First verify connection works
    const connectionTest = await testAnthropicConnection();
    
    if (!connectionTest) {
      console.error('Claude API connection test failed');
      return NextResponse.json({
        success: false,
        error: 'Claude API connection test failed'
      }, { status: 500 });
    }
    
    // If connection works, try a simple query
    const response = await sendTextToClaude(
      'Give me a brief response to confirm you are working. Limit to one sentence.',
      'You are Claude, an AI assistant. Keep your response very brief.'
    );
    
    return NextResponse.json({
      success: true,
      message: 'Claude API connection successful',
      response: response.content[0].text,
      apiDetails: {
        model: response.model,
        usage: response.usage
      }
    });
  } catch (error) {
    console.error('Error testing Claude API connection:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 