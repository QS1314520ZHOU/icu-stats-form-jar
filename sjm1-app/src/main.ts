import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// 在 bootstrapApplication 之前，再注册一层（防 index.html 内联被改写而失效）
(window as any).__scMsg = (window as any).__scMsg || null;
window.addEventListener('message', (e: MessageEvent) => {
  const d: any = e.data;
  if (d && d.type === 'SmartCare' && d.patient && d.patient.id) {
    (window as any).__scMsg = d;
    console.log('[form main] cached host msg', d);
  }
});

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
