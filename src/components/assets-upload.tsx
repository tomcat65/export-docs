'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Upload, FileText, Image } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface Asset {
  _id: string
  name: string
  type: 'signature' | 'notary_seal' | 'letterhead' | 'other'
  description?: string
  contentType: string
  owner?: string
  createdAt: string
}

export function AssetsUpload() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [assetName, setAssetName] = useState('')
  const [assetType, setAssetType] = useState<'signature' | 'notary_seal' | 'letterhead' | 'other'>('signature')
  const [assetDescription, setAssetDescription] = useState('')
  const [assetOwner, setAssetOwner] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const { toast } = useToast()

  // Fetch assets on component mount
  useEffect(() => {
    fetchAssets()
  }, [])

  const fetchAssets = async () => {
    try {
      const response = await fetch('/api/assets')
      if (!response.ok) {
        throw new Error('Failed to fetch assets')
      }
      const data = await response.json()
      setAssets(data)
    } catch (error) {
      console.error('Error fetching assets:', error)
      toast({
        title: 'Error',
        description: 'Failed to load assets',
        variant: 'destructive'
      })
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedFile) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive'
      })
      return
    }

    if (!assetName) {
      toast({
        title: 'Error',
        description: 'Please provide a name for the asset',
        variant: 'destructive'
      })
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('name', assetName)
      formData.append('type', assetType)
      
      if (assetDescription) {
        formData.append('description', assetDescription)
      }
      
      if (assetOwner) {
        formData.append('owner', assetOwner)
      }

      const response = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to upload asset')
      }

      toast({
        title: 'Success',
        description: 'Asset uploaded successfully'
      })

      // Reset form
      setAssetName('')
      setAssetDescription('')
      setAssetOwner('')
      setSelectedFile(null)
      
      // Refresh assets list
      fetchAssets()
    } catch (error) {
      console.error('Error uploading asset:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload asset',
        variant: 'destructive'
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) {
      return
    }

    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete asset')
      }

      toast({
        title: 'Success',
        description: 'Asset deleted successfully'
      })

      // Refresh assets list
      fetchAssets()
    } catch (error) {
      console.error('Error deleting asset:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete asset',
        variant: 'destructive'
      })
    }
  }

  const getAssetIcon = (type: string, contentType: string) => {
    if (contentType.startsWith('image/')) {
      return <Image className="h-5 w-5" />
    }
    return <FileText className="h-5 w-5" />
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Confidential Asset</CardTitle>
          <CardDescription>
            Upload signatures, notary seals, and other confidential assets for document generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assetName">Asset Name</Label>
                <Input
                  id="assetName"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="e.g., Tomas Signature"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type</Label>
                <Select
                  value={assetType}
                  onValueChange={(value) => setAssetType(value as any)}
                >
                  <SelectTrigger id="assetType">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="signature">Signature</SelectItem>
                    <SelectItem value="notary_seal">Notary Seal</SelectItem>
                    <SelectItem value="letterhead">Letterhead</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="assetDescription">Description (Optional)</Label>
              <Input
                id="assetDescription"
                value={assetDescription}
                onChange={(e) => setAssetDescription(e.target.value)}
                placeholder="Brief description of the asset"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="assetOwner">Owner (Optional)</Label>
              <Input
                id="assetOwner"
                value={assetOwner}
                onChange={(e) => setAssetOwner(e.target.value)}
                placeholder="e.g., Tomas Alvarez"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="assetFile">File</Label>
              <Input
                id="assetFile"
                type="file"
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/jpg"
                required
              />
              <p className="text-sm text-muted-foreground">
                Recommended formats: PNG or JPG. For signatures and seals, transparent background is preferred.
              </p>
            </div>
            
            <Button type="submit" disabled={isUploading}>
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Upload Asset'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confidential Assets</CardTitle>
          <CardDescription>
            Manage your uploaded confidential assets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground">No assets found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {assets.map((asset) => (
                <div key={asset._id} className="flex items-center justify-between p-4 border rounded-md">
                  <div className="flex items-center space-x-4">
                    {getAssetIcon(asset.type, asset.contentType)}
                    <div>
                      <p className="font-medium">{asset.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {asset.type.replace('_', ' ')} {asset.owner ? `• ${asset.owner}` : ''}
                      </p>
                      {asset.description && (
                        <p className="text-sm">{asset.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(`/api/assets/${asset._id}/view`, '_blank')}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(asset._id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 