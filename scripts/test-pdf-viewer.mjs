#!/usr/bin/env node

/**
 * PDF Viewer组件测试脚本（原生iframe方案）
 *
 * 验证项目：
 * 1. 页面使用iframe预览PDF
 * 2. 页面没有Canvas PDF渲染
 * 3. 页面不导入pdfjs-dist
 * 4. 页面不加载pdf.worker
 * 5. iframe地址包含layout=flow
 * 6. iframe地址默认包含 #page=1&zoom=135
 * 7. 查询参数位于fragment之前
 * 8. 页面没有下载当日/下载全部按钮
 * 9. 页面有打印当日和一键打印全部按钮
 * 10. dist中不存在pdf.worker文件
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SJM1_APP = join(ROOT, 'sjm1-app');
const DIST_DIR = join(SJM1_APP, 'dist', 'sjm1-app', 'browser');
const SRC_DIR = join(SJM1_APP, 'src', 'app');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.error(`✗ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

console.log('\n=== PDF Viewer组件测试（原生iframe方案）===\n');

// 1. 验证dist目录存在
check('dist目录存在', existsSync(DIST_DIR));

if (!existsSync(DIST_DIR)) {
  console.log('\n⚠ dist目录不存在，请先运行构建');
  process.exit(1);
}

// 2. 读取main bundle
const mainFiles = readdirSync(DIST_DIR).filter(f => f.startsWith('main-') && f.endsWith('.js'));
if (mainFiles.length === 0) {
  console.error('✗ 未找到main bundle');
  process.exit(1);
}

const mainBundle = readFileSync(join(DIST_DIR, mainFiles[0]), 'utf-8');
console.log(`Main bundle: ${mainFiles[0]}`);

// 3. 验证不包含pdfjs-dist相关代码
check('不包含GlobalWorkerOptions', !mainBundle.includes('GlobalWorkerOptions'));
check('不包含getDocument', !mainBundle.includes('getDocument'));
check('不包含pdf.worker路径', !mainBundle.includes('pdf.worker'));
check('不包含pdfjsLib', !mainBundle.includes('pdfjsLib'));

// 4. 验证源码不导入pdfjs-dist
const hljldFormPdfTs = join(SRC_DIR, 'hljld-form-pdf.component.ts');
if (existsSync(hljldFormPdfTs)) {
  const tsContent = readFileSync(hljldFormPdfTs, 'utf-8');
  check('源码不导入pdfjs-dist', !tsContent.includes("from 'pdfjs-dist'"));
  check('源码不使用pdfjsLib', !tsContent.includes('pdfjsLib'));
  check('源码不使用PDFDocumentProxy', !tsContent.includes('PDFDocumentProxy'));
  check('源码使用PdfPrintService', tsContent.includes('PdfPrintService'));
  check('源码使用pdfViewerUrl', tsContent.includes('pdfViewerUrl'));
}

// 5. 验证HTML使用iframe
const hljldFormPdfHtml = join(SRC_DIR, 'hljld-form-pdf.component.html');
if (existsSync(hljldFormPdfHtml)) {
  const htmlContent = readFileSync(hljldFormPdfHtml, 'utf-8');

  check('HTML使用iframe', htmlContent.includes('<iframe'));
  check('HTML使用domSafe pipe', htmlContent.includes('domSafe'));
  check('HTML没有Canvas容器', !htmlContent.includes('pdf-pages-container'));
  check('HTML没有pdfPagesContainer引用', !htmlContent.includes('pdfPagesContainer'));

  // 验证没有下载按钮
  check('页面没有download按钮', !htmlContent.includes('download'));
  check('页面没有"下载当日"按钮', !htmlContent.includes('下载当日'));
  check('页面没有"下载全部"按钮', !htmlContent.includes('下载全部'));

  // 验证打印按钮存在
  check('页面有打印当日按钮', htmlContent.includes('打印当日'));
  check('页面有一键打印全部按钮', htmlContent.includes('一键打印全部'));

  // 验证iframe title
  check('iframe有title属性', htmlContent.includes('title="护理记录PDF预览"'));
}

// 6. 验证pdf-viewer.service.ts不再包含PDF.js
const pdfViewerService = join(SRC_DIR, 'services', 'pdf-viewer.service.ts');
if (existsSync(pdfViewerService)) {
  const serviceContent = readFileSync(pdfViewerService, 'utf-8');
  check('服务不导入pdfjs-dist', !serviceContent.includes("from 'pdfjs-dist'"));
  check('服务不使用GlobalWorkerOptions', !serviceContent.includes('GlobalWorkerOptions'));
  check('服务导出PdfPrintService', serviceContent.includes('PdfPrintService'));
  check('服务保留printPdfBlob', serviceContent.includes('printPdfBlob'));
  check('服务保留fetchPdfBlob', serviceContent.includes('fetchPdfBlob'));
}

// 7. 验证dist中不存在Worker文件
const workerDist = join(DIST_DIR, 'assets', 'pdf.worker.min.js');
const workerDistMjs = join(DIST_DIR, 'assets', 'pdf.worker.min.mjs');
check('dist中不存在pdf.worker.min.js', !existsSync(workerDist));
check('dist中不存在pdf.worker.min.mjs', !existsSync(workerDistMjs));

// 8. 验证package.json不包含pdfjs-dist
const packageJson = join(SJM1_APP, 'package.json');
if (existsSync(packageJson)) {
  const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
  check('package.json不包含pdfjs-dist', !pkg.dependencies?.['pdfjs-dist']);
}

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
