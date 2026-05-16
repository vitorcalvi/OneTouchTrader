/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Graceful degradation handler for failed service connections
const createGracefulProxyHandler = (serviceName: string) => {
  return {
    onError: (err: any, _req: any, res: any) => {
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: `${serviceName} service unavailable`,
          status: 'service_unavailable',
          service: serviceName.toLowerCase(),
          timestamp: new Date().toISOString(),
          fallback: 'Service temporarily unavailable'
        }));
      }
      console.log(`[${serviceName} Proxy Error]`, err.message);
    },
    onProxyRes: (proxyRes: any, _req: any) => {
      if (proxyRes.statusCode === 200) {
        console.log(`[${serviceName}] Service healthy`);
      } else if (proxyRes.statusCode >= 500) {
        console.log(`[${serviceName}] Service error detected: ${proxyRes.statusCode}`);
      }
    }
  };
};

export default defineConfig(({ mode }) => {
  // Load environment variables based on current mode
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/frontend"),
        "@/shared": path.resolve(__dirname, "./src/frontend/shared"),
        "@/services": path.resolve(__dirname, "./src/frontend/services"),
      },
    },

    // Explicitly define env variables (Vite auto-exposes VITE_ prefix)
    define: {
      // Ensure environment mode is available
      'import.meta.env.MODE': JSON.stringify(mode),
    },

    server: {
      port: 5173,
      strictPort: false,
      host: true,
      allowedHosts: ['all', '192.168.1.101'],
      proxy: {
        // ===========================================
        // ALPACA (Stocks) - Port 5171
        // Server expects full paths: /api/alpaca/account, /api/alpaca/orders, etc.
        // ===========================================
        '/api/alpaca': {
          target: 'http://localhost:5171',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
              proxyRes.headers['pragma'] = 'no-cache';
              proxyRes.headers['expires'] = '0';
            });
          },
          ...createGracefulProxyHandler('Alpaca')
        },

        '/health': {
          target: 'http://localhost:5171',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
              proxyRes.headers['pragma'] = 'no-cache';
              proxyRes.headers['expires'] = '0';
            });
          },
          ...createGracefulProxyHandler('Health')
        },

        // ===========================================
        // SCREENER API - Port 5171
        // Handles: /api/screener/crypto, /api/screener/metrics, etc.
        // ===========================================
        '/api/screener': {
          target: 'http://localhost:5171',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
              proxyRes.headers['pragma'] = 'no-cache';
              proxyRes.headers['expires'] = '0';
            });
          },
          ...createGracefulProxyHandler('Screener')
        },

        // Direct Alpaca API proxies (legacy support)
        '/api/paper': {
          target: 'https://paper-api.alpaca.markets',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/paper/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const apiKey = req.headers['apca-api-key-id'];
              const apiSecret = req.headers['apca-api-secret-key'];
              if (apiKey) proxyReq.setHeader('APCA-API-KEY-ID', apiKey as string);
              if (apiSecret) proxyReq.setHeader('APCA-API-SECRET-KEY', apiSecret as string);
            });
          }
        },
        '/api/live': {
          target: 'https://api.alpaca.markets',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/live/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const apiKey = req.headers['apca-api-key-id'];
              const apiSecret = req.headers['apca-api-secret-key'];
              if (apiKey) proxyReq.setHeader('APCA-API-KEY-ID', apiKey as string);
              if (apiSecret) proxyReq.setHeader('APCA-API-SECRET-KEY', apiSecret as string);
            });
          }
        },
        '/api/data': {
          target: 'https://data.alpaca.markets',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/data/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const apiKey = req.headers['apca-api-key-id'];
              const apiSecret = req.headers['apca-api-secret-key'];
              if (apiKey) proxyReq.setHeader('APCA-API-KEY-ID', apiKey as string);
              if (apiSecret) proxyReq.setHeader('APCA-API-SECRET-KEY', apiSecret as string);
            });
          }
        },

        // ===========================================
        // Service Health Check Endpoint
        // ===========================================
        '/api/health': {
          target: 'http://localhost:5171',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (_proxyRes, _req, res) => {
              const healthData = {
                timestamp: new Date().toISOString(),
                services: { alpaca: 'healthy' },
                status: 'all_services_healthy'
              };
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(healthData));
            });
            proxy.on('error', (_err, _req, res) => {
              const healthData = {
                timestamp: new Date().toISOString(),
                services: { alpaca: 'unknown' },
                status: 'service_unavailable'
              };
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(healthData));
            });
          }
        }
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (/react$/.test(id) || /react-dom/.test(id)) return 'vendor';
              if (/react-router/.test(id)) return 'routing';
              if (/@tanstack/.test(id)) return 'query';
              if (/lucide/.test(id)) return 'ui';
              if (/recharts|lightweight-charts/.test(id)) return 'charts';
              if (/@xyflow/.test(id)) return 'graphs';
              if (/d3/.test(id)) return 'd3';
              if (/zod|clsx|tailwind-merge|class-variance-authority/.test(id)) return 'utils';
            }
          }
        }
      }
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'lucide-react', 'lightweight-charts', '@xyflow/react']
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      css: true,
      include: ['tests/unit/**/*.{test,spec}.{js,jsx,ts,tsx}'],
      exclude: ['tests/e2e/**', 'tests/integration/**', 'node_modules/**', 'dist/**'],
      passWithNoTests: true,
    }
  };
});