export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slots = await prisma.slotConfig.findMany({ orderBy: { slot: 'asc' } });
  return NextResponse.json({ slots });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { slot: slotName, startTime, endTime } = body;

  if (!slotName || !startTime || !endTime) {
    return NextResponse.json({ error: 'slot, startTime, endTime are required' }, { status: 400 });
  }

  // Validate time format HH:MM
  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return NextResponse.json({ error: 'Times must be in HH:MM format' }, { status: 400 });
  }

  if (startTime >= endTime) {
    return NextResponse.json({ error: 'Start time must be before end time' }, { status: 400 });
  }

  const updated = await prisma.slotConfig.update({
    where: { slot: slotName },
    data: { startTime, endTime }
  });

  return NextResponse.json({ slot: updated });
}
