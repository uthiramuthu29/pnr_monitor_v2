import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/db';
import { Monitor } from '../../../lib/models';
import { checkMonitor } from '../../../lib/monitor-engine';

// GET /api/monitors - Retrieve all monitors
export async function GET() {
  try {
    await connectToDatabase();
    const monitors = await Monitor.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: monitors });
  } catch (err: any) {
    console.error('API Error fetching monitors:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Database error occurred' },
      { status: 500 }
    );
  }
}

// POST /api/monitors - Create a new monitor or update an existing one
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    
    const { pnr, frequencyHours, whatsappNumbers } = body;

    // Server-side validation
    if (!pnr || !/^\d{10}$/.test(pnr)) {
      return NextResponse.json(
        { success: false, error: 'PNR must be a 10-digit numeric string.' },
        { status: 400 }
      );
    }

    if (!frequencyHours || isNaN(Number(frequencyHours)) || Number(frequencyHours) < 1) {
      return NextResponse.json(
        { success: false, error: 'Frequency must be at least 1 hour.' },
        { status: 400 }
      );
    }

    if (!whatsappNumbers || !Array.isArray(whatsappNumbers) || whatsappNumbers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Provide at least one phone number.' },
        { status: 400 }
      );
    }

    // Clean and validate numbers
    const cleanedNumbers = whatsappNumbers.map(num => {
      const clean = num.trim().replace(/\s+/g, '');
      if (!/^\+?[1-9]\d{1,14}$/.test(clean)) {
        throw new Error(`Invalid phone number format: ${num}`);
      }
      return clean;
    });

    let monitor = await Monitor.findOne({ pnr });

    if (monitor) {
      // If it exists, update phone numbers (merging them) and update frequency
      const existingSet = new Set(monitor.whatsappNumbers);
      cleanedNumbers.forEach(num => existingSet.add(num));
      
      monitor.whatsappNumbers = Array.from(existingSet);
      monitor.frequencyHours = Number(frequencyHours);
      monitor.active = true; // reactivate if paused
      await monitor.save();
    } else {
      // Create new monitor
      monitor = await Monitor.create({
        pnr,
        frequencyHours: Number(frequencyHours),
        whatsappNumbers: cleanedNumbers,
        active: true
      });
    }

    // Run immediate check and notify subscription confirmation
    try {
      await checkMonitor(monitor, true);
    } catch (checkErr: any) {
      console.error(`Initial PNR query failed for ${pnr}:`, checkErr);
      // We still return success since the monitor was created in DB, but alert the client
      return NextResponse.json({ 
        success: true, 
        data: monitor,
        warning: `Monitor created but initial PNR check failed: ${checkErr.message}` 
      });
    }

    // Reload from DB to get the latest updated values (including lastCheckedAt & lastStatus)
    const updatedMonitor = await Monitor.findById(monitor._id);

    return NextResponse.json({ success: true, data: updatedMonitor });
  } catch (err: any) {
    console.error('API Error creating monitor:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error occurred' },
      { status: 500 }
    );
  }
}
