import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Clock, WifiOff, FileX } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface BolUploadErrorDialogProps {
  open: boolean;
  onClose: () => void;
  error: string;
  technicalError?: string;
  status?: string;
}

export function BolUploadErrorDialog({
  open,
  onClose,
  error,
  technicalError,
  status
}: BolUploadErrorDialogProps) {
  
  // Determine the error type and icon based on the error message or status
  const getErrorTypeAndIcon = () => {
    if (error.includes('timeout') || status === 'timeout') {
      return {
        icon: <Clock className="h-6 w-6 text-orange-500" />,
        title: 'Processing Timeout',
        description: 'The document processing took too long and timed out.'
      };
    }
    
    if (error.includes('unavailable') || error.includes('service') || status === 'service_unavailable') {
      return {
        icon: <WifiOff className="h-6 w-6 text-red-500" />,
        title: 'Service Unavailable',
        description: 'The document processing service is currently unavailable.'
      };
    }
    
    if (error.includes('extract') || error.includes('unable') || status === 'extraction_failed') {
      return {
        icon: <FileX className="h-6 w-6 text-red-500" />,
        title: 'Extraction Failed',
        description: 'The system was unable to extract the required information from your document.'
      };
    }
    
    // Default error type
    return {
      icon: <AlertCircle className="h-6 w-6 text-red-500" />,
      title: 'Processing Error',
      description: 'An error occurred while processing your document.'
    };
  };
  
  const { icon, title, description } = getErrorTypeAndIcon();
  
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Message</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        
        {technicalError && (
          <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
            <h4 className="text-sm font-medium mb-2">Technical Details</h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono break-words">
              {technicalError}
            </p>
          </div>
        )}
        
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">What can you do?</h4>
          <ul className="list-disc list-inside text-sm space-y-1 text-slate-700 dark:text-slate-300">
            <li>Check that your document is a valid Bill of Lading</li>
            <li>Ensure the document is clear and all text is legible</li>
            <li>Try uploading a different format of the same document (PDF/JPG)</li>
            <li>Contact support if the problem persists</li>
          </ul>
        </div>
        
        <DialogFooter className="mt-6">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 