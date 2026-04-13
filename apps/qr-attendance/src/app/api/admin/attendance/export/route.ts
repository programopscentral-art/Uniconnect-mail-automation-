export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { stringify } from 'csv-stringify/sync';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') ?? new Date().toISOString().split('T')[0];
  const dateTo = searchParams.get('dateTo') ?? dateFrom;
  const slot = searchParams.get('slot');
  const dept = searchParams.get('dept');

  const where: Record<string, unknown> = {
    attendanceDate: {
      gte: new Date(dateFrom + 'T00:00:00.000Z'),
      lte: new Date(dateTo + 'T23:59:59.999Z')
    }
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
        select: { studentId: true, name: true, email: true, department: true, batch: true, section: true }
      }
    },
    orderBy: [{ attendanceDate: 'asc' }, { scannedAt: 'asc' }]
  });

  // Build deviceKey → label map for human-readable device names
  const deviceKeys = [...new Set(records.map((r) => r.deviceKey).filter(Boolean))] as string[];
  const devices = deviceKeys.length > 0
    ? await prisma.device.findMany({ where: { deviceKey: { in: deviceKeys } }, select: { deviceKey: true, label: true } })
    : [];
  const deviceLabelMap = Object.fromEntries(devices.map((d) => [d.deviceKey, d.label ?? d.deviceKey]));

  const rows = records.map((r) => ({
    student_id: r.student.studentId,
    name: r.student.name,
    email: r.student.email ?? '',
    department: r.student.department ?? '',
    batch: r.student.batch ?? '',
    section: r.student.section ?? '',
    date: r.attendanceDate.toISOString().split('T')[0],
    slot: r.slot,
    time: r.scannedAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    device: r.deviceKey ? (deviceLabelMap[r.deviceKey] ?? r.deviceKey) : ''
  }));

  const csv = stringify(rows, {
    header: true,
    columns: ['student_id', 'name', 'email', 'department', 'batch', 'section', 'date', 'slot', 'time', 'device']
  });

  const filename = `attendance_${dateFrom}_to_${dateTo}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    }
  });
}
