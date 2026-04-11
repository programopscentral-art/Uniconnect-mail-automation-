export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const date = new Date(dateStr + 'T00:00:00.000Z');

  const [totalStudents, morningCount, afternoonCount] = await Promise.all([
    prisma.student.count({ where: { isActive: true } }),
    prisma.attendance.count({ where: { attendanceDate: date, slot: 'MORNING' } }),
    prisma.attendance.count({ where: { attendanceDate: date, slot: 'AFTERNOON' } })
  ]);

  const presentSet = await prisma.attendance.findMany({
    where: { attendanceDate: date },
    select: { studentId: true },
    distinct: ['studentId']
  });

  const presentCount = presentSet.length;
  const absentCount = Math.max(0, totalStudents - presentCount);

  return NextResponse.json({
    date: dateStr,
    total_students: totalStudents,
    morning_count: morningCount,
    afternoon_count: afternoonCount,
    present_count: presentCount,
    absent_count: absentCount
  });
}
