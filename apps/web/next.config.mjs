/* global process */
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';

const withNextIntl = createNextIntlPlugin();
const appRoot = path.resolve('.');
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
  webpack(config) {
    config.resolve.alias['@'] = appRoot;
    return config;
  },
};

export default withNextIntl(nextConfig);
