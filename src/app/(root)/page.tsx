import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await auth()
  
  if (session?.user?.isAdmin) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
} 