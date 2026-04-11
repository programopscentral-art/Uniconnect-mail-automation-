import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { generateQRsForStudents } from '@/lib/qr';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const studentIds: string[] | undefined = body.studentIds;

  const generated = await generateQRsForStudents(studentIds);
  return NextResponse.json({ generated });
}
