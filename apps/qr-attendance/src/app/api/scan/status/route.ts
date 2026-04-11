export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const hours = istNow.getUTCHours().toString().padStart(2, '0');
  const mins = istNow.getUTCMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${mins}`;
  const todayIST = istNow.toISOString().split('T')[0];
  const today = new Date(todayIST + 'T00:00:00.000Z');

  const [slots, morningCount, afternoonCount] = await Promise.all([
    prisma.slotConfig.findMany({ where: { isActive: true } }),
    prisma.attendance.count({ where: { attendanceDate: today, slot: 'MORNING' } }),
    prisma.attendance.count({ where: { attendanceDate: today, slot: 'AFTERNOON' } })
  ]);

  const activeSlot = slots.find((s) => s.startTime <= timeStr && s.endTime > timeStr) ?? null;

  return NextResponse.json({
    currentTime: timeStr,
    todayIST,
    activeSlot: activeSlot ? { slot: activeSlot.slot, startTime: activeSlot.startTime, endTime: activeSlot.endTime } : null,
    morningCount,
    afternoonCount,
    allSlots: slots.map((s) => ({ slot: s.slot, startTime: s.startTime, endTime: s.endTime }))
  });
}
