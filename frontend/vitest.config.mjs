import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';
export default defineConfig({
  plugins: [{ name: 'jsx-in-javascript', enforce: 'pre', transform(code, id) { if (/\/src\/.*\.js$/.test(id)) return transformWithOxc(code, id, { lang: 'jsx', jsx: { runtime: 'automatic' } }); } }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.js'], include: ['tests/**/*.test.{js,jsx}'] },
});
