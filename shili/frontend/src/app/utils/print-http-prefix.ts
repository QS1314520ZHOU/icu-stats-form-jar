import { environment } from '../../environments/environment';

/**
 * dxm-print-archive 用 StaticVariable.httpRequestPrefix 拼接 `<link rel="stylesheet">` 的绝对 URL。
 * 本机 Electron 打印进程要能访问该地址才能加载样式；file:// 或 app 协议下 origin 不是 http(s)，需单独配置。
 */
export function resolvePrintHttpRequestPrefix(): string {
  const w = window as Window & { __PRINT_ASSET_ORIGIN__?: string };
  const injected = w.__PRINT_ASSET_ORIGIN__;
  if (typeof injected === 'string' && injected.trim()) {
    return injected.replace(/\/$/, '');
  }

  const fromEnv = environment.printHttpRequestPrefix?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }

  const { protocol, origin } = window.location;
  if (protocol === 'http:' || protocol === 'https:') {
    return origin;
  }

  // file://、chrome-extension://、自定义协议等：开发时常见为 ng serve，供本机打印服务拉 bundle
  return 'http://127.0.0.1:4200';
}
