export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const slot = searchParams.get('slot');
  const dept = searchParams.get('dept');

  const date = new Date(dateStr + 'T00:00:00.000Z');

  const where: Record<string, unknown> = {
    attendanceDate: date
  };

  if (slot) where.slot = slot;

  if (dept) {
    where.student = {
      department: { equals: dept, mode: 'insensitive' }
    };
  }

  const records = await prisma.attendance.findMany({
    where,
    include: {
      student: {
        select: { studentId: true, name: true, department: true, email: true }
      }
    },
    orderBy: { scannedAt: 'desc' }
  });

  return NextResponse.json({ records });
}
