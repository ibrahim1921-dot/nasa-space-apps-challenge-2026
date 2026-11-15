import { defineConfig } from '@playwright/test';
import path from 'node:path';

const managedPython = process.env.LAB_E2E_MANAGED_PYTHON === 'true';
const delivery = process.env.LAB_E2E_DELIVERY === 'true';
const vite = { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 30000,
  env: { LAB_PYTHON_PORT: managedPython ? '18765' : (process.env.LAB_PYTHON_PORT || '8765'),
    VITE_SIMULATION_DELIVERY_ENABLED: delivery ? 'true' : 'false', VITE_SPRING_BOOT_ORIGIN: 'http://127.0.0.1:18080' } };
const python = process.env.LAB_PYTHON_EXECUTABLE || 'python';
if (python.includes('"')) throw new Error('Use an executable path without quotes.');

export default defineConfig({
  testDir: './tests/browser',
  testMatch: delivery ? '**/delivery.spec.js' : '**/lab.spec.js',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium',
    channel: process.env.LAB_BROWSER_CHANNEL || 'msedge', viewport: { width: 1440, height: 1000 } },
  webServer: managedPython ? [
    { command: `"${python}" -B -m simulation.api --port 18765`, cwd: path.resolve(import.meta.dirname, '../..'),
      url: 'http://127.0.0.1:18765/api/catalog', reuseExistingServer: false, timeout: 30000 }, vite,
  ] : vite,
});
