'use client'

import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Carrier tracking URLs
const TRACKING_URLS = {
  'HAPAG': 'https://www.hapag-lloyd.com/en/online-business/track/track.html',
  'CMA': 'https://www.cma-cgm.com/ebusiness/tracking'
}

// Container number prefixes for auto-detection
const CARRIER_PREFIXES = {
  'HAPAG': ['HLCU', 'HLXU'],
  'CMA': ['CMAU', 'CMDU']
}

type CarrierType = 'HAPAG' | 'CMA';

export interface TrackingModalProps {
  bolNumber?: string
  bookingNumber?: string
  containerNumber?: string
  carrierReference?: string
  defaultCarrier?: CarrierType
}

export function TrackingModal({
  bolNumber,
  bookingNumber,
  containerNumber,
  carrierReference,
  defaultCarrier
}: TrackingModalProps) {
  const [carrier, setCarrier] = useState<CarrierType>(defaultCarrier || 'HAPAG')
  const [isOpen, setIsOpen] = useState(false)
  
  // Auto-detect carrier based on container number prefix
  useEffect(() => {
    if (!containerNumber || containerNumber.length < 4) return;
    
    const prefix = containerNumber.substring(0, 4).toUpperCase();
    
    for (const [carrierKey, prefixes] of Object.entries(CARRIER_PREFIXES)) {
      if (prefixes.includes(prefix)) {
        setCarrier(carrierKey as CarrierType);
        return;
      }
    }
  }, [containerNumber]);
  
  // Handle carrier selection
  const handleCarrierChange = (value: string) => {
    if (value === 'HAPAG' || value === 'CMA') {
      setCarrier(value)
    }
  }

  // Open the carrier's tracking page in a new tab
  const openTrackingPage = () => {
    window.open(TRACKING_URLS[carrier], '_blank', 'noopener,noreferrer');
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-green-50 hover:bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 border-green-200 hover:border-green-300 dark:border-green-800"
        >
          Tracker
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Shipment Tracking</DialogTitle>
          <DialogDescription>
            Track your shipment using the carrier's tracking system
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="carrier">Select Carrier</Label>
            <RadioGroup 
              id="carrier" 
              value={carrier} 
              onValueChange={handleCarrierChange}
              className="flex items-center space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="HAPAG" id="hapag" />
                <Label htmlFor="hapag">Hapag-Lloyd</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="CMA" id="cma" />
                <Label htmlFor="cma">CMA CGM</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="mt-2 bg-gray-50 dark:bg-gray-900 rounded-md p-3 text-xs">
            <p className="mb-2 font-medium">Reference Numbers:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              {bolNumber && <li>B/L Number: {bolNumber}</li>}
              {bookingNumber && <li>Booking: {bookingNumber}</li>}
              {containerNumber && <li>Container: {containerNumber}</li>}
              {carrierReference && <li>Carrier Reference: {carrierReference}</li>}
            </ul>
          </div>

          <div className="mt-4 flex justify-center">
            <Button 
              onClick={openTrackingPage} 
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              Open Tracking Page <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground mt-2">
            <p>Note: You will need to enter the reference number in the carrier's tracking page manually.</p>
            <p>Most carriers accept tracking by B/L number, container number, or booking reference.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 