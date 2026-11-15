import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const appRoot = fileURLToPath(new URL('./app', import.meta.url));
const localInventory = new URL('./.local-data/inventory.json', import.meta.url);
const localClassification = new URL('./.local-data/classification.json', import.meta.url);

function localResearchData(): Plugin {
  const endpoints = [
    {
      route: '/__local/inventory.json',
      file: localInventory,
      missing: 'No local inventory prepared. Run npm run prepare:local -- <inventory-file>.',
      unreadable: 'The local inventory could not be read. Prepare it again before retrying.',
    },
    {
      route: '/__local/classification.json',
      file: localClassification,
      missing: 'No local classification prepared. Run npm run import:f1db -- <season> <round>.',
      unreadable: 'The local classification could not be read. Import it again before retrying.',
    },
  ];
  return {
    name: 'local-research-data',
    apply: 'serve',
    configureServer(server) {
      for (const endpoint of endpoints) {
        server.middlewares.use(endpoint.route, async (request, response) => {
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.statusCode = 405;
            response.setHeader('Allow', 'GET, HEAD');
            response.end(JSON.stringify({ error: 'Read-only local research endpoint.' }));
            return;
          }
          try {
            const data = await readFile(endpoint.file, 'utf8');
            response.end(request.method === 'HEAD' ? undefined : data);
          } catch (error) {
            const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
            response.statusCode = missing ? 404 : 500;
            response.end(JSON.stringify({ error: missing ? endpoint.missing : endpoint.unreadable }));
          }
        });
      }
    },
  };
}

export default defineConfig({
  root: appRoot,
  plugins: [localResearchData()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { strict: true, allow: [appRoot] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
