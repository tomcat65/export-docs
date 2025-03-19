import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getServerSession } from 'next-auth'
import { connectDB } from './db'
import { AdminUser } from '@/models/AdminUser'
import type { User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import type { Session } from 'next-auth'
import type { Account } from 'next-auth'
import type { SessionStrategy } from 'next-auth'

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          redirect_uri: process.env.NODE_ENV === 'production' 
            ? 'https://txwos-docs.fyi/api/auth/callback/google'
            : 'http://localhost:3000/api/auth/callback/google'
        }
      }
    })
  ],
  // Add debug mode in development
  debug: process.env.NODE_ENV === 'development',
  // Add secure cookies in production
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' 
        ? '__Secure-next-auth.session-token' 
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async signIn({ user, account }: { user: User, account: Account | null }) {
      console.log('SignIn callback triggered:', { 
        email: user.email,
        provider: account?.provider 
      })
      
      if (account?.provider === 'google') {
        try {
          console.log('Connecting to database for signIn check...')
          await connectDB()
          
          const adminUser = await AdminUser.findOne({ email: user.email?.toLowerCase() })
          console.log('Admin user lookup result:', { 
            found: !!adminUser,
            email: user.email?.toLowerCase()
          })
          
          if (adminUser) {
            // Update last login
            await AdminUser.findByIdAndUpdate(adminUser._id, {
              lastLogin: new Date()
            })
            console.log('Updated last login timestamp')
            return true
          }
          console.log('No matching admin user found')
        } catch (error) {
          console.error('Error in signIn callback:', error)
        }
      }
      return false
    },

    // Improve error handling in the JWT callback
    async jwt({ token }: { token: JWT }) {
      try {
        if (token?.email) {
          console.log('JWT callback triggered:', { email: token.email })
          
          await connectDB()
          
          const adminUser = await AdminUser.findOne({ email: token.email.toLowerCase() })
          
          if (adminUser) {
            console.log('JWT admin status set:', { isAdmin: true })
            token.isAdmin = true
            
            // Email-based name mapping for known users - this should take priority
            const emailNameMap: {[key: string]: string} = {
              'txwos.tomas@gmail.com': 'Tomas Alvarez',
              'talvarez@txwos.com': 'Tomas Alvarez',
              'de@txwos.com': 'Diego Ermoli',
              'txwos.diego@gmail.com': 'Diego Ermoli'
              // Add other email-to-name mappings as needed
            };
            
            // First check if we have an explicit mapping for this email
            if (emailNameMap[token.email.toLowerCase()]) {
              // Use pre-defined mapping if available
              token.name = emailNameMap[token.email.toLowerCase()];
            }
            // Otherwise use stored name if available
            else if (adminUser.name) {
              token.name = adminUser.name;
            }
            // Finally, try to extract a name from email
            else {
              // Extract name from email (e.g., firstname.lastname@domain.com -> Firstname Lastname)
              const emailParts = token.email.split('@')[0].split('.');
              token.name = emailParts.map(part => 
                part.charAt(0).toUpperCase() + part.slice(1)
              ).join(' ');
            }
            
            console.log('Setting user name:', { email: token.email, name: token.name });
          } else {
            console.log('JWT admin status set:', { isAdmin: false })
            token.isAdmin = false
          }
        }
      } catch (error) {
        console.error('Error in JWT callback:', error)
        // Don't fail the JWT - just log the error and continue
        // This helps prevent auth failures due to database connectivity issues
      }
      
      return token
    },

    // Improve error handling in the session callback 
    async session({ session, token }: { session: Session, token: JWT }) {
      try {
        if (session?.user) {
          console.log('Session callback triggered')
          session.user.isAdmin = !!token.isAdmin
          console.log('Session admin status set:', { email: session.user.email, isAdmin: session.user.isAdmin })
        }
      } catch (error) {
        console.error('Error in session callback:', error)
        // Don't fail the session - just log the error and continue
      }
      
      return session
    }
  },
  // Set longer session lifetime to reduce auth errors
  session: {
    strategy: 'jwt' as SessionStrategy,
    maxAge: 24 * 60 * 60, // 24 hours
  },
  // Ensure pages are properly configured
  pages: {
    signIn: '/login',
    error: '/login', // Add error page route
  },
  // Add URL configurations for production vs development
  urls: {
    baseUrl: process.env.NEXTAUTH_URL,
    origin: process.env.NEXTAUTH_URL,
  }
}

export const auth = () => getServerSession(authOptions) 