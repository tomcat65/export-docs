import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Log environment information
    const env = {
      NODE_ENV: process.env.NODE_ENV || 'undefined',
      VERCEL: process.env.VERCEL || 'undefined',
      VERCEL_ENV: process.env.VERCEL_ENV || 'undefined',
      VERCEL_REGION: process.env.VERCEL_REGION || 'undefined',
      VERCEL_URL: process.env.VERCEL_URL || 'undefined',
    };
    
    console.log('Environment variables:', env);
    
    // Test Anthropic API key format without exposing it
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    const keyInfo = {
      exists: !!apiKey,
      length: apiKey.length,
      startsWithCorrectPrefix: apiKey.startsWith('sk-ant-api03-'),
      truncated: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'N/A'
    };
    
    console.log('API Key details:', keyInfo);
    
    // Test basic fetch to Anthropic API with minimal request
    let fetchResult;
    try {
      // Simple connectivity test (will error with 400 for invalid request, but that's fine)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'HEAD',
        headers: {
          'x-api-key': apiKey,
          'Anthropic-Version': '2023-06-01'
        }
      });
      
      fetchResult = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries([...response.headers])
      };
      
      console.log('Fetch test result:', fetchResult);
    } catch (fetchError) {
      fetchResult = {
        error: true,
        message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        name: fetchError instanceof Error ? fetchError.name : 'UnknownError'
      };
      
      console.error('Fetch test error:', fetchResult);
    }
    
    // Test TCP connectivity to Anthropic API
    let tcpResult;
    try {
      const tcpController = new AbortController();
      const timeoutId = setTimeout(() => tcpController.abort(), 5000);
      
      const tcpResponse = await fetch('https://api.anthropic.com', {
        method: 'GET',
        signal: tcpController.signal
      });
      
      clearTimeout(timeoutId);
      
      tcpResult = {
        connected: true,
        status: tcpResponse.status
      };
      
      console.log('TCP connectivity test result:', tcpResult);
    } catch (tcpError) {
      tcpResult = {
        connected: false,
        error: tcpError instanceof Error ? tcpError.message : 'Unknown error'
      };
      
      console.error('TCP connectivity test error:', tcpResult);
    }
    
    // Return all diagnostic information
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: env,
      apiKey: keyInfo,
      fetchTest: fetchResult,
      tcpConnectivity: tcpResult,
      tips: [
        "If apiKey.startsWithCorrectPrefix is false, update your environment variable",
        "If tcpConnectivity.connected is false, there may be network restrictions",
        "If fetchTest.status is 401, your API key may be invalid or revoked",
        "Make sure ANTHROPIC_API_KEY is set correctly in Vercel environment variables"
      ]
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 