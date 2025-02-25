import { NavMenu } from '@/components/dashboard/nav-menu'
import { getAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Building2, Phone, MapPin, Linkedin } from 'lucide-react'

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const session = await getAuth()

  if (!session?.user?.isAdmin) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavMenu />
      <main className="container mx-auto py-6 px-4 flex-grow">
        {children}
      </main>
      <footer className="border-t mt-auto bg-white">
        <div className="container mx-auto py-8 px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Texas Worldwide Oil Services LLC</h3>
              <div className="flex items-start gap-2 text-gray-600">
                <Building2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <span>4743 Merwin St<br />Houston, TX 77027</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Contact</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-5 w-5" />
                  <a href="tel:+17133096637" className="hover:text-primary">+1 (713) 309-6637</a>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <a href="https://wa.me/17133096637" className="hover:text-primary">WhatsApp Business</a>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Linkedin className="h-5 w-5" />
                  <a href="https://www.linkedin.com/company/texas-worldwide-oil-services" className="hover:text-primary" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">About</h3>
              <p className="text-gray-600">
                Private document management system for chemical exports. Streamlining documentation processes for international trade compliance and logistics.
              </p>
            </div>
          </div>
          
          <div className="mt-8 pt-4 border-t text-center">
            <p className="text-xs font-bold text-gray-500">
              By Ascend Consult LLC all rights reserved
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
} 