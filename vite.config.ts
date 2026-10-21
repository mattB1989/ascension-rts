import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two build modes:
//   npm run build         -> dist/        static site + service worker (installable, plays offline)
//   npm run build:single  -> dist-single/ one self-contained HTML file (open from disk, share as a file)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    // GitHub Pages serves the site under /<repo>/; CI sets BASE_PATH accordingly.
    base: single ? './' : (process.env.BASE_PATH ?? '/'),
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 2000,
    },
    plugins: single
      ? [viteSingleFile()]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['icon.svg'],
            manifest: {
              name: 'Ascension',
              short_name: 'Ascension',
              description: 'Real-time strategy from the Modern age to the Space age',
              theme_color: '#10161f',
              background_color: '#10161f',
              display: 'fullscreen',
              orientation: 'landscape',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
            },
          }),
        ],
  };
});
