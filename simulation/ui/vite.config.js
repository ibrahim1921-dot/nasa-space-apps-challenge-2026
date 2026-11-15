import { defineConfig } from 'vite';
import { createPythonProxy } from './src/python-proxy.js';

const pythonPort = Number(process.env.LAB_PYTHON_PORT || 8765);
const proxy = { '/api': createPythonProxy(pythonPort) };

export default defineConfig({
  define: { __LAB_PYTHON_PORT__: JSON.stringify(pythonPort) },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, allowedHosts: ['localhost'], proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, allowedHosts: ['localhost'], proxy },
});
