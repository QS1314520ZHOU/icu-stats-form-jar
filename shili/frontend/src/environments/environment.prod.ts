export const environment = {
  production: true,
  apiBaseUrl: '', // 生产环境使用相对路径，由后端代理或部署在同一域名下
  /** 与 environment.ts 相同：Electron / 打印服务拉 CSS 用，生产请填实际静态资源可访问的 http(s) 根地址 */
  printHttpRequestPrefix: '' as string,
};
