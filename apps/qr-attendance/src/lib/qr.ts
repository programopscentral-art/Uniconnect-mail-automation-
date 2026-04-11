import QRCode from 'qrcode';
import { prisma } from './db';
import { generateQRToken } from './students';

export async function generateQRBuffer(token: string): Promise<Buffer> {
  return QRCode.toBuffer(token, {
    errorCorrectionLevel: 'M',
    width: 400,
    type: 'png'
  });
}

export async function generateQRDataURL(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    width: 400
  });
}

export async function generateQRsForStudents(studentIds?: string[]): Promise<number> {
  let students;

  if (studentIds && studentIds.length > 0) {
    students = await prisma.student.findMany({
      where: { id: { in: studentIds }, isActive: true }
    });
  } else {
    students = await prisma.student.findMany({
      where: { qrToken: null, isActive: true }
    });
  }

  let generated = 0;

  for (const student of students) {
    const token = generateQRToken();
    await prisma.student.update({
      where: { id: student.id },
      data: {
        qrToken: token,
        qrGeneratedAt: new Date()
      }
    });
    generated++;
  }

  return generated;
}
