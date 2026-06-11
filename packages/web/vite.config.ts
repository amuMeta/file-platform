import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,           // 监听 0.0.0.0,允许局域网访问(默认只听 localhost)
    port: 5180,
    strictPort: true,     // 端口被占就立即失败并退出,不要 fallback 到 5181 之类
    // Vite 5+ 默认开启 DNS rebinding 防护,白名单里加 cpolar 域名后,
    // 同事通过 cpolar 公网域名访问时不会被 403 拒绝。
    // 也保留 localhost 和 LAN IP,本机和局域网同事能继续直连。
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '192.168.1.157',
      '.cpolar.cn',        // cpolar VIP 域名(包含 hilo-files.vip.cpolar.cn)
      '.cpolar.io',        // cpolar 海外域名(其他 cpolar 区域)
    ],
    // 局域网访问时 HMR(websocket)有时会断,显式配 host/port 让它走 LAN IP
    hmr: {
      host: '192.168.1.157',  // ← 你的电脑 LAN IP(其它设备访问时浏览器用此 IP 连 HMR)
      port: 5180,
      clientPort: 5180,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // 上游不可达时,返一个统一业务格式,前端拦截器就能弹友好提示
        // (而不是裸的 "Request failed with status code 500")
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            const r = res as { writeHead?: (n: number, h: Record<string, string>) => void; end?: (s: string) => void; headersSent?: boolean };
            if (r && typeof r.writeHead === 'function' && !r.headersSent) {
              try {
                r.writeHead(502, { 'Content-Type': 'application/json' });
                r.end?.(
                  JSON.stringify({
                    code: 502,
                    message: '后端服务暂时不可达,请确认 server 已启动 (pnpm dev:server)',
                  })
                );
              } catch {
                /* socket 已关 */
              }
            }
            console.error('[vite proxy] upstream error:', err.message);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
