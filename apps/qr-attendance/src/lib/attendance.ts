import { prisma } from './db';
import { Prisma } from '@prisma/client';

export type ScanResult =
  | 'ACCEPTED'
  | 'DUPLICATE'
  | 'INVALID_QR'
  | 'UNKNOWN_STUDENT'
  | 'OUTSIDE_SLOT'
  | 'INACTIVE_STUDENT';

export async function processAttendanceScan(
  qrPayload: string,
  deviceKey: string,
  ipAddress?: string
) {
  // 1. Get current server time → determine active slot
  const now = new Date();
  // Convert to IST for slot comparison (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const hours = istNow.getUTCHours().toString().padStart(2, '0');
  const mins = istNow.getUTCMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${mins}`;

  // Fetch all active slots and find matching one
  const slots = await prisma.slotConfig.findMany({ where: { isActive: true } });
  const activeSlot = slots.find((s) => s.startTime <= timeStr && s.endTime > timeStr);

  if (!activeSlot) {
    await logScan(qrPayload, null, 'OUTSIDE_SLOT', null, deviceKey, ipAddress);
    return {
      result: 'OUTSIDE_SLOT' as ScanResult,
      message: `No active slot. Slots: ${slots.map((s) => `${s.slot} ${s.startTime}-${s.endTime}`).join(', ')}`
    };
  }

  // 2. Validate QR format (must be 32-char hex)
  if (!/^[0-9a-f]{32}$/.test(qrPayload)) {
    await logScan(qrPayload, null, 'INVALID_QR', activeSlot.slot, deviceKey, ipAddress);
    return { result: 'INVALID_QR' as ScanResult, message: 'Invalid QR code.' };
  }

  // 3. Find student
  const student = await prisma.student.findUnique({ where: { qrToken: qrPayload } });
  if (!student) {
    await logScan(qrPayload, null, 'UNKNOWN_STUDENT', activeSlot.slot, deviceKey, ipAddress);
    return { result: 'UNKNOWN_STUDENT' as ScanResult, message: 'QR not linked to any student.' };
  }
  if (!student.isActive) {
    await logScan(qrPayload, student.id, 'INACTIVE_STUDENT', activeSlot.slot, deviceKey, ipAddress);
    return { result: 'INACTIVE_STUDENT' as ScanResult, message: 'Student is inactive.' };
  }

  // 4. Get today's date in IST as YYYY-MM-DD
  const todayIST = istNow.toISOString().split('T')[0];

  // 5. ATOMIC INSERT - the core concurrency mechanism
  const inserted = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO attendance (id, student_id, attendance_date, slot, scanned_at, device_key)
    VALUES (gen_random_uuid(), ${student.id}::uuid, ${todayIST}::date, ${activeSlot.slot}, NOW(), ${deviceKey})
    ON CONFLICT (student_id, attendance_date, slot) DO NOTHING
    RETURNING id
  `);

  if (inserted.length > 0) {
    await logScan(qrPayload, student.id, 'ACCEPTED', activeSlot.slot, deviceKey, ipAddress);
    return {
      result: 'ACCEPTED' as ScanResult,
      student: {
        studentId: student.studentId,
        name: student.name,
        department: student.department
      },
      slot: activeSlot.slot,
      date: todayIST,
      scannedAt: now.toISOString()
    };
  } else {
    const existing = await prisma.attendance.findFirst({
      where: {
        studentId: student.id,
        attendanceDate: new Date(todayIST),
        slot: activeSlot.slot
      }
    });
    await logScan(
      qrPayload,
      student.id,
      'DUPLICATE',
      activeSlot.slot,
      deviceKey,
      ipAddress,
      existing?.scannedAt
    );
    return {
      result: 'DUPLICATE' as ScanResult,
      student: {
        studentId: student.studentId,
        name: student.name,
        department: student.department
      },
      slot: activeSlot.slot,
      date: todayIST,
      firstMarkedAt: existing?.scannedAt?.toISOString()
    };
  }
}

async function logScan(
  payload: string,
  studentId: string | null,
  result: ScanResult,
  slot: string | null,
  deviceKey: string,
  ip?: string,
  firstScanAt?: Date
) {
  try {
    await prisma.scanLog.create({
      data: {
        qrPayload: payload,
        studentId: studentId ?? undefined,
        result,
        slot: slot ?? undefined,
        attendanceDate: new Date(),
        deviceKey,
        ipAddress: ip,
        firstScanAt
      }
    });
  } catch {
    // Never fail a scan due to log error
  }
}
