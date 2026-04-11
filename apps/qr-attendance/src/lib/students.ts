import { prisma } from './db';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { parse } from 'csv-parse/sync';

export async function generateNextStudentId(year: number): Promise<string> {
  const result = await prisma.$queryRaw<{ last_seq: number }[]>(Prisma.sql`
    INSERT INTO student_id_sequences (year, last_seq)
    VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_seq = student_id_sequences.last_seq + 1
    RETURNING last_seq
  `);

  const seq = result[0].last_seq;
  return `B${year}${String(seq).padStart(4, '0')}`;
}

export function generateQRToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export interface ParsedStudent {
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  batch?: string;
  section?: string;
  studentId?: string;
  [key: string]: string | undefined;
}

export function parseCSVStudents(text: string): ParsedStudent[] {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  return records.map((record) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      normalized[key.toLowerCase().replace(/\s+/g, '_')] = String(value ?? '').trim();
    }

    return {
      name: normalized.name ?? normalized.student_name ?? normalized.full_name ?? '',
      email: normalized.email ?? normalized.email_address ?? undefined,
      phone: normalized.phone ?? normalized.mobile ?? normalized.phone_number ?? undefined,
      department: normalized.department ?? normalized.dept ?? undefined,
      batch: normalized.batch ?? normalized.year ?? undefined,
      section: normalized.section ?? undefined,
      studentId: normalized.student_id ?? normalized.studentid ?? normalized.roll_no ?? normalized.roll_number ?? undefined
    };
  });
}
