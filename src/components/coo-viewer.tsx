'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CooViewerProps {
  documentId: string // The ID of the COO document
}

export function CooViewer({ documentId }: CooViewerProps) {
  const { toast } = useToast()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    header: false,
    body: false,
    footer: false
  })
  const [loading, setLoading] = useState<Record<string, boolean>>({
    header: false,
    body: false,
    footer: false
  })

  // Toggle section expansion
  const toggleSection = (section: 'header' | 'body' | 'footer') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))

    // If we're expanding a section, load its content
    if (!expandedSections[section]) {
      loadSection(section)
    }
  }

  // Load a specific section of the COO document
  const loadSection = async (section: 'header' | 'body' | 'footer') => {
    try {
      setLoading(prev => ({ ...prev, [section]: true }))

      // Use the new view-section endpoint instead of generate/coo
      const response = await fetch(`/api/documents/${documentId}/view-section`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          section
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to load ${section} section`)
      }

      // Check if we have a redirect URL
      const data = await response.json()
      if (data?.redirect) {
        window.open(data.redirect, '_blank')
      } else if (data?.document?._id) {
        window.open(`/api/documents/${data.document._id}/view`, '_blank')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to load ${section} section`,
        variant: 'destructive',
      })
    } finally {
      setLoading(prev => ({ ...prev, [section]: false }))
    }
  }

  // View the complete document
  const viewCompleteDocument = () => {
    window.open(`/api/documents/${documentId}/view`, '_blank')
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Certificate of Origin Viewer</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* View complete document button */}
          <Button 
            variant="default" 
            onClick={viewCompleteDocument}
            className="w-full"
          >
            <Eye className="mr-2 h-4 w-4" />
            View Complete Document
          </Button>

          {/* Header Section */}
          <div className="border rounded-md">
            <div 
              className="flex justify-between items-center p-3 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => toggleSection('header')}
            >
              <h3 className="font-medium">Header Section</h3>
              {loading.header ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : expandedSections.header ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.header && (
              <div className="p-3 border-t">
                <p className="text-sm text-muted-foreground mb-2">
                  The header section includes the logo, date, title, and client information.
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadSection('header')}
                  disabled={loading.header}
                >
                  {loading.header ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  View Header
                </Button>
              </div>
            )}
          </div>

          {/* Body Section */}
          <div className="border rounded-md">
            <div 
              className="flex justify-between items-center p-3 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => toggleSection('body')}
            >
              <h3 className="font-medium">Body Section</h3>
              {loading.body ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : expandedSections.body ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.body && (
              <div className="p-3 border-t">
                <p className="text-sm text-muted-foreground mb-2">
                  The body section includes buyer information, maritime booking details, container information, and origin statement.
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadSection('body')}
                  disabled={loading.body}
                >
                  {loading.body ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  View Body
                </Button>
              </div>
            )}
          </div>

          {/* Footer Section */}
          <div className="border rounded-md">
            <div 
              className="flex justify-between items-center p-3 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => toggleSection('footer')}
            >
              <h3 className="font-medium">Footer Section</h3>
              {loading.footer ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : expandedSections.footer ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.footer && (
              <div className="p-3 border-t">
                <p className="text-sm text-muted-foreground mb-2">
                  The footer section includes signatures, notary information, and certification details.
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadSection('footer')}
                  disabled={loading.footer}
                >
                  {loading.footer ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-2 h-4 w-4" />
                  )}
                  View Footer
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 