export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const student = await prisma.student.findUnique({
    where: { id: params.id }
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const attendance = await prisma.attendance.findMany({
    where: {
      studentId: student.id,
      attendanceDate: { gte: thirtyDaysAgo }
    },
    orderBy: { attendanceDate: 'desc' }
  });

  return NextResponse.json({ student, attendance });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const allowed = ['name', 'email', 'phone', 'department', 'batch', 'section', 'isActive'];
  const updateData: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) {
      updateData[key] = body[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const student = await prisma.student.update({
      where: { id: params.id },
      data: updateData
    });
    return NextResponse.json({ student });
  } catch {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Hard delete: must use a transaction to delete related records first
    await prisma.$transaction([
      prisma.scanLog.deleteMany({ where: { studentId: params.id } }),
      prisma.attendance.deleteMany({ where: { studentId: params.id } }),
      prisma.student.delete({ where: { id: params.id } })
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete failed:', err);
    return NextResponse.json({ error: 'Failed to delete student and their records' }, { status: 500 });
  }
}
