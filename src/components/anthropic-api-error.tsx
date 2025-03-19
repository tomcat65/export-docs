'use client'

import React from 'react'
import { AlertTriangle, Key } from 'lucide-react'

interface AnthropicApiErrorProps {
  message?: string
  onRetry?: () => void
}

export function AnthropicApiError({ 
  message = 'The Anthropic API key appears to be invalid or expired. Please update it to continue using Claude\'s document processing capabilities.',
  onRetry
}: AnthropicApiErrorProps) {
  return (
    <div className="rounded-lg border border-red-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <h3 className="text-lg font-semibold text-red-700">Authentication Failed: Time to Update API Key</h3>
      </div>
      
      <div className="mb-4 text-red-700 bg-red-50 p-4 rounded-md">
        {message}
      </div>
      
      <div className="mb-6">
        <p className="font-medium mb-2">How to fix this:</p>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Go to <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Anthropic Console</a></li>
          <li>Generate a new API key</li>
          <li>Update the <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code> environment variable</li>
          <li>Restart the application</li>
        </ol>
      </div>
      
      {onRetry && (
        <div className="flex justify-end">
          <button 
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            onClick={onRetry}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  )
} 