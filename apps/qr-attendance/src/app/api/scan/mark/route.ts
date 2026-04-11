import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processAttendanceScan } from '@/lib/attendance';

export async function POST(req: NextRequest) {
  let body: { qr_payload?: string; device_key?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { qr_payload, device_key } = body;

  if (!qr_payload || !device_key) {
    return NextResponse.json({ error: 'Missing fields: qr_payload, device_key are required' }, { status: 400 });
  }

  // Verify device exists and is active
  const device = await prisma.device.findUnique({ where: { deviceKey: device_key } });
  if (!device || !device.isActive) {
    return NextResponse.json({ error: 'Unknown or inactive device' }, { status: 403 });
  }

  // Update device last_seen (fire-and-forget for performance)
  prisma.device.update({
    where: { id: device.id },
    data: { lastSeen: new Date() }
  }).catch(() => {});

  // Get IP address
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    undefined;

  // Process scan
  const result = await processAttendanceScan(qr_payload, device_key, ip);

  return NextResponse.json(result);
}
