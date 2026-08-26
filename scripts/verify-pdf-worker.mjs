#!/usr/bin/env node

/**
 * PDF Worker验证脚本
 *
 * 验证项目：
 * 1. Worker源文件存在且非空
 * 2. Worker进入dist目录
 * 3. Worker进入static/form目录
 * 4. Worker文件版本与pdfjs-dist匹配
 * 5. Worker URL配置正确
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SJM1_APP = join(ROOT, 'sjm1-app');
const PUBLIC_DIR = join(SJM1_APP, 'public');
const DIST_DIR = join(SJM1_APP, 'dist', 'sjm1-app', 'browser');
const STATIC_FORM = join(ROOT, 'src', 'main', 'resources', 'static', 'form');

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

console.log('\n=== PDF Worker验证 ===\n');

// 1. Worker源文件验证
const workerSrc = join(PUBLIC_DIR, 'assets', 'pdf.worker.min.mjs');
const workerSrcExists = existsSync(workerSrc);
check('Worker源文件存在', workerSrcExists, workerSrc);

if (workerSrcExists) {
  const workerSrcSize = readFileSync(workerSrc).length;
  check('Worker源文件非空', workerSrcSize > 0, `${workerSrcSize} bytes`);

  // 2. 检查是否与node_modules中的版本匹配
  const nodeModulesWorker = join(SJM1_APP, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
  if (existsSync(nodeModulesWorker)) {
    const nodeModulesSize = readFileSync(nodeModulesWorker).length;
    check('Worker版本与pdfjs-dist匹配', workerSrcSize === nodeModulesSize,
      `public: ${workerSrcSize}, node_modules: ${nodeModulesSize}`);
  } else {
    console.log('⚠ node_modules中未找到Worker文件（可能未安装依赖）');
  }
}

// 3. dist目录验证
const workerDist = join(DIST_DIR, 'assets', 'pdf.worker.min.mjs');
const workerDistExists = existsSync(workerDist);
check('Worker进入dist目录', workerDistExists, workerDist);

if (workerDistExists) {
  const workerDistSize = readFileSync(workerDist).length;
  check('dist中Worker非空', workerDistSize > 0, `${workerDistSize} bytes`);
}

// 4. static/form目录验证
const workerForm = join(STATIC_FORM, 'assets', 'pdf.worker.min.mjs');
const workerFormExists = existsSync(workerForm);
check('Worker进入static/form目录', workerFormExists, workerForm);

if (workerFormExists) {
  const workerFormSize = readFileSync(workerForm).length;
  check('static/form中Worker非空', workerFormSize > 0, `${workerFormSize} bytes`);
}

// 5. 验证main bundle中的Worker URL配置
if (workerDistExists) {
  const mainFiles = readdirSync(DIST_DIR).filter(f => f.startsWith('main-') && f.endsWith('.js'));
  if (mainFiles.length > 0) {
    const mainBundle = readFileSync(join(DIST_DIR, mainFiles[0]), 'utf-8');

    // 检查是否包含正确的Worker URL
    const hasCorrectUrl = mainBundle.includes('/form/assets/pdf.worker.min.mjs');
    check('main bundle包含正确的Worker URL', hasCorrectUrl);

    // 检查是否仍使用错误的裸模块路径
    const hasIncorrectUrl = mainBundle.includes("'assets/pdf.worker.min.mjs'") ||
                           mainBundle.includes('"assets/pdf.worker.min.mjs"');
    check('main bundle不包含裸模块路径', !hasIncorrectUrl);
  }
}

console.log(`\n=== 验证结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
