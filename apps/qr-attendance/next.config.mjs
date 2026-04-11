/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'qrcode', 'csv-parse', 'csv-stringify']
};

export default nextConfig;
