import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default admin user
  const passwordHash = await bcrypt.hash('Admin@1234', 12);
  await prisma.user.upsert({
    where: { email: 'admin@attendance.local' },
    update: {},
    create: {
      email: 'admin@attendance.local',
      name: 'Administrator',
      role: 'ADMIN',
      passwordHash,
      isActive: true
    }
  });
  console.log('Admin user created: admin@attendance.local / Admin@1234');

  // Create default slot configs
  await prisma.slotConfig.upsert({
    where: { slot: 'MORNING' },
    update: { startTime: '00:00', endTime: '12:00' },
    create: {
      slot: 'MORNING',
      startTime: '00:00',
      endTime: '12:00',
      isActive: true
    }
  });

  await prisma.slotConfig.upsert({
    where: { slot: 'AFTERNOON' },
    update: { startTime: '12:00', endTime: '23:59' },
    create: {
      slot: 'AFTERNOON',
      startTime: '12:00',
      endTime: '23:59',
      isActive: true
    }
  });
  console.log('Slot configs updated: MORNING (00:00-12:00), AFTERNOON (12:00-23:59)');

  // Create default device
  await prisma.device.upsert({
    where: { deviceKey: 'default-scanner' },
    update: {},
    create: {
      deviceKey: 'default-scanner',
      label: 'Default Scanner',
      location: 'Main Entrance',
      isActive: true
    }
  });
  console.log('Default device created: default-scanner');

  // Initialize student ID sequence for 2026
  await prisma.studentIdSequence.upsert({
    where: { year: 2026 },
    update: {},
    create: {
      year: 2026,
      lastSeq: 0
    }
  });
  console.log('Student ID sequence initialized for year 2026');

  // Create a test student with a known QR token
  const testToken = '1234567890abcdef1234567890abcdef';
  await prisma.student.upsert({
    where: { studentId: 'B2026TEST' },
    update: { isActive: true, qrToken: testToken },
    create: {
      studentId: 'B2026TEST',
      name: 'Test Student',
      qrToken: testToken,
      isActive: true
    }
  });
  console.log('Test student created with token:', testToken);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
