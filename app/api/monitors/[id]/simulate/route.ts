import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../../lib/db';
import { simulateStatusChange } from '../../../../../lib/monitor-engine';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/monitors/[id]/simulate - Advance passenger seat state in Mock Mode
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Monitor ID parameter is required' },
        { status: 400 }
      );
    }

    if (process.env.PNR_PROVIDER && process.env.PNR_PROVIDER !== 'mock') {
      return NextResponse.json(
        { success: false, error: 'Simulation is only available in PNR Mock Mode.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    
    // Evolve the mock status and trigger a notification check
    const newStatus = await simulateStatusChange(id);

    return NextResponse.json({ success: true, data: newStatus });
  } catch (err: any) {
    console.error('API Error simulating status changes:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Simulation execution failed' },
      { status: 500 }
    );
  }
}
