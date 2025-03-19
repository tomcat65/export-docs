'use client'

import React from 'react'
import { AlertTriangle, Key } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ApiKeyErrorProps {
  message?: string
  onDismiss?: () => void
}

export function ApiKeyError({ 
  message = 'The Anthropic API key appears to be invalid or expired. Please update it to continue using Claude\'s document processing capabilities.',
  onDismiss
}: ApiKeyErrorProps) {
  return (
    <div className="flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-red-200 shadow-lg">
        <CardHeader className="bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-red-700">API Key Error</CardTitle>
          </div>
          <CardDescription>
            Time to update your Anthropic API key
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Alert className="border-amber-200 bg-amber-50">
            <Key className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Authentication Failed</AlertTitle>
            <AlertDescription className="text-amber-700">
              {message}
            </AlertDescription>
          </Alert>
          
          <div className="mt-6 space-y-4 text-gray-700">
            <h3 className="font-medium">How to Fix This:</h3>
            <ol className="list-decimal ml-5 space-y-2">
              <li>Go to <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Anthropic Console</a></li>
              <li>Generate a new API key</li>
              <li>Update the <code className="bg-gray-100 p-1 rounded">ANTHROPIC_API_KEY</code> environment variable</li>
              <li>Restart the application</li>
            </ol>
          </div>
        </CardContent>
        
        {onDismiss && (
          <CardFooter className="bg-gray-50 border-t">
            <Button
              variant="outline"
              onClick={onDismiss}
              className="ml-auto"
            >
              Dismiss
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
} 