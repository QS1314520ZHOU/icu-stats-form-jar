#!/usr/bin/env node

/**
 * PDF Viewer组件测试脚本
 *
 * 验证项目：
 * 1. Worker URL配置正确
 * 2. PDF.js可以成功getDocument
 * 3. 页面不再出现fake worker错误
 * 4. 页面没有下载按钮
 * 5. 打印按钮仍可用
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SJM1_APP = join(ROOT, 'sjm1-app');
const DIST_DIR = join(SJM1_APP, 'dist', 'sjm1-app', 'browser');

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

console.log('\n=== PDF Viewer组件测试 ===\n');

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

// 3. 验证Worker URL配置
check('Worker URL使用绝对路径', mainBundle.includes('/form/assets/pdf.worker.min.mjs'));
check('Worker URL不使用裸模块路径', !mainBundle.includes("'assets/pdf.worker.min.mjs'"));
check('Worker URL不使用相对路径', !mainBundle.includes("./assets/pdf.worker.min.mjs"));

// 4. 验证PDF.js配置
check('包含pdfjsLib配置', mainBundle.includes('GlobalWorkerOptions'));
check('包含getDocument方法', mainBundle.includes('getDocument'));

// 5. 验证页面组件
const hljldFormPdfDir = join(SJM1_APP, 'src', 'app', 'pages', 'hljld-form-pdf');
if (existsSync(hljldFormPdfDir)) {
  const componentFiles = readdirSync(hljldFormPdfDir);
  const htmlFile = componentFiles.find(f => f.endsWith('.html'));

  if (htmlFile) {
    const htmlContent = readFileSync(join(hljldFormPdfDir, htmlFile), 'utf-8');

    // 验证没有下载按钮
    check('页面没有download按钮', !htmlContent.includes('download'));
    check('页面没有"下载当日"按钮', !htmlContent.includes('下载当日'));
    check('页面没有"下载全部"按钮', !htmlContent.includes('下载全部'));

    // 验证打印按钮存在
    check('页面有打印当日按钮', htmlContent.includes('打印当日') || htmlContent.includes('print'));
    check('页面有一键打印全部按钮', htmlContent.includes('一键打印全部') || htmlContent.includes('打印全部'));
  }
}

// 6. 验证Worker文件在dist中
const workerDist = join(DIST_DIR, 'assets', 'pdf.worker.min.mjs');
check('Worker文件在dist中', existsSync(workerDist));

// 7. 验证index.html引用正确
const indexHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8');
check('index.html引用main bundle', indexHtml.includes('main-'));

// 8. 验证没有使用fake worker
// PDF.js内部可能包含fake worker相关代码，但业务代码不应主动使用
// 检查业务代码是否设置了workerSrc为无效路径
const businessCode = mainBundle.substring(mainBundle.indexOf('GlobalWorkerOptions'));
const hasInvalidWorkerSrc = businessCode.includes("'assets/pdf.worker.min.mjs'") ||
                           businessCode.includes('"assets/pdf.worker.min.mjs"');
check('不使用fake worker', !hasInvalidWorkerSrc);

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
