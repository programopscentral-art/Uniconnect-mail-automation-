import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { parseCSVStudents, generateNextStudentId } from '@/lib/students';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    let rows: Array<{ name: string; email?: string; phone?: string; department?: string; batch?: string; section?: string; studentId?: string }> = [];

    if (filename.endsWith('.csv') || file.type === 'text/csv') {
      const text = await file.text();
      rows = parseCSVStudents(text);
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

      rows = raw.map((record) => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(record)) {
          normalized[key.toLowerCase().replace(/\s+/g, '_')] = String(value ?? '').trim();
        }
        return {
          name: normalized.name ?? normalized.student_name ?? normalized.full_name ?? '',
          email: normalized.email ?? normalized.email_address ?? undefined,
          phone: normalized.phone ?? normalized.mobile ?? undefined,
          department: normalized.department ?? normalized.dept ?? undefined,
          batch: normalized.batch ?? normalized.year ?? undefined,
          section: normalized.section ?? undefined,
          studentId: normalized.student_id ?? normalized.studentid ?? normalized.roll_no ?? undefined
        };
      });
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV or XLSX.' }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const errors: { row: number; reason: string }[] = [];
    let inserted = 0;
    let skipped = 0;

    // Create upload batch record
    const batch = await prisma.uploadBatch.create({
      data: {
        filename: file.name,
        uploadedBy: session.userId,
        totalRows: rows.length,
        status: 'PROCESSING'
      }
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header

      if (!row.name?.trim()) {
        errors.push({ row: rowNum, reason: 'Name is required' });
        skipped++;
        continue;
      }

      try {
        // Check duplicate by email
        if (row.email) {
          const existing = await prisma.student.findFirst({
            where: { email: row.email.trim().toLowerCase() }
          });
          if (existing) {
            errors.push({ row: rowNum, reason: `Email ${row.email} already exists (${existing.studentId})` });
            skipped++;
            continue;
          }
        }

        // Check duplicate by studentId
        let studentId = row.studentId?.trim();
        if (studentId) {
          const existing = await prisma.student.findUnique({ where: { studentId } });
          if (existing) {
            errors.push({ row: rowNum, reason: `Student ID ${studentId} already exists` });
            skipped++;
            continue;
          }
        } else {
          studentId = await generateNextStudentId(year);
        }

        await prisma.student.create({
          data: {
            studentId,
            name: row.name.trim(),
            email: row.email?.trim().toLowerCase() || null,
            phone: row.phone?.trim() || null,
            department: row.department?.trim() || null,
            batch: row.batch?.trim() || null,
            section: row.section?.trim() || null,
            isActive: true
          }
        });

        inserted++;
      } catch (err) {
        errors.push({ row: rowNum, reason: `DB error: ${err instanceof Error ? err.message : 'unknown'}` });
        skipped++;
      }
    }

    // Update batch record
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { inserted, skipped, errors: JSON.parse(JSON.stringify(errors)), status: 'DONE' }
    });

    return NextResponse.json({ inserted, skipped, errors, total: rows.length });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed: ' + (err instanceof Error ? err.message : 'unknown') }, { status: 500 });
  }
}
