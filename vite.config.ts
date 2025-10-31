import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['react-dev-locator'],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths(),
  ],
  server: {
    allowedHosts: [
      'carlena-sthenic-ragingly.ngrok-free.dev' // ✅ allow ngrok tunnel host
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable websocket proxying
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('Vite proxy error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] →', req.method, req.url, '→ http://localhost:3001' + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Vite Proxy] ←', proxyRes.statusCode, req.url);
            if (proxyRes.statusCode === 404) {
              console.error('[Vite Proxy] 404 Error for:', req.url, '- Is backend running on port 3001?');
            }
          });
        },
      },
    },
  },
});
