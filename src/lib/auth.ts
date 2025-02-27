import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getServerSession } from 'next-auth'
import { connectDB } from './db'
import { AdminUser } from '@/models/AdminUser'
import type { User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import type { Session } from 'next-auth'
import type { Account } from 'next-auth'

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
    })
  ],
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
    async jwt({ token }: { token: JWT }) {
      console.log('JWT callback triggered:', { email: token.email })
      try {
        await connectDB()
        const adminUser = await AdminUser.findOne({ email: token.email?.toLowerCase() })
        token.isAdmin = !!adminUser
        console.log('JWT admin status set:', { isAdmin: token.isAdmin })
      } catch (error) {
        console.error('Error in jwt callback:', error)
        token.isAdmin = false
      }
      return token
    },
    async session({ session, token }: { session: Session, token: JWT }) {
      console.log('Session callback triggered')
      if (session.user) {
        session.user.isAdmin = token.isAdmin
        console.log('Session admin status set:', { 
          email: session.user.email,
          isAdmin: session.user.isAdmin 
        })
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  }
}

export const auth = () => getServerSession(authOptions) 