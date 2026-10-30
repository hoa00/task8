import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');

export default defineConfig(({ mode }) => {
  const isolated = process.env.TASK8_ISOLATED_PROFILE === '1';
  const env = {
    ...(isolated ? {} : loadEnv(mode, fileURLToPath(new URL('./', import.meta.url)), 'VITE_')),
    ...process.env,
  };
  const dataMode = env.VITE_DATA_MODE ?? 'mock';
  if (dataMode !== 'mock' && dataMode !== 'http') throw new TypeError('Invalid data mode');
  const apiOrigin = new URL(env.PORTLESS_URL ?? 'http://127.0.0.1:8787');
  if (env.PORTLESS_URL) apiOrigin.hostname = `api.${apiOrigin.hostname}`;
  const apiProxy = { target: env.TASK8_API_PROXY_TARGET ?? apiOrigin.origin, changeOrigin: true };
  const httpOnly = mode === 'http-only';
  if (httpOnly && dataMode !== 'http')
    throw new TypeError('HTTP-only bundle must use HTTP data mode');
  return {
    ...(isolated ? { envDir: false as const } : {}),
    resolve: {
      alias: {
        '#studio-adapter': fileURLToPath(
          new URL(`./src/data/adapters/${dataMode}-entry.ts`, import.meta.url),
        ),
      },
    },
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      {
        name: 'workspace-bundle-evidence',
        generateBundle() {
          const modules = [...this.getModuleIds()]
            .map((id) => id.replaceAll(workspaceRoot, '.'))
            .sort();
          this.emitFile({
            type: 'asset',
            fileName: 'module-graph.json',
            source: JSON.stringify(modules, null, 2) + '\n',
          });
        },
      },
    ],
    build: {
      outDir: httpOnly ? 'dist-http' : 'dist',
      cssMinify: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        input: httpOnly
          ? { app: fileURLToPath(new URL('./index.html', import.meta.url)) }
          : {
              app: fileURLToPath(new URL('./index.html', import.meta.url)),
              foundation: fileURLToPath(new URL('./foundation.html', import.meta.url)),
              controls: fileURLToPath(new URL('./controls.html', import.meta.url)),
              overlays: fileURLToPath(new URL('./overlays.html', import.meta.url)),
              projectRoutes: fileURLToPath(new URL('./project-routes.html', import.meta.url)),
              taskDetail: fileURLToPath(new URL('./task-detail.html', import.meta.url)),
              calendar: fileURLToPath(new URL('./calendar.html', import.meta.url)),
              timeline: fileURLToPath(new URL('./timeline.html', import.meta.url)),
              taskTable: fileURLToPath(new URL('./task-table.html', import.meta.url)),
              taskBoard: fileURLToPath(new URL('./task-board.html', import.meta.url)),
              taskList: fileURLToPath(new URL('./task-list.html', import.meta.url)),
              taskFields: fileURLToPath(new URL('./task-fields.html', import.meta.url)),
              shellHarness: fileURLToPath(new URL('./shell-harness.html', import.meta.url)),
            },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/auth': apiProxy, '/api': apiProxy },
    },
    preview: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/auth': apiProxy, '/api': apiProxy },
    },
  };
});
