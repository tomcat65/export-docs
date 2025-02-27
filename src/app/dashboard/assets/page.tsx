import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AssetsUpload } from '@/components/assets-upload'

export default async function AssetsPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    redirect('/login')
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Confidential Assets</h1>
      </div>
      
      <AssetsUpload />
    </div>
  )
} 