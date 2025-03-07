/**
 * Application routes utility
 * 
 * This file defines all the routes used in the application to ensure consistency
 * and prevent static route warnings caused by hardcoded strings.
 */

export const routes = {
  // Authentication routes
  auth: {
    login: '/login',
    logout: '/logout',
  },
  
  // Dashboard routes
  dashboard: {
    index: '/dashboard',
    clients: {
      index: '/dashboard/clients',
      new: '/dashboard/clients/new',
      detail: (id: string) => `/dashboard/clients/${id}`,
      edit: (id: string) => `/dashboard/clients/${id}/edit`,
      documents: (id: string) => `/dashboard/clients/${id}/documents`,
      upload: (id: string) => `/dashboard/clients/${id}/upload`,
    },
    documents: {
      index: '/dashboard/documents',
      detail: (id: string) => `/dashboard/documents/${id}`,
    },
    assets: '/dashboard/assets',
  },
  
  // API routes
  api: {
    clients: {
      index: '/api/clients',
      detail: (id: string) => `/api/clients/${id}`,
      documents: (id: string) => `/api/clients/${id}/documents`,
      upload: (id: string) => `/api/clients/${id}/documents/upload`,
    },
    documents: {
      index: '/api/documents',
      detail: (id: string) => `/api/documents/${id}`,
      view: (id: string) => `/api/documents/${id}/view`,
      exists: (id: string) => `/api/documents/${id}/exists`,
      repair: (id: string) => `/api/documents/${id}/repair`,
      updateDate: (id: string) => `/api/documents/${id}/update-date`,
      updateDetails: (id: string) => `/api/documents/${id}/update-details`,
      generate: {
        coo: (id: string) => `/api/documents/${id}/generate/coo`,
      },
    },
  },
}; 