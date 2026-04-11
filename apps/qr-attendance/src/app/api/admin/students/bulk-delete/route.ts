export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { studentIds } = await request.json();

        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return NextResponse.json({ error: 'No students selected' }, { status: 400 });
        }

        // Perform hard delete in a transaction for all selected students
        await prisma.$transaction([
            prisma.scanLog.deleteMany({ where: { studentId: { in: studentIds } } }),
            prisma.attendance.deleteMany({ where: { studentId: { in: studentIds } } }),
            prisma.student.deleteMany({ where: { id: { in: studentIds } } })
        ]);

        return NextResponse.json({ success: true, count: studentIds.length });
    } catch (err) {
        console.error('Bulk delete failed:', err);
        return NextResponse.json({ error: 'Failed to delete selected students' }, { status: 500 });
    }
}
