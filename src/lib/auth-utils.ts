import { Session } from 'next-auth';

/**
 * Check if the current user is an admin
 */
export function isAdmin(session?: Session | null): boolean {
  if (!session || !session.user) {
    return false;
  }
  
  // Check for admin role in the user object
  return (session.user as any).role === 'admin' || (session.user as any).isAdmin === true;
}

/**
 * Check if the current user has a specific role
 */
export function hasRole(session: Session | null, role: string): boolean {
  if (!session || !session.user) {
    return false;
  }
  
  const user = session.user as any;
  
  // Check for the role in the user object
  if (user.role === role) {
    return true;
  }
  
  // Check for roles array if available
  if (Array.isArray(user.roles)) {
    return user.roles.includes(role);
  }
  
  return false;
}

/**
 * Get all roles for the current user
 */
export function getUserRoles(session: Session | null): string[] {
  if (!session || !session.user) {
    return [];
  }
  
  const user = session.user as any;
  
  // If the user has a roles array, return it
  if (Array.isArray(user.roles)) {
    return user.roles;
  }
  
  // If the user has a single role property, return it as an array
  if (user.role) {
    return [user.role];
  }
  
  // If the user has specific role booleans
  const roles: string[] = [];
  
  if (user.isAdmin) {
    roles.push('admin');
  }
  
  return roles;
} 