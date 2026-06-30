import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/db';
import { Monitor } from '../../../lib/models';
import { checkMonitor } from '../../../lib/monitor-engine';

// GET /api/cron - Endpoint triggered by external cron schedulers
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientSecret = searchParams.get('secret');
    const systemSecret = process.env.CRON_SECRET;

    // Authenticate the request if a system secret is set
    if (systemSecret && clientSecret !== systemSecret) {
      // Also check Authorization header as a fallback (standard for Vercel Cron)
      const authHeader = request.headers.get('authorization');
      if (!authHeader || authHeader !== `Bearer ${systemSecret}`) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized cron access' },
          { status: 401 }
        );
      }
    }

    await connectToDatabase();

    // Query active monitors
    const activeMonitors = await Monitor.find({ active: true });
    const now = new Date();
    const checkedPnrs: string[] = [];
    const skippedPnrs: string[] = [];
    const errors: { pnr: string; error: string }[] = [];

    for (const monitor of activeMonitors) {
      try {
        let shouldCheck = false;

        if (!monitor.lastCheckedAt) {
          shouldCheck = true;
        } else {
          const elapsedMs = now.getTime() - monitor.lastCheckedAt.getTime();
          const frequencyMs = monitor.frequencyHours * 60 * 60 * 1000;
          if (elapsedMs >= frequencyMs) {
            shouldCheck = true;
          }
        }

        if (shouldCheck) {
          await checkMonitor(monitor, false);
          checkedPnrs.push(monitor.pnr);
        } else {
          skippedPnrs.push(monitor.pnr);
        }
      } catch (err: any) {
        console.error(`Cron error processing monitor ${monitor.pnr}:`, err);
        errors.push({ pnr: monitor.pnr, error: err.message || 'Unknown check error' });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cron execution completed successfully',
      checked: checkedPnrs,
      skipped: skippedPnrs,
      errors
    });
  } catch (err: any) {
    console.error('API Error during Cron execution:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Cron evaluation failed' },
      { status: 500 }
    );
  }
}
