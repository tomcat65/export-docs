'use client'

import { Building2, Globe2, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import Image from 'next/image'
import ReactCountryFlag from 'react-country-flag'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t bg-slate-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2 text-slate-900">
              <Building2 className="h-5 w-5 text-blue-600" />
              Company
            </h3>
            <div className="space-y-3 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Texas Worldwide Oil Services, LLC</p>
              <p className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-blue-600 mt-1 shrink-0" />
                <span>6300 N Main Rd, Houston, TX 77009</span>
              </p>
              <p className="flex items-center gap-2">
                <span style={{ display: 'inline-block', width: '1.2em', height: '1.2em' }}>
                  <ReactCountryFlag 
                    countryCode="US"
                    svg
                    style={{ 
                      width: '100%', 
                      height: '100%' 
                    }}
                  />
                </span>
                <span>United States of America</span>
              </p>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2 text-slate-900">
              <Phone className="h-5 w-5 text-blue-600" />
              Contact
            </h3>
            <div className="space-y-3 text-sm">
              <a 
                href="https://wa.me/17135047322" 
                className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors group"
              >
                <div className="relative w-4 h-4">
                  <Image
                    src="/whatsapp-logo.svg"
                    alt="WhatsApp"
                    fill
                    className="object-contain group-hover:brightness-75 transition-all"
                  />
                </div>
                +1 (713) 504-7322
              </a>
              <a 
                href="mailto:info@txwos.com"
                className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors"
              >
                <Mail className="h-4 w-4" />
                info@txwos.com
              </a>
              <a 
                href="https://www.linkedin.com/company/texas-worldwide-oil-services-llc" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors"
              >
                <Linkedin className="h-4 w-4" />
                Texas Worldwide Oil Services LLC
              </a>
            </div>
          </div>

          {/* Additional Links/Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2 text-slate-900">
              <Globe2 className="h-5 w-5 text-blue-600" />
              About
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              TXWOS is a leading provider of chemical products and services for industry, 
              specializing in base oils, additives, lubricants, greases, and blending equipment.
            </p>
          </div>
        </div>

        <Separator className="bg-slate-200" />

        {/* Copyright */}
        <div className="py-6 text-center text-sm text-slate-600">
          <p>© {currentYear} By Ascend Consult LLC. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
} 