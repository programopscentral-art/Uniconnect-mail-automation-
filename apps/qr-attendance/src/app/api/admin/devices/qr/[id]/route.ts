export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateQRBuffer } from '@/lib/qr';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const device = await prisma.device.findUnique({
        where: { id: params.id },
        select: { deviceKey: true, id: true, label: true }
    });

    if (!device) {
        return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Generate setup URL
    const host = request.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    const setupUrl = `${baseUrl}/scan/setup?key=${device.deviceKey}&label=${encodeURIComponent(device.label || 'Device')}`;

    const buffer = await generateQRBuffer(setupUrl);

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `inline; filename="device_setup_${device.id}.png"`,
            'Cache-Control': 'private, max-age=3600'
        }
    });
}
