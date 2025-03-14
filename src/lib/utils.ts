import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, isValid, parse } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string into a more readable format
 * Accepts ISO dates and various date formats like MM/DD/YYYY
 * @param dateString - The date string to format
 * @param formatString - Optional format string (defaults to 'MM/dd/yyyy')
 * @returns Formatted date string or original string if invalid
 */
export function formatDate(dateString: string | undefined | null, formatString: string = 'MM/dd/yyyy'): string {
  if (!dateString) return '';
  
  // First try to parse as ISO date
  let date = new Date(dateString);
  
  // If invalid, try to parse as MM/DD/YYYY
  if (!isValid(date)) {
    // Try different formats
    const formats = ['MM/dd/yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy'];
    
    for (const format of formats) {
      date = parse(dateString, format, new Date());
      if (isValid(date)) break;
    }
  }
  
  // Return formatted date if valid, otherwise return original string
  return isValid(date) ? format(date, formatString) : dateString;
}
