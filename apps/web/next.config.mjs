/* global process */
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';

import { OPTICAL_ASSETS } from './lib/optical-lab/asset-manifest.mjs';

const withNextIntl = createNextIntlPlugin();
const appRoot = path.resolve('.');
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:3001';
const immutableAssetHeader = {
  key: 'Cache-Control',
  value: 'public, max-age=31536000, immutable',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return Object.values(OPTICAL_ASSETS).map(({ versioned }) => ({
      headers: [immutableAssetHeader],
      source: versioned,
    }));
  },
  async rewrites() {
    return [
      ...Object.values(OPTICAL_ASSETS).map(({ source, versioned }) => ({
        destination: source,
        source: versioned,
      })),
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
