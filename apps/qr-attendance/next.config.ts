import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'qrcode', 'csv-parse', 'csv-stringify']
};
export default nextConfig;
