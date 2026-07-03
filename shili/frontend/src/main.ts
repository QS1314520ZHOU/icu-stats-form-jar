import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { StaticVariable } from 'dxm-print-archive';

import { AppModule } from './app/app.module';
import { resolvePrintHttpRequestPrefix } from './app/utils/print-http-prefix';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

/*
 * dxm-print-archive 的 FormHtmlContent 会把 <link rel="stylesheet"> 拼成：
 * httpRequestPrefix + '/' + href。本机 Electron 打印要能访问该 http(s) 根地址才能加载样式。
 */
StaticVariable.setRequestPrefix(typeof window !== 'undefined' ? resolvePrintHttpRequestPrefix() : '');

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
