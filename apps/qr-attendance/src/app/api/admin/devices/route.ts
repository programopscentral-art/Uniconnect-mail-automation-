import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { randomUUID } from 'crypto';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const devices = await prisma.device.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ devices });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { label, location } = await request.json();

  if (!label?.trim()) {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  }

  const deviceKey = randomUUID();

  const device = await prisma.device.create({
    data: {
      deviceKey,
      label: label.trim(),
      location: location?.trim() || null,
      isActive: true
    }
  });

  return NextResponse.json({ device });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id, isActive, label, location } = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'Device id is required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (isActive !== undefined) updateData.isActive = isActive;
  if (label !== undefined) updateData.label = label;
  if (location !== undefined) updateData.location = location;

  const device = await prisma.device.update({
    where: { id },
    data: updateData
  });

  return NextResponse.json({ device });
}
