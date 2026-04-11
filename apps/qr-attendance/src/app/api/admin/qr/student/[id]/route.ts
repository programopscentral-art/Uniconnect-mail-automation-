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

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (!student.qrToken) {
    return NextResponse.json({ error: 'QR not generated for this student' }, { status: 404 });
  }

  // Generate dynamic QR content that points to the scan page
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
  const baseUrl = `${protocol}://${host}`;
  const qrData = `${baseUrl}/scan?token=${student.qrToken}`;

  const buffer = await generateQRBuffer(qrData);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qr_${student.studentId}.png"`,
      'Cache-Control': 'private, max-age=3600'
    }
  });
}
