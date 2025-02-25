import { getAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await getAuth()
  
  if (session?.user?.isAdmin) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
} 