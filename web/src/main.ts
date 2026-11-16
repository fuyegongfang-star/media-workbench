import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

// T6.4 全局 401 拦截：令牌过期/失效时清除本地会话并跳登录页（含回跳地址）。
// 请求本身仍照常 reject，由调用方展示错误；这里只负责会话清理与跳转。
const rawFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await rawFetch(input, init);
  if (response.status === 401 && localStorage.getItem('wb_token')) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/me');
    if (!isAuthCall) {
      localStorage.removeItem('wb_token');
      localStorage.removeItem('wb_refresh_token');
      localStorage.removeItem('wb_user');
      const current = router.currentRoute.value;
      if (current.path !== '/login') {
        void router.replace({ path: '/login', query: { redirect: current.fullPath } });
      }
    }
  }
  return response;
};

app.mount('#app');
