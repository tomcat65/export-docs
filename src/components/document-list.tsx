'use client'

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, Download, Eye, Trash2, Package, Ship, Calendar, Search, Filter } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PackingList } from '@/components/packing-list'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Document {
  id: string
  fileName: string
  type: string
  createdAt: string
  bolData?: {
    bolNumber: string
    bookingNumber?: string
    shipper: string
    vessel?: string
    portOfLoading: string
    portOfDischarge: string
    dateOfIssue?: string
    totalContainers: string
    totalWeight: {
      kg: string
      lbs: string
    }
  }
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
}

interface DocumentListProps {
  documents: Document[]
}

export function DocumentList({ documents }: DocumentListProps) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterField, setFilterField] = useState<string>('all')
  const { toast } = useToast()
  const router = useRouter()

  // Extract unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const options = {
      descriptions: new Set<string>(),
      containers: new Set<string>(),
      dates: new Set<string>(),
      bolNumbers: new Set<string>(),
    }

    documents.forEach(doc => {
      if (doc.bolData?.bolNumber) {
        options.bolNumbers.add(doc.bolData.bolNumber)
      }
      if (doc.bolData?.dateOfIssue) {
        options.dates.add(doc.bolData.dateOfIssue)
      }
      doc.items?.forEach(item => {
        options.descriptions.add(item.description)
        options.containers.add(item.containerNumber)
      })
    })

    return {
      descriptions: Array.from(options.descriptions).sort(),
      containers: Array.from(options.containers).sort(),
      dates: Array.from(options.dates).sort(),
      bolNumbers: Array.from(options.bolNumbers).sort(),
    }
  }, [documents])

  // Filter and search logic
  const filteredDocuments = useMemo(() => {
    if (!searchTerm && filterField === 'all') {
      return documents
    }

    return documents.filter(doc => {
      const searchTermLower = searchTerm.toLowerCase()
      
      // Search in all fields if no specific filter is selected
      if (filterField === 'all') {
        return (
          // Search in BOL data
          doc.bolData?.bolNumber.toLowerCase().includes(searchTermLower) ||
          doc.bolData?.bookingNumber?.toLowerCase().includes(searchTermLower) ||
          doc.bolData?.vessel?.toLowerCase().includes(searchTermLower) ||
          doc.bolData?.dateOfIssue?.toLowerCase().includes(searchTermLower) ||
          // Search in items
          doc.items?.some(item =>
            item.containerNumber.toLowerCase().includes(searchTermLower) ||
            item.description.toLowerCase().includes(searchTermLower) ||
            item.seal.toLowerCase().includes(searchTermLower)
          )
        )
      }

      // Search in specific fields based on filter
      switch (filterField) {
        case 'bolNumber':
          return doc.bolData?.bolNumber.toLowerCase().includes(searchTermLower)
        case 'container':
          return doc.items?.some(item =>
            item.containerNumber.toLowerCase().includes(searchTermLower)
          )
        case 'description':
          return doc.items?.some(item =>
            item.description.toLowerCase().includes(searchTermLower)
          )
        case 'date':
          return doc.bolData?.dateOfIssue?.toLowerCase().includes(searchTermLower)
        default:
          return false
      }
    })
  }, [documents, searchTerm, filterField])

  // Group filtered documents by BOL number
  const groupedDocuments = useMemo(() => {
    const groups = filteredDocuments.reduce((acc, doc) => {
      const bolNumber = doc.bolData?.bolNumber || 'Unassigned'
      if (!acc[bolNumber]) {
        acc[bolNumber] = []
      }
      acc[bolNumber].push(doc)
      return acc
    }, {} as Record<string, Document[]>)

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredDocuments])

  const handleDelete = async (doc: Document) => {
    setDeleteDoc(doc)
  }

  const confirmDelete = async () => {
    if (!deleteDoc) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/documents/${deleteDoc.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      toast({
        title: 'Success',
        description: 'Document deleted successfully'
      })

      router.refresh()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive'
      })
    } finally {
      setIsDeleting(false)
      setDeleteDoc(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium">No documents available</h3>
        <p className="mt-2 text-muted-foreground">
          There are no documents associated with this client yet
        </p>
        <Link href="/dashboard/clients" className="mt-4 inline-block">
          <Button variant="outline" className="mt-4">
            Back to Clients
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search Documents</CardTitle>
          <CardDescription>
            Search through BOLs by various criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <div className="flex-1">
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Select
              value={filterField}
              onValueChange={setFilterField}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fields</SelectItem>
                <SelectItem value="bolNumber">BOL Number</SelectItem>
                <SelectItem value="container">Container</SelectItem>
                <SelectItem value="description">Description</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {groupedDocuments.map(([bolNumber, docs]) => (
          <Card key={bolNumber} className="overflow-hidden">
            <CardHeader 
              className="cursor-pointer hover:bg-accent"
              onClick={() => {
                if (selectedDoc?.id === docs[0].id) {
                  setSelectedDoc(null)
                } else {
                  setSelectedDoc(docs[0])
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">BOL #{bolNumber}</CardTitle>
                  <CardDescription>
                    {docs[0].bolData?.vessel && `Vessel: ${docs[0].bolData.vessel}`}
                    {docs[0].bolData?.dateOfIssue && ` • Date: ${docs[0].bolData.dateOfIssue}`}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`/api/documents/${docs[0].id}/view`, '_blank')
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`/api/documents/${docs[0].id}/download`, '_blank')
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(docs[0])
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {selectedDoc?.id === docs[0].id && (
              <CardContent className="border-t">
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Shipping Details</h4>
                      <dl className="space-y-1">
                        <div className="flex">
                          <dt className="w-32 text-muted-foreground">Booking:</dt>
                          <dd>{docs[0].bolData?.bookingNumber || '-'}</dd>
                        </div>
                        <div className="flex">
                          <dt className="w-32 text-muted-foreground">From:</dt>
                          <dd>{docs[0].bolData?.portOfLoading}</dd>
                        </div>
                        <div className="flex">
                          <dt className="w-32 text-muted-foreground">To:</dt>
                          <dd>{docs[0].bolData?.portOfDischarge}</dd>
                        </div>
                        <div className="flex">
                          <dt className="w-32 text-muted-foreground">Total Weight:</dt>
                          <dd>{docs[0].bolData?.totalWeight.kg} kg</dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Shipper</h4>
                      <p className="text-sm">{docs[0].bolData?.shipper}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Containers ({docs[0].bolData?.totalContainers})</h4>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Container</TableHead>
                            <TableHead>Seal</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {docs[0].items?.map((item) => (
                            <TableRow key={item.containerNumber}>
                              <TableCell>{item.containerNumber}</TableCell>
                              <TableCell>{item.seal}</TableCell>
                              <TableCell>{item.description}</TableCell>
                              <TableCell className="text-right">
                                {item.quantity.litros} L / {item.quantity.kg} kg
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDoc(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
} 