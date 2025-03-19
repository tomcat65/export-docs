import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';

export async function GET(request: NextRequest) {
  console.log('Testing Anthropic API connection with different auth methods');
  
  const results: Record<string, any> = {
    sdk: null,
    fetch_xapi: null,
    fetch_bearer: null,
    fetch_both: null
  };
  
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({ 
      error: 'Missing API key', 
      key_starts_with: apiKey ? apiKey.substring(0, 10) : 'undefined'
    }, { status: 500 });
  }
  
  // Test log the key format (first 10 chars for safety)
  console.log('Using API key (first 10 chars):', apiKey.substring(0, 10) + '...');
  
  // Basic message for testing
  const message = {
    model: 'claude-3-7-sonnet-20250219',
    max_tokens: 30,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: 'Say hello - this is a test message'
      }
    ]
  };
  
  // Test 1: Use the SDK
  try {
    console.log('Test 1: Using Anthropic SDK');
    const anthropic = new Anthropic({ apiKey });
    
    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 30,
      messages: [
        {
          role: 'user',
          content: 'Say hello - this is a test message'
        }
      ]
    });
    
    results.sdk = {
      success: true,
      content: response.content[0] && response.content[0].type === 'text' 
        ? response.content[0].text 
        : 'Non-text response'
    };
  } catch (error: any) {
    results.sdk = {
      success: false,
      error: error.message,
      status: error.status || 'unknown'
    };
    console.error('SDK test failed:', error);
  }
  
  // Test 2: Fetch with x-api-key
  try {
    console.log('Test 2: Using fetch with x-api-key');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} - ${await response.text()}`);
    }
    
    const data = await response.json();
    results.fetch_xapi = {
      success: true,
      content: data.content[0]?.text || 'No text content'
    };
  } catch (error: any) {
    results.fetch_xapi = {
      success: false,
      error: error.message
    };
    console.error('Fetch x-api-key test failed:', error);
  }
  
  // Test 3: Fetch with Bearer token
  try {
    console.log('Test 3: Using fetch with Bearer token');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Anthropic-Version': '2023-06-01'
      },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} - ${await response.text()}`);
    }
    
    const data = await response.json();
    results.fetch_bearer = {
      success: true,
      content: data.content[0]?.text || 'No text content'
    };
  } catch (error: any) {
    results.fetch_bearer = {
      success: false,
      error: error.message
    };
    console.error('Fetch Bearer token test failed:', error);
  }
  
  // Test 4: Fetch with both authentication methods
  try {
    console.log('Test 4: Using fetch with both auth methods');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Anthropic-Version': '2023-06-01'
      },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} - ${await response.text()}`);
    }
    
    const data = await response.json();
    results.fetch_both = {
      success: true,
      content: data.content[0]?.text || 'No text content'
    };
  } catch (error: any) {
    results.fetch_both = {
      success: false,
      error: error.message
    };
    console.error('Fetch both methods test failed:', error);
  }
  
  return NextResponse.json({
    api_key_format: apiKey.substring(0, 10) + '...',
    results
  });
} 