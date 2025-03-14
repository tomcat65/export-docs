'use client';

import { FileText, File, FileCheck, FileSpreadsheet, FileCog, FileWarning } from 'lucide-react';

type DocumentType = 
  | 'BOL' 
  | 'PL' 
  | 'COO' 
  | 'INVOICE_EXPORT' 
  | 'INVOICE' 
  | 'COA' 
  | 'SED' 
  | 'DATA_SHEET' 
  | 'SAFETY_SHEET';

interface DocumentIconProps {
  type: DocumentType;
  className?: string;
  size?: number;
}

/**
 * DocumentIcon component that displays different icons based on document type
 */
export function DocumentIcon({ type, className = '', size = 16 }: DocumentIconProps) {
  const props = {
    className: `${className}`,
    size: size
  };

  switch (type) {
    case 'BOL':
      return <FileText {...props} className={`text-blue-500 ${className}`} />;
    case 'PL':
      return <FileSpreadsheet {...props} className={`text-green-500 ${className}`} />;
    case 'COO':
      return <FileCheck {...props} className={`text-purple-500 ${className}`} />;
    case 'INVOICE':
    case 'INVOICE_EXPORT':
      return <FileText {...props} className={`text-amber-500 ${className}`} />;
    case 'COA':
      return <FileCheck {...props} className={`text-emerald-500 ${className}`} />;
    case 'SED':
      return <FileText {...props} className={`text-indigo-500 ${className}`} />;
    case 'DATA_SHEET':
      return <FileCog {...props} className={`text-cyan-500 ${className}`} />;
    case 'SAFETY_SHEET':
      return <FileWarning {...props} className={`text-red-500 ${className}`} />;
    default:
      return <File {...props} />;
  }
} 