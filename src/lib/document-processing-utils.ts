/**
 * Utility functions for document processing diagnostics and troubleshooting
 */

/**
 * Analyzes a document processing error to determine its category and provide user-friendly messages
 */
export function analyzeProcessingError(error: any): {
  errorType: 'timeout' | 'service_unavailable' | 'extraction_failed' | 'unknown',
  userMessage: string,
  technicalDetails: string
} {
  // Default values
  let errorType: 'timeout' | 'service_unavailable' | 'extraction_failed' | 'unknown' = 'unknown';
  let userMessage = 'An error occurred while processing your document.';
  let technicalDetails = '';
  
  // Extract error message and technical details
  const errorMessage = error?.message || '';
  const errorStack = error?.stack || '';
  const errorCode = error?.code || '';
  
  // Determine error type based on message patterns
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('FUNCTION_INVOCATION_TIMEOUT') ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ESOCKETTIMEDOUT'
  ) {
    errorType = 'timeout';
    userMessage = 'The document processing took too long and timed out. This could be due to a complex document or temporary service issues.';
  } else if (
    errorMessage.includes('unavailable') ||
    errorMessage.includes('service') ||
    errorMessage.includes('INTERNAL') ||
    errorMessage.includes('network') ||
    errorMessage.includes('connection') ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ECONNRESET'
  ) {
    errorType = 'service_unavailable';
    userMessage = 'The document processing service is currently unavailable. Please try again later.';
  } else if (
    errorMessage.includes('extract') ||
    errorMessage.includes('unable') ||
    errorMessage.includes('processing failed') ||
    errorMessage.includes('invalid format') ||
    errorMessage.includes('no result')
  ) {
    errorType = 'extraction_failed';
    userMessage = 'The system was unable to extract information from your document. Please ensure the document is clear and properly formatted.';
  }
  
  // Create technical details
  technicalDetails = `Error: ${errorMessage}
Code: ${errorCode}
${errorStack ? `Stack: ${errorStack.split('\n').slice(0, 3).join('\n')}` : ''}`;

  return {
    errorType,
    userMessage,
    technicalDetails
  };
}

/**
 * Diagnoses common issues that might prevent document processing
 */
export async function diagnoseDocumentProcessingEnvironment(): Promise<{
  isHealthy: boolean,
  issues: string[]
}> {
  const issues: string[] = [];
  
  try {
    // Check for Claude API key availability
    const checkApiKeyResponse = await fetch('/api/admin/check-credentials');
    const apiKeyStatus = await checkApiKeyResponse.json();
    
    if (!apiKeyStatus.anthropic) {
      issues.push('Claude API key not configured or invalid');
    }
    
    // Check Firebase Function availability
    const checkFirebaseResponse = await fetch('/api/admin/check-services');
    const firebaseStatus = await checkFirebaseResponse.json();
    
    if (!firebaseStatus.firebaseFunctions) {
      issues.push('Firebase Functions unavailable');
    }
    
    return {
      isHealthy: issues.length === 0,
      issues
    };
  } catch (error) {
    return {
      isHealthy: false,
      issues: ['Error checking environment health']
    };
  }
}

/**
 * Generates detailed diagnostics for a failed document upload
 */
export function generateDiagnosticInfo(file: File, error: any): string {
  const fileSizeMB = Math.round((file.size / (1024 * 1024)) * 100) / 100;
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  
  return `
Diagnostic Information:
- File Name: ${file.name}
- File Size: ${fileSizeMB}MB
- File Type: ${file.type}
- File Extension: ${fileExtension}
- Browser: ${navigator.userAgent}
- Timestamp: ${new Date().toISOString()}
- Error Details: ${error?.message || 'Unknown error'}
${error?.stack ? `- Error Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}` : ''}
`.trim();
} 