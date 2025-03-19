import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Protect dashboard routes with authentication
export default withAuth(
  function middleware(req) {
    console.log('Middleware check:', {
      path: req.nextUrl.pathname,
      isAdmin: req.nextauth.token?.isAdmin,
      // Add more debugging info
      hostname: req.nextUrl.hostname,
      origin: req.nextUrl.origin,
      basePath: req.nextUrl.basePath,
      fullUrl: req.nextUrl.toString(),
      headers: Object.fromEntries(req.headers)
    })

    // If trying to access dashboard without admin rights, redirect to login
    if (!req.nextauth.token?.isAdmin) {
      console.log('Redirecting to login - not admin')
      return NextResponse.redirect(new URL('/login', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Allow the middleware function to handle the authorization
        return true
      }
    }
  }
)

// Only protect dashboard routes
export const config = {
  matcher: ['/dashboard/:path*']
} 