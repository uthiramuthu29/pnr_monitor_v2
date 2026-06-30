import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../../lib/db';
import { checkMonitor } from '../../../../../lib/monitor-engine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/monitors/[id]/check - Force a manual status check and notify immediately
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Monitor ID parameter is required' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    
    // Check monitor status and force-dispatch notification alerts
    const newStatus = await checkMonitor(id, true);

    return NextResponse.json({ success: true, data: newStatus });
  } catch (err: any) {
    console.error('API Error manual checking monitor:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal check error occurred' },
      { status: 500 }
    );
  }
}
