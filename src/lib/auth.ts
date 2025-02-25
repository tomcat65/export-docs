import { NextAuthOptions, getServerSession } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { connectDB } from './db'
import { AdminUser } from '@/models/AdminUser'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        try {
          await connectDB()
          const adminUser = await AdminUser.findOne({ email: user.email?.toLowerCase() })
          
          if (adminUser) {
            // Update last login
            await AdminUser.findByIdAndUpdate(adminUser._id, {
              lastLogin: new Date()
            })
            return true
          }
        } catch (error) {
          console.error('Error checking admin status:', error)
        }
      }
      return false
    },
    async jwt({ token }) {
      try {
        await connectDB()
        const adminUser = await AdminUser.findOne({ email: token.email?.toLowerCase() })
        token.isAdmin = !!adminUser
      } catch (error) {
        console.error('Error checking admin status:', error)
        token.isAdmin = false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.isAdmin = token.isAdmin
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  }
}

export const getAuth = () => getServerSession(authOptions) 