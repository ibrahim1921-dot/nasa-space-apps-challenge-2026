import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this folder so Next ignores lockfiles in parent directories.
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  // The local data routes (src/app/api: bundled synthetic data, not the Java backend) read these files with fs at runtime; include them in the server bundle.
  outputFileTracingIncludes: {
    '/api/nights': ['./src/data/nights_scored.json', './src/data/bidsleep_nights.csv'],
    '/api/nights/score': ['./src/data/nights_scored.json', './src/data/bidsleep_nights.csv'],
    '/api/labs': ['./src/data/i4_personal_changes.csv'],
    '/api/stand-tests': ['./src/data/standtests.json'],
  },
};

export default nextConfig;
