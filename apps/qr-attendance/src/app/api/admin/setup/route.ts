export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

// One-time setup endpoint — seeds default data on first deploy.
// Protected by SETUP_SECRET env var. Call once after Railway deploy.
// POST /api/admin/setup  { secret: "your-setup-secret" }

export async function POST(req: Request) {
    const setupSecret = process.env.SETUP_SECRET;

    // If no SETUP_SECRET configured, block entirely
    if (!setupSecret) {
        return NextResponse.json({ error: 'SETUP_SECRET not configured' }, { status: 403 });
    }

    let body: { secret?: string } = {};
    try { body = await req.json(); } catch {}

    if (body.secret !== setupSecret) {
        return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
    }

    const results: string[] = [];

    // 1. Default admin user
    const existingAdmin = await prisma.user.findUnique({ where: { email: 'admin@attendance.local' } });
    if (!existingAdmin) {
        const passwordHash = await hashPassword('Admin@1234');
        await prisma.user.create({
            data: { email: 'admin@attendance.local', name: 'Administrator', role: 'ADMIN', passwordHash, isActive: true }
        });
        results.push('Admin user created: admin@attendance.local / Admin@1234');
    } else {
        results.push('Admin user already exists — skipped');
    }

    // 2. Slot configs
    const morning = await prisma.slotConfig.findUnique({ where: { slot: 'MORNING' } });
    if (!morning) {
        await prisma.slotConfig.create({ data: { slot: 'MORNING', startTime: '08:00', endTime: '12:00', isActive: true } });
        results.push('MORNING slot created (08:00–12:00)');
    } else {
        results.push('MORNING slot already exists — skipped');
    }

    const afternoon = await prisma.slotConfig.findUnique({ where: { slot: 'AFTERNOON' } });
    if (!afternoon) {
        await prisma.slotConfig.create({ data: { slot: 'AFTERNOON', startTime: '12:00', endTime: '18:00', isActive: true } });
        results.push('AFTERNOON slot created (12:00–18:00)');
    } else {
        results.push('AFTERNOON slot already exists — skipped');
    }

    // 3. Default device
    const defaultDevice = await prisma.device.findUnique({ where: { deviceKey: 'default-scanner' } });
    if (!defaultDevice) {
        await prisma.device.create({ data: { deviceKey: 'default-scanner', label: 'Default Scanner', location: 'Main Entrance', isActive: true } });
        results.push('Default device created: default-scanner');
    } else {
        results.push('Default device already exists — skipped');
    }

    // 4. Student ID sequence
    const seq = await prisma.studentIdSequence.findUnique({ where: { year: 2026 } });
    if (!seq) {
        await prisma.studentIdSequence.create({ data: { year: 2026, lastSeq: 0 } });
        results.push('Student ID sequence initialized for 2026');
    } else {
        results.push('Student ID sequence already initialized — skipped');
    }

    return NextResponse.json({ success: true, results });
}

// GET: health check — shows whether setup has been done
export async function GET() {
    const adminExists = await prisma.user.count({ where: { role: 'ADMIN' } });
    const slotsExist = await prisma.slotConfig.count();
    return NextResponse.json({
        setupDone: adminExists > 0 && slotsExist > 0,
        adminUsers: adminExists,
        slots: slotsExist
    });
}
