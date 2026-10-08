import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    {
      name: 'workspace-bundle-evidence',
      generateBundle() {
        const modules = [...this.getModuleIds()].map(id => id.replaceAll(workspaceRoot, '.')).sort();
        this.emitFile({ type: 'asset', fileName: 'module-graph.json', source: JSON.stringify(modules, null, 2) + '\n' });
      },
    },
  ],
  build: { cssMinify: false, assetsInlineLimit: 0, rollupOptions: { input: { app: fileURLToPath(new URL('./index.html', import.meta.url)), foundation: fileURLToPath(new URL('./foundation.html', import.meta.url)) } } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
});
