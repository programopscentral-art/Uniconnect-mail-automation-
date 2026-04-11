import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateQRBuffer } from '@/lib/qr';
import JSZip from 'jszip';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const students = await prisma.student.findMany({
    where: { qrToken: { not: null }, isActive: true },
    select: { id: true, studentId: true, name: true, qrToken: true, department: true }
  });

  if (students.length === 0) {
    return NextResponse.json({ error: 'No students with QR codes found' }, { status: 404 });
  }

  const zip = new JSZip();

  // Generate QR for each student
  await Promise.all(
    students.map(async (student) => {
      if (!student.qrToken) return;
      try {
        const buffer = await generateQRBuffer(student.qrToken);
        const safeName = student.name.replace(/[^a-z0-9_\-]/gi, '_');
        const dept = student.department ? `${student.department.replace(/[^a-z0-9_\-]/gi, '_')}/` : '';
        zip.file(`${dept}${student.studentId}_${safeName}.png`, buffer);
      } catch (err) {
        console.error(`Failed QR for ${student.studentId}:`, err);
      }
    })
  );

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="qr_codes_${new Date().toISOString().split('T')[0]}.zip"`,
      'Content-Length': String(zipBuffer.length)
    }
  });
}
