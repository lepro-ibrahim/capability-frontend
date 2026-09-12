/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    const backendUrl = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production' && !process.env.API_URL) {
      throw new Error('API_URL is required in production');
    }
    return [{ source: '/api/:path*', destination: `${backendUrl}/:path*` }];
  },
};

module.exports = nextConfig;
