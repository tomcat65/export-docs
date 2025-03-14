'use client'

import { Building2, Globe2, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import Image from 'next/image'

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
                <svg 
                  width="1.2em" 
                  height="1.2em" 
                  viewBox="0 0 512 512" 
                  aria-label="United States" 
                  role="img"
                  className="shrink-0"
                >
                  <rect width="512" height="512" fill="#f0f0f0"/>
                  <g fill="#d80027">
                    <rect width="512" height="39.4" y="39.4"/>
                    <rect width="512" height="39.4" y="118.2"/>
                    <rect width="512" height="39.4" y="197"/>
                    <rect width="512" height="39.4" y="275.8"/>
                    <rect width="512" height="39.4" y="354.6"/>
                    <rect width="512" height="39.4" y="433.4"/>
                  </g>
                  <rect width="275.8" height="275.8" fill="#2e52b2"/>
                  <g fill="#f0f0f0">
                    <path d="M38 66l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10H107l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zM38 121.3l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10H107l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zM38 176l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10H107l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zM38 230.8l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10H107l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5zm55.2 0l3.3 10h10.5l-8.5 6.2 3.2 10-8.5-6.2-8.5 6.2 3.3-10-8.5-6.2h10.5z"/>
                  </g>
                </svg>
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