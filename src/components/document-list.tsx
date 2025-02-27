'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Eye, FileText, Download, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RelatedDocuments } from './related-documents'

interface Container {
  containerNumber: string
  sealNumber: string
  containerType: string
  grossWeight: number
  netWeight: number
  weightUnit: string
}

interface Item {
  description: string
  quantity: number
  unit: string
  hsCode: string
}

interface BolData {
  bolNumber: string
  bookingNumber?: string
  date?: string
  dateOfIssue?: string
  vessel?: string
  voyage?: string
  portOfLoading?: string
  portOfDischarge?: string
  placeOfReceipt?: string
  placeOfDelivery?: string
  consignee?: {
    name: string
    address: string
  }
  containers?: Container[]
  items?: Item[]
}

interface Document {
  _id: string
  clientId: string
  fileName: string
  fileId: string
  type: 'BOL' | 'PL' | 'COO'
  relatedBolId?: string
  bolData?: BolData
  items?: Array<{
    itemNumber: number
    containerNumber: string
    seal: string
    description: string
    quantity: {
      litros: string
      kg: string
    }
  }>
  createdAt: string
  updatedAt: string
}

interface DocumentListProps {
  clientId: string
  documents: Document[]
  onDocumentDeleted?: () => void
}

export function DocumentList({ clientId, documents, onDocumentDeleted }: DocumentListProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [groupedDocuments, setGroupedDocuments] = useState<Record<string, Document[]>>({})
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [expandedShipmentDetails, setExpandedShipmentDetails] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Group documents by BOL number
    const grouped: Record<string, Document[]> = {}
    
    // First, add all BOL documents
    documents.forEach(doc => {
      if (doc.type === 'BOL' && doc.bolData?.bolNumber) {
        const bolNumber = doc.bolData.bolNumber
        if (!grouped[bolNumber]) {
          grouped[bolNumber] = []
        }
        grouped[bolNumber].push(doc)
      }
    })
    
    // Then add related documents
    documents.forEach(doc => {
      if (doc.type !== 'BOL' && doc.relatedBolId) {
        // Find the BOL document
        const bolDoc = documents.find(d => d._id === doc.relatedBolId)
        if (bolDoc?.bolData?.bolNumber) {
          const bolNumber = bolDoc.bolData.bolNumber
          if (grouped[bolNumber]) {
            grouped[bolNumber].push(doc)
          }
        }
      }
    })
    
    // Initialize expanded states
    let initialExpandState: Record<string, boolean> = {}
    let initialShipmentDetailsState: Record<string, boolean> = {}
    
    // Check if we should preserve the state from a refresh
    const shouldPreserveState = sessionStorage.getItem('preserveDocumentListState') === 'true'
    
    if (shouldPreserveState) {
      // Try to get saved states from sessionStorage
      try {
        const savedExpandedCards = sessionStorage.getItem('expandedCards')
        const savedExpandedShipmentDetails = sessionStorage.getItem('expandedShipmentDetails')
        
        if (savedExpandedCards) {
          initialExpandState = JSON.parse(savedExpandedCards)
        }
        
        if (savedExpandedShipmentDetails) {
          initialShipmentDetailsState = JSON.parse(savedExpandedShipmentDetails)
        }
        
        // Clear the flag
        sessionStorage.removeItem('preserveDocumentListState')
      } catch (error) {
        console.error('Error restoring document list state:', error)
      }
    }
    
    // For any BOL numbers not in the saved state, initialize as collapsed
    Object.keys(grouped).forEach(bolNumber => {
      if (initialExpandState[bolNumber] === undefined) {
        initialExpandState[bolNumber] = false
      }
      if (initialShipmentDetailsState[bolNumber] === undefined) {
        initialShipmentDetailsState[bolNumber] = false
      }
    })
    
    setGroupedDocuments(grouped)
    setExpandedCards(initialExpandState)
    setExpandedShipmentDetails(initialShipmentDetailsState)
  }, [documents])

  // Save state to sessionStorage when it changes
  useEffect(() => {
    try {
      sessionStorage.setItem('expandedCards', JSON.stringify(expandedCards))
      sessionStorage.setItem('expandedShipmentDetails', JSON.stringify(expandedShipmentDetails))
    } catch (error) {
      console.error('Error saving document list state:', error)
    }
  }, [expandedCards, expandedShipmentDetails])

  const toggleCardExpansion = (bolNumber: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [bolNumber]: !prev[bolNumber]
    }))
  }
  
  const toggleShipmentDetails = (e: React.MouseEvent, bolNumber: string) => {
    e.stopPropagation() // Prevent triggering the card expansion
    setExpandedShipmentDetails(prev => ({
      ...prev,
      [bolNumber]: !prev[bolNumber]
    }))
  }

  const handleDeleteDocument = async () => {
    if (!selectedDocument) return

    try {
      const response = await fetch(`/api/documents/${selectedDocument._id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      toast({
        title: 'Document Deleted',
        description: `${selectedDocument.fileName} has been deleted successfully`,
      })

      // Call the callback if provided, otherwise refresh the page
      if (onDocumentDeleted) {
        onDocumentDeleted()
      } else {
        router.refresh()
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      })
    } finally {
      setShowDeleteConfirm(false)
      setSelectedDocument(null)
    }
  }

  const confirmDelete = (document: Document) => {
    setSelectedDocument(document)
    setShowDeleteConfirm(true)
  }

  // Function to handle document generation
  const handleDocumentGenerated = () => {
    // Preserve the current expanded state
    const currentExpandedState = { ...expandedCards };
    const currentShipmentDetailsState = { ...expandedShipmentDetails };
    
    // Set a flag in sessionStorage to preserve the expanded state
    sessionStorage.setItem('expandedCards', JSON.stringify(currentExpandedState));
    sessionStorage.setItem('expandedShipmentDetails', JSON.stringify(currentShipmentDetailsState));
    sessionStorage.setItem('preserveDocumentListState', 'true');
    
    if (onDocumentDeleted) {
      onDocumentDeleted();
    } else {
      // Use router.refresh() to refresh data without a full page navigation
      router.refresh();
    }
    
    // After a short delay to allow for data refresh, ensure the expanded state is maintained
    setTimeout(() => {
      setExpandedCards(currentExpandedState);
      setExpandedShipmentDetails(currentShipmentDetailsState);
    }, 500);
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No documents found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedDocuments).map(([bolNumber, docs]) => {
        const bolDoc = docs.find(doc => doc.type === 'BOL')
        const isExpanded = expandedCards[bolNumber] || false
        const isShipmentDetailsExpanded = expandedShipmentDetails[bolNumber] || false
        
        return (
          <Card key={bolNumber} className="mb-4">
            <CardHeader 
              className="cursor-pointer hover:bg-muted transition-colors"
              onClick={() => toggleCardExpansion(bolNumber)}
            >
              <div className="flex justify-between items-center">
                <CardTitle>BOL: {bolNumber}</CardTitle>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </CardHeader>
            
            {isExpanded && (
              <CardContent>
                {bolDoc && (
                  <div className="space-y-6">
                    {/* BOL Document Section */}
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">BOL Document</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`/api/documents/${bolDoc._id}/view`, '_blank')
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.location.href = `/api/documents/${bolDoc._id}/download`
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 hover:text-red-700"
                          onClick={(e) => {
                            e.stopPropagation()
                            confirmDelete(bolDoc)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Shipment Details Section with Dropdown */}
                    <div>
                      <div 
                        className="flex justify-between items-center cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors"
                        onClick={(e) => toggleShipmentDetails(e, bolNumber)}
                      >
                        <h3 className="font-medium">Shipment details</h3>
                        {isShipmentDetailsExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                      
                      {isShipmentDetailsExpanded && (
                        <div className="mt-2 pl-2">
                          {bolDoc.items && bolDoc.items.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Item #</TableHead>
                                  <TableHead>Container No.</TableHead>
                                  <TableHead>Seal</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead>Quantity (L)</TableHead>
                                  <TableHead>Quantity (KG)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bolDoc.items.map((item, index) => (
                                  <TableRow key={index}>
                                    <TableCell>{item.itemNumber}</TableCell>
                                    <TableCell>{item.containerNumber}</TableCell>
                                    <TableCell>{item.seal}</TableCell>
                                    <TableCell>{item.description}</TableCell>
                                    <TableCell>{item.quantity.litros}</TableCell>
                                    <TableCell>{item.quantity.kg}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : bolDoc.bolData?.items && bolDoc.bolData.items.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Description</TableHead>
                                  <TableHead>Quantity</TableHead>
                                  <TableHead>Unit</TableHead>
                                  <TableHead>HS Code</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bolDoc.bolData.items.map((item, index) => (
                                  <TableRow key={index}>
                                    <TableCell>{item.description}</TableCell>
                                    <TableCell>{item.quantity}</TableCell>
                                    <TableCell>{item.unit}</TableCell>
                                    <TableCell>{item.hsCode}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="text-sm text-muted-foreground">No shipment details available</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Container Details Section */}
                    {bolDoc.bolData?.containers && bolDoc.bolData.containers.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold mb-2">Container Details</h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Container</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seal</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {bolDoc.bolData.containers.map((container, index) => (
                                <tr key={index}>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{container.containerNumber}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{container.sealNumber}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">{container.containerType}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                                    {container.grossWeight} {container.weightUnit}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Related Documents Section */}
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Related Documents</h3>
                      <RelatedDocuments
                        bolId={bolDoc._id}
                        bolNumber={bolNumber}
                        existingDocuments={docs.filter(doc => doc.type !== 'BOL')}
                        onDocumentGenerated={handleDocumentGenerated}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
} 