import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import mongoose from 'mongoose'

/**
 * Health check endpoint that pings MongoDB to keep the Atlas cluster active.
 * Called weekly by Vercel Cron (see vercel.json) to prevent M0 free-tier pausing.
 * Protected by CRON_SECRET when configured.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret if configured — Vercel sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    await connectDB()
    const admin = mongoose.connection.db!.admin()
    const pingResult = await admin.ping()

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mongodb: pingResult.ok === 1 ? 'connected' : 'degraded',
    })
  } catch (error) {
    return NextResponse.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      mongodb: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 })
  }
}
