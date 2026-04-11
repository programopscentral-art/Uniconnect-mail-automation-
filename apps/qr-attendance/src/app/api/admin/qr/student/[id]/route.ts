export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateQRBuffer } from '@/lib/qr';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const student = await prisma.student.findUnique({
    where: { id: params.id },
    select: { qrToken: true, studentId: true, name: true }
  });

  if (!student || !student.qrToken) {
    return NextResponse.json({ error: 'Student or Token not found' }, { status: 404 });
  }

  // FORCE DYNAMIC DISCOVERY: 
  // We prioritize x-forwarded-host (Railway/Proxy) over the raw host header
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');

  // Create absolute URL for the scan page
  const baseUrl = `${protocol}://${host}`;
  const qrData = `${baseUrl}/scan?token=${student.qrToken}`;

  const buffer = await generateQRBuffer(qrData);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qr_${student.studentId}.png"`,
      'X-QR-URL': qrData // For debugging
    }
  });
}
