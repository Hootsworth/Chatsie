import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-404',
      closeBundle() {
        fs.copyFileSync('../docs/index.html', '../docs/404.html');
      }
    }
  ],
  base: '/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  }
})
