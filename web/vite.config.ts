import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// 说明：loadEnv 仅在构建期（Node 侧）可见，不会注入客户端产物；
// 客户端只暴露 VITE_ 前缀变量，密钥不进前端包。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const apiPort = Number(env.PORT ?? 3001);
  const apiPrefix = env.API_PREFIX ?? 'api';

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        [`/${apiPrefix}`]: {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
