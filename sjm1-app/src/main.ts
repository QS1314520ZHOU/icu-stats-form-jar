import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

// ===== 保留：bootstrap 之前缓存宿主消息（勿删）=====
(window as any).__scMsg = (window as any).__scMsg || null;
window.addEventListener('message', (e: MessageEvent) => {
  const d: any = e.data;
  if (d && d.type === 'SmartCare' && d.patient && d.patient.id) {
    (window as any).__scMsg = d;
  }
});
// ===============================================

// enableProdMode() removed — Angular CLI handles prod mode automatically via build configuration

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
