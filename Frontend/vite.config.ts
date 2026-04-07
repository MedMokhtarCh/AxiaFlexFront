import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { Socket } from 'node:net';

function isPortOpen(host: string, port: number, timeout = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let done = false;

    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function isTargetReachable(candidate: string): Promise<boolean> {
  try {
    const parsed = new URL(candidate);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    const hostsToCheck = parsed.hostname === 'localhost' ? ['127.0.0.1', 'localhost'] : [parsed.hostname];

    for (const host of hostsToCheck) {
      if (await isPortOpen(host, port)) return true;
    }
  } catch {}

  return false;
}

async function resolveProxyTarget(env: Record<string, string>) {
  const explicitTarget = env.VITE_PROXY_TARGET?.trim();
  if (explicitTarget) return explicitTarget;

  const candidates = ['http://127.0.0.1:3003', 'http://127.0.0.1:3001', 'http://localhost:3003', 'http://localhost:3001'];

  for (const candidate of candidates) {
    if (await isTargetReachable(candidate)) return candidate;
  }

  return candidates[0];
}

/** Évite le 404 sur /favicon.ico (requête implicite des navigateurs). */
function faviconIcoRedirect() {
  const redirect = (
    req: { url?: string },
    res: { writeHead: (c: number, h: Record<string, string>) => void; end: () => void },
    next: () => void,
  ) => {
    const pathOnly = req.url?.split("?")[0];
    if (pathOnly === "/favicon.ico") {
      res.writeHead(302, { Location: "/favicon.svg" });
      res.end();
      return;
    }
    next();
  };
  return {
    name: "favicon-ico-redirect",
    configureServer(server: { middlewares: { use: (fn: typeof redirect) => void } }) {
      server.middlewares.use(redirect);
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof redirect) => void } }) {
      server.middlewares.use(redirect);
    },
  };
}

export default defineConfig(async ({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const proxyTarget = await resolveProxyTarget(env);

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/saas': {
            target: proxyTarget,
            changeOrigin: true,
          },
          '/pos': {
            target: proxyTarget,
            changeOrigin: true,
          },
          '/uploads': {
            target: proxyTarget,
            changeOrigin: true,
          },
          '/ws': {
            target: proxyTarget,
            ws: true,
            changeOrigin: true,
          },
        },
      },
      plugins: [react(), faviconIcoRedirect()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
