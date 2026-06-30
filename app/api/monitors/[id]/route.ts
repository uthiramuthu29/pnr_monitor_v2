import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../lib/db';
import { Monitor } from '../../../../lib/models';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/monitors/[id] - Remove a monitor tracker
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Monitor ID parameter is required' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const result = await Monitor.findByIdAndDelete(id);

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Monitor tracker not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Monitor removed successfully' });
  } catch (err: any) {
    console.error('API Error deleting monitor:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal database error' },
      { status: 500 }
    );
  }
}

// PATCH /api/monitors/[id] - Toggle active/inactive status of a monitor
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { active } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Monitor ID parameter is required' },
        { status: 400 }
      );
    }

    if (active === undefined) {
      return NextResponse.json(
        { success: false, error: 'Active field boolean is required' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const monitor = await Monitor.findByIdAndUpdate(
      id, 
      { active: !!active }, 
      { new: true }
    );

    if (!monitor) {
      return NextResponse.json(
        { success: false, error: 'Monitor tracker not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: monitor });
  } catch (err: any) {
    console.error('API Error updating monitor active status:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal database update failed' },
      { status: 500 }
    );
  }
}

