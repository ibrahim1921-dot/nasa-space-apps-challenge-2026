// Browser cookies are host-scoped, not port-scoped. Spring session credentials
// must never be forwarded to the unauthenticated Python process on another port.
export function stripPythonCredentials(proxyRequest) {
  for (const name of ['cookie', 'authorization', 'proxy-authorization', 'x-csrf-token']) proxyRequest.removeHeader(name);
}

export function createPythonProxy(port = 8765) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Python proxy port must be an explicit local TCP port.');
  return {
  target: `http://127.0.0.1:${port}`, changeOrigin: true,
  configure(proxy) {
    proxy.on('proxyReq', stripPythonCredentials);
    proxy.on('proxyRes', response => { delete response.headers['set-cookie']; });
  },
  };
}
export const pythonProxy = createPythonProxy();
