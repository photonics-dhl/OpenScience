import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';

const withNextIntl = createNextIntlPlugin();
const appRoot = path.resolve('.');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias['@'] = appRoot;
    return config;
  },
};

export default withNextIntl(nextConfig);
