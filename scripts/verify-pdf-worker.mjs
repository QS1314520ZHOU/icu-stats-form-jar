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
 * 6. 所有Worker文件SHA-256一致
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
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

function calculateSha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

console.log('\n=== PDF Worker验证 ===\n');

// 1. Worker源文件验证（从node_modules）
const workerNodeModules = join(SJM1_APP, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const workerNodeModulesExists = existsSync(workerNodeModules);
check('Worker源文件存在(node_modules)', workerNodeModulesExists, workerNodeModules);

if (workerNodeModulesExists) {
  const workerNodeModulesSize = readFileSync(workerNodeModules).length;
  check('Worker源文件非空(node_modules)', workerNodeModulesSize > 0, `${workerNodeModulesSize} bytes`);
}

// 2. public目录Worker验证（.js格式）
const workerPublic = join(PUBLIC_DIR, 'assets', 'pdf.worker.min.js');
const workerPublicExists = existsSync(workerPublic);
check('Worker在public目录存在(.js)', workerPublicExists, workerPublic);

if (workerPublicExists) {
  const workerPublicSize = readFileSync(workerPublic).length;
  check('public中Worker非空', workerPublicSize > 0, `${workerPublicSize} bytes`);
}

// 3. dist目录验证
const workerDist = join(DIST_DIR, 'assets', 'pdf.worker.min.js');
const workerDistExists = existsSync(workerDist);
check('Worker进入dist目录', workerDistExists, workerDist);

if (workerDistExists) {
  const workerDistSize = readFileSync(workerDist).length;
  check('dist中Worker非空', workerDistSize > 0, `${workerDistSize} bytes`);
}

// 4. static/form目录验证
const workerForm = join(STATIC_FORM, 'assets', 'pdf.worker.min.js');
const workerFormExists = existsSync(workerForm);
check('Worker进入static/form目录', workerFormExists, workerForm);

if (workerFormExists) {
  const workerFormSize = readFileSync(workerForm).length;
  check('static/form中Worker非空', workerFormSize > 0, `${workerFormSize} bytes`);
}

// 5. SHA-256一致性验证
if (workerNodeModulesExists && workerPublicExists && workerDistExists && workerFormExists) {
  const shaNodeModules = calculateSha256(workerNodeModules);
  const shaPublic = calculateSha256(workerPublic);
  const shaDist = calculateSha256(workerDist);
  const shaForm = calculateSha256(workerForm);

  console.log(`\nSHA-256验证:`);
  console.log(`  node_modules: ${shaNodeModules}`);
  console.log(`  public:       ${shaPublic}`);
  console.log(`  dist:         ${shaDist}`);
  console.log(`  static/form:  ${shaForm}`);

  check('node_modules与public SHA-256一致', shaNodeModules === shaPublic);
  check('node_modules与dist SHA-256一致', shaNodeModules === shaDist);
  check('node_modules与static/form SHA-256一致', shaNodeModules === shaForm);
}

// 6. 验证main bundle中的Worker URL配置
if (workerDistExists) {
  const mainFiles = readdirSync(DIST_DIR).filter(f => f.startsWith('main-') && f.endsWith('.js'));
  if (mainFiles.length > 0) {
    const mainBundle = readFileSync(join(DIST_DIR, mainFiles[0]), 'utf-8');

    // 检查是否包含正确的Worker URL
    const hasCorrectUrl = mainBundle.includes('/form/assets/pdf.worker.min.js');
    check('main bundle包含正确的Worker URL(.js)', hasCorrectUrl);

    // 检查是否仍使用错误的.mjs路径
    const hasMjsPath = mainBundle.includes('/form/assets/pdf.worker.min.mjs') ||
                      mainBundle.includes("'assets/pdf.worker.min.mjs'") ||
                      mainBundle.includes('"assets/pdf.worker.min.mjs"');
    check('main bundle不包含.mjs路径', !hasMjsPath);
  }
}

console.log(`\n=== 验证结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
