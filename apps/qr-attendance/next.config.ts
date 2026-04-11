import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'qrcode', 'csv-parse', 'csv-stringify']
};
export default nextConfig;
