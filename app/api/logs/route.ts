import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/db';
import { NotificationLog } from '../../../lib/models';

// GET /api/logs - Retrieve recent WhatsApp message dispatches
export async function GET() {
  try {
    await connectToDatabase();
    
    // Fetch last 50 notification dispatches, ordered newest first
    const logs = await NotificationLog.find()
      .sort({ sentAt: -1 })
      .limit(50);
      
    return NextResponse.json({ success: true, data: logs });
  } catch (err: any) {
    console.error('API Error retrieving notification logs:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal database log query failed' },
      { status: 500 }
    );
  }
}
