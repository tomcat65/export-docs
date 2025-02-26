import { DocumentUpload } from '@/components/document-upload'

interface UploadPageProps {
  params: Promise<{ id: string }>
}

export default async function UploadPage({ params }: UploadPageProps) {
  const { id } = await params

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Upload Document</h1>
      <DocumentUpload clientId={id} />
    </div>
  )
} 