/**
 * Anthropic API client following the best practices from Anthropic_API.md
 * Provides both SDK and direct fetch methods for maximum compatibility
 */

import { Anthropic } from '@anthropic-ai/sdk';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';
const FETCH_TIMEOUT = 60000; // 60 seconds
const MAX_RETRIES = 2;

// Explicitly load from environment variables each time to avoid any caching issues
function getApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not defined in environment variables');
  }
  
  // Validate the key format
  if (!apiKey.startsWith('sk-ant-api03-')) {
    console.warn('API key does not have the expected format (sk-ant-api03-...)');
  }
  
  return apiKey;
}

// Create a properly configured SDK client
function createAnthropicClient() {
  const apiKey = getApiKey();
  
  return new Anthropic({
    apiKey: apiKey
  });
}

interface DocumentSource {
  type: 'document' | 'image';
  data: string;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

export interface AnthropicRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  messages: AnthropicMessage[];
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Convert SDK response to our standard format
function convertSdkResponse(message: any): AnthropicResponse {
  return {
    id: message.id,
    type: 'message',
    role: message.role,
    content: message.content.map((item: any) => {
      // Handle different response types - ensure text property exists
      if (item.type === 'text') {
        return item;
      } else {
        // For non-text content types, create a placeholder to satisfy type requirements
        return {
          type: item.type,
          text: `[${item.type} content]`
        };
      }
    }),
    model: message.model,
    stopReason: message.stop_reason || '',
    usage: {
      inputTokens: message.usage?.input_tokens || 0,
      outputTokens: message.usage?.output_tokens || 0
    }
  };
}

/**
 * Fetch with timeout and retry functionality
 */
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  retries = MAX_RETRIES, 
  timeout = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // Add abort signal to options
    const fetchOptions = {
      ...options,
      signal: controller.signal
    };
    
    // Try the fetch
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    // Return successful response
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Determine if we should retry
    if (retries > 0 && error instanceof Error) {
      // Different backoff depending on error type
      const backoff = error.name === 'AbortError' 
        ? 1000  // 1 second for timeout
        : 2000; // 2 seconds for other errors
        
      console.log(`Fetch attempt failed, retrying in ${backoff}ms... (${retries} retries left)`);
      console.log(`Error was: ${error.name} - ${error.message}`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, backoff));
      
      // Retry with one fewer retry attempt
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    
    // If we're out of retries, throw the error
    throw error;
  }
}

/**
 * Process a document with Claude using the appropriate method
 * Will try SDK first, then fall back to fetch if needed
 */
export async function processDocumentWithClaude(
  document: { type: 'pdf' | 'image'; data: string },
  systemPrompt: string,
  userPrompt: string
): Promise<AnthropicResponse> {
  console.log(`Processing ${document.type} document with Claude`);
  console.log('ENVIRONMENT:', process.env.NODE_ENV || 'unknown');
  
  // Verify document data
  if (!document.data) {
    throw new Error('Document data is missing');
  }

  // Create content blocks with proper typing for SDK
  let contentBlocks: any[];
  if (document.type === 'pdf') {
    contentBlocks = [
      {
        type: 'text' as const,
        text: userPrompt + "\n\nIMPORTANT: Process ALL pages of the document thoroughly."
      },
      {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: document.data.replace(/^data:application\/pdf;base64,/, '')
        }
      }
    ];
  } else {
    contentBlocks = [
      {
        type: 'text' as const,
        text: userPrompt + "\n\nIMPORTANT: Process ALL pages of the document thoroughly."
      },
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: document.data.replace(/^data:image\/png;base64,/, '')
        }
      }
    ];
  }

  // First try the SDK method as recommended in Anthropic_API.md
  try {
    console.log('Attempting to use Anthropic SDK...');
    const client = createAnthropicClient();
    const apiKey = getApiKey();
    console.log('Using API key (first 8 chars):', apiKey.substring(0, 8) + '...');
    
    const startTime = Date.now();
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: contentBlocks
        }
      ]
    });
    
    console.log(`SDK method succeeded in ${Date.now() - startTime}ms`);
    
    // Convert SDK response to our standard format
    const standardResponse = convertSdkResponse(message);
    
    return standardResponse;
  } catch (sdkError) {
    // Check if this is an authentication error
    if (isAuthError(sdkError)) {
      throw handleAuthError(sdkError);
    }
    
    // If SDK fails for other reasons, log error and try fetch method
    console.error('SDK method failed:', sdkError instanceof Error ? sdkError.message : 'Unknown error');
    console.log('Falling back to direct fetch implementation...');
    
    return processDocumentWithFetch(document, systemPrompt, userPrompt);
  }
}

/**
 * Process a document with Claude using the direct fetch approach
 * This function bypasses the SDK entirely and uses a direct API call with proper headers
 */
export async function processDocumentWithFetch(
  document: { type: 'pdf' | 'image'; data: string },
  systemPrompt: string,
  userPrompt: string
): Promise<AnthropicResponse> {
  console.log(`Processing ${document.type} document with direct fetch`);
  
  // Verify document data
  if (!document.data) {
    throw new Error('Document data is missing');
  }

  const contentBlock = document.type === 'pdf'
    ? {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: document.data.replace(/^data:application\/pdf;base64,/, '')
        }
      }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: document.data.replace(/^data:image\/png;base64,/, '')
        }
      };

  // Create the payload with document
  const payload = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt + "\n\nIMPORTANT: Process ALL pages of the document thoroughly."
          },
          contentBlock
        ]
      }
    ]
  };

  try {
    // Get a fresh API key for each request
    const apiKey = getApiKey();
    console.log('Using API key (first 8 chars):', apiKey.substring(0, 8) + '...');
    
    // Set up headers and request options - follow Anthropic_API.md guidance
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'Anthropic-Version': '2023-06-01'
    };
    
    // Make the API request with timeout and retry logic
    const requestStart = Date.now();
    console.log('Starting API request at:', new Date().toISOString());
    
    const response = await fetchWithRetry(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const requestDuration = Date.now() - requestStart;
    console.log(`Request completed in ${requestDuration}ms`);

    // Handle errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      
      // Check if this is a 401 authentication error
      if (response.status === 401) {
        throw handleAuthError({ status: 401, message: errorText });
      }
      
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    // Parse and return the response
    const result = await response.json();
    console.log('Anthropic API request successful');
    return result;
  } catch (error) {
    // Check if already handled as auth error
    if (error instanceof Error && 
        error.message.includes('TIME TO CHANGE THE API KEY')) {
      throw error; // Re-throw the already formatted error
    }
    
    // Check if this is an authentication error
    if (isAuthError(error)) {
      throw handleAuthError(error);
    }
    
    console.error('Error in processDocumentWithFetch:', error);
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
    }
    throw error;
  }
}

/**
 * Send a simple text message to Claude without any documents
 * Uses SDK by default, falls back to fetch if needed
 */
export async function sendTextToClaude(message: string, system?: string): Promise<AnthropicResponse> {
  try {
    console.log('Sending text message to Claude');
    const apiKey = getApiKey();
    
    // First try SDK
    try {
      console.log('Using SDK method...');
      const client = createAnthropicClient();
      
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1000,
        temperature: 0,
        system: system || 'You are a helpful assistant.',
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      });
      
      console.log('SDK method succeeded');
      
      // Convert SDK response to our standard format
      const standardResponse = convertSdkResponse(response);
      
      return standardResponse;
    } catch (sdkError) {
      // Check if this is an authentication error
      if (isAuthError(sdkError)) {
        throw handleAuthError(sdkError);
      }
      
      // Fall back to fetch if SDK fails for other reasons
      console.error('SDK method failed, trying fetch:', sdkError instanceof Error ? sdkError.message : 'Unknown error');
      
      // Setup for fetch approach
      const payload = {
        model: ANTHROPIC_MODEL,
        max_tokens: 1000,
        temperature: 0,
        system: system || 'You are a helpful assistant.',
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      };
      
      const response = await fetchWithRetry(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Anthropic-Version': '2023-06-01'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Anthropic API error:', response.status, errorText);
        
        // Check if this is a 401 authentication error
        if (response.status === 401) {
          throw handleAuthError({ status: 401, message: errorText });
        }
        
        throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Fetch method succeeded');
      return result;
    }
  } catch (error) {
    // Check if already handled as auth error
    if (error instanceof Error && 
        error.message.includes('TIME TO CHANGE THE API KEY')) {
      throw error; // Re-throw the already formatted error
    }
    
    // Check if this is an authentication error
    if (isAuthError(error)) {
      throw handleAuthError(error);
    }
    
    console.error('Error in sendTextToClaude:', error);
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
    }
    throw error;
  }
}

/**
 * Simple test function to verify API connectivity
 */
export async function testAnthropicConnection(): Promise<boolean> {
  try {
    console.log('Testing Anthropic API connection...');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    
    const response = await sendTextToClaude('Hello, this is a test message. Please respond with "API connection successful."');
    console.log('Anthropic API test result:', response.content[0].text);
    return true;
  } catch (error) {
    // If this is an authentication error, provide clear feedback
    if (error instanceof Error && 
        error.message.includes('TIME TO CHANGE THE API KEY')) {
      console.error('⚠️ API KEY NEEDS TO BE REPLACED:', error.message);
      return false;
    }
    
    // Check if this is an authentication error that wasn't caught earlier
    if (isAuthError(error)) {
      console.error('⚠️ Authentication error:', handleAuthError(error).message);
      return false;
    }
    
    console.error('Anthropic API test failed:', error);
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
    }
    return false;
  }
}

/**
 * Check if the error is an authentication error (401)
 * and create a user-friendly message about changing the API key
 */
function isAuthError(error: any): boolean {
  if (!error) return false;
  
  // Check for direct status code
  if (error.status === 401) return true;
  
  // Check error message for authentication keywords
  const errorMessage = error.message || '';
  return (
    errorMessage.includes('401') || 
    errorMessage.includes('authentication') || 
    errorMessage.includes('invalid x-api-key') ||
    errorMessage.includes('Invalid bearer token')
  );
}

/**
 * Show a more user-friendly error message for authentication issues
 */
function handleAuthError(error: any): Error {
  console.error('⚠️ AUTHENTICATION ERROR: Your Anthropic API key appears to be invalid or expired');
  console.error('🔑 Time to change the API key! Please get a new key from https://console.anthropic.com/');
  
  // Provide detailed information in the thrown error
  return new Error(
    '🔑 TIME TO CHANGE THE API KEY: The current Anthropic API key is invalid or expired. ' +
    'Please get a new key from https://console.anthropic.com/ and update your environment variables.'
  );
} 