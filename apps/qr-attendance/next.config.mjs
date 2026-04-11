/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'qrcode', 'csv-parse', 'csv-stringify']
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // html5-qrcode uses browser APIs — exclude from server bundle
      config.externals = [...(config.externals || []), 'html5-qrcode'];
    }
    return config;
  }
};

export default nextConfig;
