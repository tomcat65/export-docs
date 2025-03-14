import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "../styles/print.css";
import { Providers } from "./providers";
import { Toaster } from '@/components/ui/toaster'
import { BackupNotification } from '@/components/system/backup-notification'

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TXWOS Document Management",
  description: "Document management system for chemical exports",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <BackupNotification />
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
