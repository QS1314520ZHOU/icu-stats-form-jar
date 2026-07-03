// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8080',
  /**
   * 本机 Electron 打印服务生成 PDF 时要拉取前端打包的 CSS（见 dxm-print-archive FormHtmlContent）。
   * 若页面是 file:// 或自定义协议，无法从 location.origin 拼出可访问的 http 地址，请填前端实际访问地址，
   * 例如开发时 `http://127.0.0.1:4200`；留空则仅在 http/https 下自动用当前 origin。
   */
  printHttpRequestPrefix: '' as string,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
