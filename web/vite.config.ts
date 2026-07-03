import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The Azure DevOps extension host serves the built assets from a relative
// path inside the extension package, so we emit a relative asset base and
// keep the output folder name aligned with vss-extension.json.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
});
