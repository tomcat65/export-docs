'use client';

import { ClientCard } from '@/components/client-card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { BolUploadSection } from '@/components/bol-upload-section'
import { routes } from '@/lib/routes'

interface Client {
  id: string;
  name: string;
  rif: string;
  address?: string;
  lastDocument?: {
    date: string;
    type: string;
  };
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClients() {
      try {
        setLoading(true);
        const response = await fetch(routes.api.clients.index);
        if (!response.ok) {
          throw new Error('Failed to fetch clients');
        }
        const data = await response.json();
        setClients(data);
      } catch (error) {
        console.error('Error fetching clients:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchClients();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link href={routes.dashboard.clients.new}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center">
          <p className="text-muted-foreground">Loading clients...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center">
          <p className="text-muted-foreground">No clients found</p>
        </div>
      ) : (
        <div className="space-y-8">
          <BolUploadSection clients={clients} />

          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Clients</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 