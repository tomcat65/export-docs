'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRef, useState } from 'react'
import {
  ArrowLeft,
  Download,
  Eye,
  RefreshCw,
  Upload,
  Replace,
  Loader2,
  FolderOpen,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocumentIcon } from '@/components/DocumentIcon'
import { routes } from '@/lib/routes'

// ---------- types ----------

type DocType =
  | 'BOL'
  | 'PL'
  | 'COO'
  | 'INVOICE_EXPORT'
  | 'INVOICE'
  | 'COA'
  | 'SED'
  | 'DATA_SHEET'
  | 'SAFETY_SHEET'
  | 'INSURANCE'

interface FolderDocument {
  _id: string
  clientId: string
  fileName: string
  fileId: string
  type: DocType
  subType?: string
  relatedBolId?: string
  createdAt: string
  updatedAt: string
  bolData?: {
    bolNumber: string
    bookingNumber?: string
    shipper?: string
    vessel?: string
    voyage?: string
    portOfLoading?: string
    portOfDischarge?: string
    dateOfIssue?: string
    totalContainers?: string
    totalWeight?: { kg: string; lbs: string }
  }
  packingListData?: any
  cooData?: any
  items?: any[]
}

// Generated doc types get View | Regenerate
const GENERATED_TYPES: DocType[] = ['COO', 'PL']

// Upload-only doc types get View | Replace (if present), Upload (if missing)
const UPLOAD_TYPES: DocType[] = ['INVOICE_EXPORT', 'COA', 'SED']

// All expected doc types in folder
const ALL_FOLDER_TYPES: { type: DocType; label: string }[] = [
  { type: 'BOL', label: 'Bill of Lading' },
  { type: 'PL', label: 'Packing List' },
  { type: 'COO', label: 'Certificate of Origin' },
  { type: 'INVOICE_EXPORT', label: 'Export Invoice' },
  { type: 'COA', label: 'Certificate of Analysis' },
  { type: 'SED', label: 'Shipper\'s Export Declaration' },
]

// ---------- helpers ----------

function typeBadgeColor(type: DocType): string {
  const colors: Record<string, string> = {
    BOL: 'bg-blue-100 text-blue-800',
    PL: 'bg-green-100 text-green-800',
    COO: 'bg-purple-100 text-purple-800',
    INVOICE_EXPORT: 'bg-amber-100 text-amber-800',
    INVOICE: 'bg-amber-100 text-amber-800',
    COA: 'bg-emerald-100 text-emerald-800',
    SED: 'bg-indigo-100 text-indigo-800',
    DATA_SHEET: 'bg-cyan-100 text-cyan-800',
    SAFETY_SHEET: 'bg-red-100 text-red-800',
    INSURANCE: 'bg-gray-100 text-gray-800',
  }
  return colors[type] ?? 'bg-gray-100 text-gray-800'
}

function typeLabel(type: DocType): string {
  const labels: Record<string, string> = {
    BOL: 'BOL',
    PL: 'Packing List',
    COO: 'COO',
    INVOICE_EXPORT: 'Export Invoice',
    INVOICE: 'Invoice',
    COA: 'COA',
    SED: 'SED',
    DATA_SHEET: 'Data Sheet',
    SAFETY_SHEET: 'Safety Sheet',
    INSURANCE: 'Insurance',
  }
  return labels[type] ?? type
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ---------- data fetching ----------

async function fetchFolderDocuments(bolId: string): Promise<FolderDocument[]> {
  const res = await fetch(routes.api.documents.folderDocs(bolId))
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.documents
}

async function uploadAssociatedDocument(
  bolId: string,
  file: File,
  type: string
): Promise<{ success: boolean; document: FolderDocument }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', type)

  const res = await fetch(routes.api.documents.uploadAssociated(bolId), {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  return res.json()
}

// ---------- sub-components ----------

function DocumentCard({
  doc,
  bolId,
  onReplace,
  isUploading,
}: {
  doc: FolderDocument
  bolId: string
  onReplace?: (type: DocType) => void
  isUploading?: boolean
}) {
  const isGenerated = GENERATED_TYPES.includes(doc.type)
  const isUploadType = UPLOAD_TYPES.includes(doc.type)

  return (
    <div className="flex items-center justify-between p-4 bg-background border rounded-lg hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <DocumentIcon type={doc.type as any} size={20} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColor(doc.type)}`}
            >
              {typeLabel(doc.type)}
            </span>
            <span className="text-sm font-medium truncate">{doc.fileName}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{formatDate(doc.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 ml-4">
        {/* View button — all docs */}
        <Button
          variant="ghost"
          size="sm"
          asChild
        >
          <a
            href={`/api/documents/${doc._id}/view`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </a>
        </Button>

        {/* Download button — all docs */}
        <Button
          variant="ghost"
          size="sm"
          asChild
        >
          <a href={`/api/documents/${doc._id}/download`}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </a>
        </Button>

        {/* Regenerate button — generated docs (COO, PL) */}
        {isGenerated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const genPath = doc.type === 'COO'
                ? routes.api.documents.generate.coo(bolId)
                : routes.api.documents.generate.pl(bolId)
              window.open(genPath, '_blank')
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Regenerate
          </Button>
        )}

        {/* Replace button — upload-only docs */}
        {isUploadType && onReplace && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isUploading}
            onClick={() => onReplace(doc.type)}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Replace className="h-4 w-4 mr-1" />
            )}
            Replace
          </Button>
        )}
      </div>
    </div>
  )
}

function EmptySlot({
  type,
  label,
  onUpload,
  isUploading,
}: {
  type: DocType
  label: string
  onUpload?: (type: DocType) => void
  isUploading?: boolean
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-muted/30 border border-dashed rounded-lg">
      <div className="flex items-center gap-3">
        <DocumentIcon type={type as any} size={20} className="opacity-40" />
        <div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium opacity-60 ${typeBadgeColor(type)}`}
          >
            {label}
          </span>
          <p className="text-xs text-muted-foreground mt-1">Not yet uploaded</p>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => onUpload?.(type)}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-1" />
        )}
        Upload
      </Button>
    </div>
  )
}

// ---------- main page ----------

export default function DocumentFolderPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const bolId = params.id

  // Hidden file input ref for upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadType, setPendingUploadType] = useState<DocType | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const {
    data: documents,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['bol-folder', bolId],
    queryFn: () => fetchFolderDocuments(bolId),
    enabled: !!bolId,
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: ({ file, type }: { file: File; type: string }) =>
      uploadAssociatedDocument(bolId, file, type),
    onSuccess: () => {
      setUploadError(null)
      setPendingUploadType(null)
      // Invalidate the folder query to refetch immediately
      queryClient.invalidateQueries({ queryKey: ['bol-folder', bolId] })
    },
    onError: (err: Error) => {
      setUploadError(err.message)
      setPendingUploadType(null)
    },
  })

  // Trigger file picker for a given document type
  function handleUploadClick(type: DocType) {
    setUploadError(null)
    setPendingUploadType(type)
    // Reset and trigger the hidden input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  // Handle file selection
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !pendingUploadType) {
      setPendingUploadType(null)
      return
    }

    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.')
      setPendingUploadType(null)
      return
    }

    uploadMutation.mutate({ file, type: pendingUploadType })
  }

  // Derive which types are present vs missing
  const presentTypes = new Set(documents?.map((d) => d.type) ?? [])
  const bolDoc = documents?.find((d) => d.type === 'BOL')
  const nonBolDocs = documents?.filter((d) => d.type !== 'BOL') ?? []
  const missingSlots = ALL_FOLDER_TYPES.filter(
    (slot) => slot.type !== 'BOL' && !presentTypes.has(slot.type) && UPLOAD_TYPES.includes(slot.type)
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading document folder...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-red-800">Error loading folder</h3>
            <p className="text-sm text-red-600 mt-1">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // No documents found
  if (!documents || documents.length === 0) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-muted-foreground">No documents found.</p>
      </div>
    )
  }

  const bolNumber = bolDoc?.bolData?.bolNumber ?? 'Unknown BOL'

  return (
    <div className="space-y-6">
      {/* Hidden file input for PDF uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Upload error banner */}
      {uploadError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{uploadError}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploadError(null)}
            className="text-red-500"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-blue-500" />
            <h1 className="text-2xl font-bold">Document Folder</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            BOL #{bolNumber}
            {bolDoc?.bolData?.vessel && ` — ${bolDoc.bolData.vessel}`}
            {bolDoc?.bolData?.voyage && ` / ${bolDoc.bolData.voyage}`}
          </p>
        </div>
      </div>

      {/* BOL Summary Card */}
      {bolDoc?.bolData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Port of Loading</p>
            <p className="text-sm font-medium">{bolDoc.bolData.portOfLoading}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Port of Discharge</p>
            <p className="text-sm font-medium">{bolDoc.bolData.portOfDischarge}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Containers</p>
            <p className="text-sm font-medium">{bolDoc.bolData.totalContainers}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date of Issue</p>
            <p className="text-sm font-medium">
              {bolDoc.bolData.dateOfIssue ? formatDate(bolDoc.bolData.dateOfIssue) : 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Documents ({documents.length})</h2>

        {/* BOL document first */}
        {bolDoc && <DocumentCard doc={bolDoc} bolId={bolId} />}

        {/* Generated docs (COO, PL) */}
        {nonBolDocs
          .filter((d) => GENERATED_TYPES.includes(d.type))
          .map((doc) => (
            <DocumentCard key={doc._id} doc={doc} bolId={bolId} />
          ))}

        {/* Upload-only docs */}
        {nonBolDocs
          .filter((d) => UPLOAD_TYPES.includes(d.type))
          .map((doc) => (
            <DocumentCard
              key={doc._id}
              doc={doc}
              bolId={bolId}
              onReplace={handleUploadClick}
              isUploading={uploadMutation.isPending && pendingUploadType === doc.type}
            />
          ))}

        {/* Other docs (not in standard categories) */}
        {nonBolDocs
          .filter(
            (d) =>
              !GENERATED_TYPES.includes(d.type) &&
              !UPLOAD_TYPES.includes(d.type)
          )
          .map((doc) => (
            <DocumentCard key={doc._id} doc={doc} bolId={bolId} />
          ))}

        {/* Missing document slots for upload types */}
        {missingSlots.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-muted-foreground mt-4 pt-4 border-t">
              Missing Documents
            </h3>
            {missingSlots.map((slot) => (
              <EmptySlot
                key={slot.type}
                type={slot.type}
                label={slot.label}
                onUpload={handleUploadClick}
                isUploading={uploadMutation.isPending && pendingUploadType === slot.type}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
