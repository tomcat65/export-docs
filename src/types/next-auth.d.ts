import 'next-auth'

declare module 'next-auth' {
  interface User {
    email: string
    isAdmin: boolean
  }
  
  interface Session {
    user: User
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    email: string
    isAdmin: boolean
  }
} 