export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const record = await prisma.attendance.delete({
            where: { id: params.id }
        });
        return NextResponse.json({ success: true, record });
    } catch {
        return NextResponse.json({ error: 'Failed to delete attendance record' }, { status: 500 });
    }
}
