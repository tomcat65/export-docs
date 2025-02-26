'use client'

import Image from 'next/image'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface PackingListProps {
  data: {
    documentNumber: string
    date: string
    address: {
      company: string
      street: string
      details: string
      location: string
      country: string
    }
    items: Array<{
      itemNumber: number
      containerNumber: string
      seal: string
      description: string
      quantity: {
        litros: string
        kg: string
      }
    }>
  }
}

export function PackingList({ data }: PackingListProps) {
  return (
    <div className="bg-white p-8 shadow-sm print-container">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-xl font-bold">Texas Worldwide Oil Services, LLC</h1>
          <p className="text-sm">6300 N Main Rd, Houston, TX 77009</p>
          <p className="text-sm text-blue-600">info@txwos.com</p>
        </div>
        <Image
          src="/txwos-logo.png"
          alt="TXWOS Logo"
          width={120}
          height={60}
          className="object-contain"
          priority
        />
      </div>

      {/* Title and Document Info */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-center mb-4 uppercase">Packing List</h2>
        <div className="flex justify-between text-sm">
          <div>
            <h3 className="font-semibold mb-2 uppercase">Ship To:</h3>
            <p className="font-medium">{data.address.company}</p>
            <p>{data.address.street}</p>
            <p>{data.address.details}</p>
            <p>{data.address.location}</p>
            <p className="font-medium">{data.address.country}</p>
          </div>
          <div className="text-right">
            <p><span className="font-medium">Document No:</span> {data.documentNumber}</p>
            <p><span className="font-medium">Date:</span> {data.date}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="w-16 text-center">ITEM</TableHead>
              <TableHead>CONTAINER</TableHead>
              <TableHead>SEAL</TableHead>
              <TableHead>DESCRIPTION</TableHead>
              <TableHead className="text-right">QTY/Litros</TableHead>
              <TableHead className="text-right">QTY/Kg</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.itemNumber}>
                <TableCell className="text-center">{item.itemNumber}</TableCell>
                <TableCell>{item.containerNumber}</TableCell>
                <TableCell>{item.seal}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right font-medium">{item.quantity.litros}</TableCell>
                <TableCell className="text-right font-medium">{item.quantity.kg}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="mt-6 flex justify-end">
        <div className="w-48">
          <div className="flex justify-between py-2 font-medium">
            <span>Total Litros:</span>
            <span>
              {data.items.reduce((sum, item) => 
                sum + parseFloat(item.quantity.litros.replace(/,/g, '')), 0
              ).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between py-2 font-medium border-t">
            <span>Total Kg:</span>
            <span>
              {data.items.reduce((sum, item) => 
                sum + parseFloat(item.quantity.kg.replace(/,/g, '')), 0
              ).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-8 border-t">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="font-medium mb-12">Prepared By:</p>
            <div className="border-t border-black w-48" />
            <p className="text-sm">Authorized Signature</p>
          </div>
          <div>
            <p className="font-medium mb-12">Received By:</p>
            <div className="border-t border-black w-48" />
            <p className="text-sm">Customer Signature & Date</p>
          </div>
        </div>
      </div>

      {/* Page Number */}
      <div className="mt-8 text-sm text-center text-gray-500">
        <p>Page 1 of 1</p>
      </div>
    </div>
  )
} 