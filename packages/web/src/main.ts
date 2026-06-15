import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElIcons from '@element-plus/icons-vue';

import App from './App.vue';
import router, { setupRouterGuards } from './router';
import { setToastHandler } from './api/http';
import './styles/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(ElementPlus, { locale: zhCn });

for (const [name, comp] of Object.entries(ElIcons)) {
  app.component(name, comp as never);
}

// 注册 http.ts 的 toast handler
import { ElMessage } from 'element-plus';
setToastHandler((kind, message) => {
  if (kind === 'error') ElMessage.error(message);
  else ElMessage.success(message);
});

await setupRouterGuards();
app.use(router);
app.mount('#app');
