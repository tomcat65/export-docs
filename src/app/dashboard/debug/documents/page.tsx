'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ArrowLeft, RefreshCw, Search } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function DocumentDebugPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [clients, setClients] = useState<any[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [diagnosticResults, setDiagnosticResults] = useState<any>(null)
  const [clientLoadError, setClientLoadError] = useState<string | null>(null)

  // Fetch clients on component mount
  useEffect(() => {
    async function fetchClients() {
      try {
        setIsLoading(true)
        const response = await fetch('/api/clients')
        if (!response.ok) {
          throw new Error('Failed to fetch clients')
        }
        const data = await response.json()
        setClients(data.clients || [])
        setClientLoadError(null)
      } catch (error) {
        console.error('Error fetching clients:', error)
        setClientLoadError(error instanceof Error ? error.message : 'Unknown error fetching clients')
      } finally {
        setIsLoading(false)
      }
    }

    fetchClients()
  }, [])

  // Run document diagnostics
  const runDiagnostics = async () => {
    if (!selectedClientId) {
      toast({
        title: 'Error',
        description: 'Please select a client first',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsLoading(true)
      toast({
        title: 'Running diagnostics...',
        description: 'Please wait while we check document storage and availability',
      })

      const response = await fetch(`/api/debug/documents/repair?clientId=${selectedClientId}`)
      if (!response.ok) {
        throw new Error('Diagnostics failed')
      }

      const results = await response.json()
      setDiagnosticResults(results)

      toast({
        title: 'Diagnostics complete',
        description: `Found ${results.stats.totalDocuments} documents, ${results.stats.documentsMissingFiles} with issues`,
        variant: results.issuesFound ? 'destructive' : 'default',
      })
    } catch (error) {
      console.error('Error running diagnostics:', error)
      toast({
        title: 'Diagnostics failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Clear diagnostics results
  const clearResults = () => {
    setDiagnosticResults(null)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Document Debug Tools</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Storage Diagnostics</CardTitle>
          <CardDescription>
            Check if documents are properly stored and accessible in the database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Select Client</label>
              <Select
                value={selectedClientId}
                onValueChange={setSelectedClientId}
                disabled={isLoading || clients.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={runDiagnostics}
                disabled={isLoading || !selectedClientId}
                className="w-full"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Run Diagnostics
              </Button>
            </div>
          </div>

          {clientLoadError && (
            <div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg">
              Error loading clients: {clientLoadError}
            </div>
          )}
        </CardContent>
      </Card>

      {diagnosticResults && (
        <Card>
          <CardHeader>
            <CardTitle>Diagnostic Results</CardTitle>
            <CardDescription>
              Client: {diagnosticResults.client.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">{diagnosticResults.stats.totalDocuments}</div>
                <div className="text-sm text-gray-500">Total Documents</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{diagnosticResults.stats.documentsWithFiles}</div>
                <div className="text-sm text-gray-500">Documents with Files</div>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{diagnosticResults.stats.documentsMissingFiles}</div>
                <div className="text-sm text-gray-500">Documents Missing Files</div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Document Type
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        With Files
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Missing Files
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(diagnosticResults.stats.byType).map(([type, stats]: [string, any]) => (
                      <tr key={type}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {stats.total}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                          {stats.withFiles}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                          {stats.missingFiles}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {diagnosticResults.documents.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-2">Document Details</h3>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            File Name
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Bucket
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {diagnosticResults.documents.map((doc: any) => (
                          <tr key={doc.documentId}>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-900">
                              {doc.fileName}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                              {doc.type}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${doc.fileFound ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {doc.fileFound ? 'OK' : 'Missing'}
                              </span>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                              {doc.bucketUsed || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={clearResults} className="mr-2">
              Clear Results
            </Button>
            <Button onClick={runDiagnostics} disabled={isLoading}>
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Run Again
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
} 