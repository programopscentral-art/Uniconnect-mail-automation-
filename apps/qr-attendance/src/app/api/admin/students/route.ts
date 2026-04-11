import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const dept = searchParams.get('dept') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { studentId: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (dept) {
    where.department = { equals: dept, mode: 'insensitive' };
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        studentId: true,
        name: true,
        email: true,
        phone: true,
        department: true,
        batch: true,
        section: true,
        qrToken: true,
        qrGeneratedAt: true,
        isActive: true,
        createdAt: true
      }
    }),
    prisma.student.count({ where })
  ]);

  return NextResponse.json({
    students,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
}
