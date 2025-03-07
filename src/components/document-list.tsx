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
import { Eye, FileText, Download, Trash2, ChevronDown, ChevronUp, Calendar, SortAsc, SortDesc, Clock } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { RelatedDocuments } from './related-documents'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

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
  carrierReference?: string
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
  totalWeight?: {
    kg: number
    lbs: number
  }
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
  const [dateInputs, setDateInputs] = useState<Record<string, string>>({})
  const [isSubmittingDate, setIsSubmittingDate] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc') // 'desc' for newest first (default)

  // Toggle sort order and display appropriate toast message
  const toggleSortOrder = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
    setSortOrder(newOrder)
    toast({
      title: `Documents sorted by ${newOrder === 'asc' ? 'oldest' : 'newest'} first`,
      duration: 2000,
    })
  }

  // Filter documents based on search query
  const filteredDocuments = searchQuery.trim() 
    ? documents.filter(doc => {
        const bolNumber = doc.bolData?.bolNumber?.toLowerCase() || '';
        const dateOfIssue = doc.bolData?.dateOfIssue?.toLowerCase() || '';
        const carrierReference = doc.bolData?.carrierReference?.toLowerCase() || '';
        const query = searchQuery.toLowerCase();
        
        return bolNumber.includes(query) || 
               dateOfIssue.includes(query) ||
               carrierReference.includes(query);
      })
    : documents;

  // Sort the grouped objects by date
  useEffect(() => {
    // Group documents by BOL number
    const grouped: Record<string, Document[]> = {}
    
    // First, add all BOL documents
    filteredDocuments.forEach(doc => {
      if (doc.type === 'BOL' && doc.bolData?.bolNumber) {
        const bolNumber = doc.bolData.bolNumber
        if (!grouped[bolNumber]) {
          grouped[bolNumber] = []
        }
        grouped[bolNumber].push(doc)
      }
    })
    
    // Then add related documents
    filteredDocuments.forEach(doc => {
      if (doc.type !== 'BOL' && doc.relatedBolId) {
        // Find the BOL document
        const bolDoc = filteredDocuments.find(d => d._id === doc.relatedBolId)
        if (bolDoc?.bolData?.bolNumber) {
          const bolNumber = bolDoc.bolData.bolNumber
          if (grouped[bolNumber]) {
            grouped[bolNumber].push(doc)
          }
        }
      }
    })

    // Get the BOL documents for sorting - completely rewritten date handling
    const sortableEntries = Object.entries(grouped).map(([bolNumber, docs]) => {
      const bolDoc = docs.find(doc => doc.type === 'BOL')
      
      // Extract date data with improved parsing
      let dateString = bolDoc?.bolData?.dateOfIssue || '';
      let dateObj = null;
      
      // For YYYY-MM-DD format
      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-').map(Number);
        dateObj = new Date(year, month - 1, day); // months are 0-indexed in JS
      } 
      // For MMM/DD/YYYY format (like MAR/10/2025)
      else if (dateString.match(/^[A-Z]{3}\/\d{1,2}\/\d{4}$/i)) {
        const parts = dateString.split('/');
        const monthMap: Record<string, number> = {
          'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
          'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
        };
        const month = monthMap[parts[0].toUpperCase()];
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
          dateObj = new Date(year, month, day);
        }
      } 
      // Fallback to standard date parsing
      else if (dateString) {
        dateObj = new Date(dateString);
        // Check if it's a valid date
        if (isNaN(dateObj.getTime())) {
          dateObj = null;
        }
      }
      
      // If we couldn't parse the date, fall back to creation date
      if (!dateObj && bolDoc) {
        dateObj = new Date(bolDoc.createdAt);
      }
      
      // If still no date, use epoch (very old date)
      if (!dateObj) {
        dateObj = new Date(0);
      }
      
      return {
        bolNumber,
        docs,
        date: dateObj,
        // For debugging, include the raw date too
        rawDate: dateString || 'N/A'
      };
    });
    
    // Simple, clear sorting logic
    sortableEntries.sort((a, b) => {
      const timeA = a.date.getTime();
      const timeB = b.date.getTime();
      
      if (sortOrder === 'desc') { // Newest first
        return timeB - timeA;
      } else { // Oldest first
        return timeA - timeB;
      }
    });
    
    // Rebuild the sorted grouped object
    const sortedGrouped: Record<string, Document[]> = {}
    sortableEntries.forEach(entry => {
      sortedGrouped[entry.bolNumber] = entry.docs
    });
    
    setGroupedDocuments(sortedGrouped)
    
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
    
    setExpandedCards(initialExpandState)
    setExpandedShipmentDetails(initialShipmentDetailsState)
  }, [filteredDocuments, sortOrder])

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

  const handleDateSubmit = async (docId: string) => {
    const date = dateInputs[docId]
    if (!date) return
    
    setIsSubmittingDate(prev => ({ ...prev, [docId]: true }))
    
    try {
      const response = await fetch(`/api/documents/${docId}/update-date`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dateOfIssue: date }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update date')
      }
      
      toast({
        title: 'Date Updated',
        description: 'Document date has been updated successfully',
      })
      
      // Refresh the page or fetch updated data
      if (onDocumentDeleted) {
        onDocumentDeleted()
      } else {
        router.refresh()
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update date',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingDate(prev => ({ ...prev, [docId]: false }))
    }
  }

  // Format the date for display consistently
  const formatDateDisplay = (dateString: string): string => {
    if (!dateString) return 'N/A';
    
    // For YYYY-MM-DD format
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateString; // Already in the correct format
    }
    
    // For MMM/DD/YYYY format
    if (dateString.match(/^[A-Z]{3}\/\d{1,2}\/\d{4}$/i)) {
      const parts = dateString.split('/');
      const monthMap: Record<string, number> = {
        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
      };
      const month = monthMap[parts[0].toUpperCase()];
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    // Try standard date parsing
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Return the original if we couldn't parse it
    return dateString;
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
      {/* Search and sort controls */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="relative flex-1 mr-4">
            <input
              type="text"
              placeholder="Search by BOL Number, Date, or Carrier's Reference..."
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={() => setSearchQuery('')}
              >
                ×
              </button>
            )}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSortOrder}
            className="flex items-center gap-1"
          >
            <Clock className="h-4 w-4" />
            {sortOrder === 'asc' ? (
              <>
                <SortAsc className="h-4 w-4" />
                <span className="hidden sm:inline">Oldest First</span>
              </>
            ) : (
              <>
                <SortDesc className="h-4 w-4" />
                <span className="hidden sm:inline">Newest First</span>
              </>
            )}
          </Button>
        </div>
        
        {searchQuery && filteredDocuments.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">No documents found matching your search.</p>
        )}
      </div>

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
              <div className="flex justify-between items-start">
                <div className="flex flex-col space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="text-lg font-bold">BOL: {bolNumber}</CardTitle>
                    {bolDoc && bolDoc.bolData?.dateOfIssue && (
                      <span className="inline-flex items-center text-sm font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDateDisplay(bolDoc.bolData.dateOfIssue)}
                      </span>
                    )}
                    {bolDoc && bolDoc.bolData?.carrierReference && (
                      <span className="inline-flex items-center text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                        <FileText className="h-3 w-3 mr-1" />
                        {bolDoc.bolData.carrierReference}
                      </span>
                    )}
                  </div>
                  {bolDoc && !bolDoc.bolData?.dateOfIssue && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      Missing date
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
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
                        <h3 className="font-medium">Shipping Details</h3>
                        {isShipmentDetailsExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                      
                      {isShipmentDetailsExpanded && (
                        <div className="mt-2 pl-2">
                          {/* Display Port of Loading, Port of Discharge, and Total Weight */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Port of Loading</p>
                              <p>{bolDoc.bolData?.portOfLoading || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Vessel / Voyage</p>
                              <p>
                                {bolDoc.bolData?.vessel ? 
                                  (bolDoc.bolData?.voyage ? 
                                    `${bolDoc.bolData.vessel} / ${bolDoc.bolData.voyage}` : 
                                    bolDoc.bolData.vessel) : 
                                  'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Port of Discharge</p>
                              <p>{bolDoc.bolData?.portOfDischarge || 'N/A'}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Date of Issue</p>
                              {bolDoc.bolData?.dateOfIssue ? (
                                <p>{bolDoc.bolData.dateOfIssue}</p>
                              ) : (
                                <div>
                                  <div className="text-amber-600 dark:text-amber-400 text-sm font-medium mb-2">
                                    <span className="flex items-center">
                                      <Calendar className="h-3 w-3 mr-1" />
                                      No date detected. Please add a date:
                                    </span>
                                  </div>
                                  <div className="flex items-center">
                                    <input
                                      type="date"
                                      className="py-1 px-2 border rounded text-sm"
                                      value={dateInputs[bolDoc._id] || ''}
                                      onChange={(e) => setDateInputs(prev => ({ ...prev, [bolDoc._id]: e.target.value }))}
                                      placeholder="Select date"
                                    />
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="ml-2"
                                      disabled={!dateInputs[bolDoc._id] || isSubmittingDate[bolDoc._id]}
                                      onClick={() => handleDateSubmit(bolDoc._id)}
                                    >
                                      {isSubmittingDate[bolDoc._id] ? 'Saving...' : 'Save Date'}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Booking Number</p>
                              <p>{bolDoc.bolData?.bookingNumber || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-500">Carrier's Reference</p>
                              <p>{bolDoc.bolData?.carrierReference || 'N/A'}</p>
                              <div className="text-xs text-gray-400 mt-1">
                                Debug: Type={typeof bolDoc.bolData?.carrierReference}, 
                                Value="{bolDoc.bolData?.carrierReference || 'undefined'}"
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                              <p className="text-sm font-medium text-gray-500">Total Weight</p>
                              <p>
                                {bolDoc.bolData?.totalWeight ? 
                                  `${bolDoc.bolData.totalWeight.kg} kg / ${bolDoc.bolData.totalWeight.lbs} lbs` :
                                  bolDoc.bolData?.containers ? 
                                    bolDoc.bolData.containers.reduce((sum, container) => sum + (container.grossWeight || 0), 0) + 
                                    ' ' + (bolDoc.bolData.containers[0]?.weightUnit || 'kg')
                                    : 'N/A'}
                              </p>
                            </div>
                          </div>

                          {/* Existing Items Table */}
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
                        <h3 className="text-lg font-semibold mb-2">
                          Containers ({bolDoc.bolData.containers.length})
                        </h3>
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
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
            {selectedDocument?.type === 'BOL' && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700">
                <strong>Warning:</strong> Deleting this BOL will also delete all related documents
                (Certificates of Origin and Packing Lists) associated with it.
              </div>
            )}
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