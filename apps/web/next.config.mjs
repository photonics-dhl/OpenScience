/* global process */
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';

import { OPTICAL_ASSETS } from './lib/optical-lab/asset-manifest.mjs';
import { LIVE2D_ASSET_FILES, LIVE2D_ASSET_ROOT } from './lib/hermes/live2d-assets.mjs';

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
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: false },
      { source: '/register', destination: '/auth/register', permanent: false },
      { source: '/new', destination: '/research-objects/new', permanent: false },
    ];
  },
  async headers() {
    return [
      ...LIVE2D_ASSET_FILES.map(file => ({ headers: [immutableAssetHeader], source: `${LIVE2D_ASSET_ROOT}/${file}` })),
      ...Object.values(OPTICAL_ASSETS).map(({ versioned }) => ({ headers: [immutableAssetHeader], source: versioned })),
    ];
  },
  async rewrites() {
    return [
      ...LIVE2D_ASSET_FILES.map(file => ({ source: `${LIVE2D_ASSET_ROOT}/${file}`, destination: `/hermes/live2d/${file}` })),
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
