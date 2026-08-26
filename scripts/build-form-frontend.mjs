#!/usr/bin/env node

/**
 * 护理表单前端自动化构建脚本
 *
 * 功能：
 * 1. 获取当前 Git 短 SHA
 * 2. 生成 public/build-info.json
 * 3. 从node_modules复制Worker为.js格式
 * 4. 执行 Angular production build
 * 5. 清理 src/main/resources/static/form/ 旧产物
 * 6. 将 dist/sjm1-app/browser/ 全量复制到 static/form/
 * 7. 验证所有文件完整性
 * 8. 输出构建信息
 *
 * 使用方式：
 *   node scripts/build-form-frontend.mjs
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SJM1_APP = join(ROOT, 'sjm1-app');
const DIST_DIR = join(SJM1_APP, 'dist', 'sjm1-app', 'browser');
const PUBLIC_DIR = join(SJM1_APP, 'public');
const STATIC_FORM = join(ROOT, 'src', 'main', 'resources', 'static', 'form');
const BUILD_INFO_PATH = join(PUBLIC_DIR, 'build-info.json');

// Worker文件路径
const WORKER_NODE_MODULES = join(SJM1_APP, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const WORKER_PUBLIC = join(PUBLIC_DIR, 'assets', 'pdf.worker.min.js');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function calculateSha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function getPdfjsVersion() {
  try {
    const packageJson = join(SJM1_APP, 'node_modules', 'pdfjs-dist', 'package.json');
    if (existsSync(packageJson)) {
      const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
      return pkg.version;
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

// 1. 获取 Git SHA
const gitSha = getGitSha();
const buildTime = new Date().toISOString();
console.log(`\n=== 构建信息 ===`);
console.log(`Git SHA: ${gitSha}`);
console.log(`Build Time: ${buildTime}`);

// 2. 生成 build-info.json
if (!existsSync(PUBLIC_DIR)) {
  mkdirSync(PUBLIC_DIR, { recursive: true });
}
const buildInfo = {
  gitCommit: gitSha,
  buildTime: buildTime,
  app: 'sjm1-app'
};
writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2) + '\n');
console.log(`build-info.json 已生成: ${BUILD_INFO_PATH}`);

// 3. 清理旧 dist
const distPath = join(SJM1_APP, 'dist');
if (existsSync(distPath)) {
  rmSync(distPath, { recursive: true, force: true });
  console.log(`已清理旧 dist 目录`);
}

// 4. 从node_modules复制Worker文件为.js格式
console.log(`\n=== Worker文件处理 ===`);
const pdfjsVersion = getPdfjsVersion();
console.log(`pdfjs-dist版本: ${pdfjsVersion}`);

if (!existsSync(WORKER_NODE_MODULES)) {
  console.error(`Worker源文件不存在: ${WORKER_NODE_MODULES}`);
  console.error(`请先运行: cd sjm1-app && npm install`);
  process.exit(1);
}

const workerSrcSize = readFileSync(WORKER_NODE_MODULES).length;
const workerSrcSha256 = calculateSha256(WORKER_NODE_MODULES);
console.log(`Worker源文件: ${WORKER_NODE_MODULES}`);
console.log(`Worker源文件大小: ${workerSrcSize} bytes`);
console.log(`Worker源文件SHA-256: ${workerSrcSha256}`);

// 确保目标目录存在
const workerDir = join(PUBLIC_DIR, 'assets');
if (!existsSync(workerDir)) {
  mkdirSync(workerDir, { recursive: true });
}

// 复制Worker文件
cpSync(WORKER_NODE_MODULES, WORKER_PUBLIC);
console.log(`已复制Worker到: ${WORKER_PUBLIC}`);

// 验证复制结果
if (!existsSync(WORKER_PUBLIC)) {
  console.error(`Worker目标文件不存在: ${WORKER_PUBLIC}`);
  process.exit(1);
}

const workerTargetSize = readFileSync(WORKER_PUBLIC).length;
const workerTargetSha256 = calculateSha256(WORKER_PUBLIC);
console.log(`Worker目标文件大小: ${workerTargetSize} bytes`);
console.log(`Worker目标文件SHA-256: ${workerTargetSha256}`);

// 验证SHA-256一致
if (workerSrcSha256 !== workerTargetSha256) {
  console.error(`Worker文件SHA-256不一致!`);
  console.error(`源: ${workerSrcSha256}`);
  console.error(`目标: ${workerTargetSha256}`);
  process.exit(1);
}
console.log(`Worker文件SHA-256验证通过`);

// 5. 执行 Angular production build
console.log(`\n=== Angular 生产构建 ===`);
run('npm run build', { cwd: SJM1_APP });

// 6. 验证构建输出
if (!existsSync(DIST_DIR)) {
  console.error(`构建输出目录不存在: ${DIST_DIR}`);
  process.exit(1);
}

// 验证Worker进入dist
const workerDist = join(DIST_DIR, 'assets', 'pdf.worker.min.js');
if (!existsSync(workerDist)) {
  console.error(`构建后Worker文件不存在: ${workerDist}`);
  process.exit(1);
}
const workerDistSize = readFileSync(workerDist).length;
const workerDistSha256 = calculateSha256(workerDist);
console.log(`构建后Worker文件验证通过: ${workerDist}`);
console.log(`  大小: ${workerDistSize} bytes`);
console.log(`  SHA-256: ${workerDistSha256}`);

if (workerDistSha256 !== workerSrcSha256) {
  console.error(`构建后Worker文件SHA-256不一致!`);
  process.exit(1);
}

const indexHtml = join(DIST_DIR, 'index.html');
if (!existsSync(indexHtml)) {
  console.error(`index.html 不存在: ${indexHtml}`);
  process.exit(1);
}

const indexContent = readFileSync(indexHtml, 'utf-8');
const mainMatch = indexContent.match(/main-[A-Za-z0-9_-]+\.js/);
if (!mainMatch) {
  console.error(`index.html 中未找到 main-*.js 引用`);
  process.exit(1);
}
const mainFile = mainMatch[0];
console.log(`index.html 引用: ${mainFile}`);

// 7. 验证 main 文件存在
const mainPath = join(DIST_DIR, mainFile);
if (!existsSync(mainPath)) {
  console.error(`main 文件不存在: ${mainPath}`);
  process.exit(1);
}
console.log(`main 文件验证通过: ${mainFile}`);

// 8. 清理 static/form 旧产物
if (existsSync(STATIC_FORM)) {
  rmSync(STATIC_FORM, { recursive: true, force: true });
  console.log(`已清理旧 static/form 目录`);
}

// 9. 复制构建产物到 static/form
cpSync(DIST_DIR, STATIC_FORM, { recursive: true });
console.log(`已复制到: ${STATIC_FORM}`);

// 10. 验证复制结果
const formIndex = join(STATIC_FORM, 'index.html');
const formIndexContent = readFileSync(formIndex, 'utf-8');
const formMainMatch = formIndexContent.match(/main-[A-Za-z0-9_-]+\.js/);
if (!formMainMatch) {
  console.error(`复制后 static/form/index.html 中未找到 main-*.js`);
  process.exit(1);
}

const formMainPath = join(STATIC_FORM, formMainMatch[0]);
if (!existsSync(formMainPath)) {
  console.error(`复制后 main 文件不存在: ${formMainPath}`);
  process.exit(1);
}

// 验证Worker进入static/form
const workerForm = join(STATIC_FORM, 'assets', 'pdf.worker.min.js');
if (!existsSync(workerForm)) {
  console.error(`复制后Worker文件不存在: ${workerForm}`);
  process.exit(1);
}
const workerFormSize = readFileSync(workerForm).length;
const workerFormSha256 = calculateSha256(workerForm);
if (workerFormSize === 0) {
  console.error(`复制后Worker文件为空: ${workerForm}`);
  process.exit(1);
}

if (workerFormSha256 !== workerSrcSha256) {
  console.error(`复制后Worker文件SHA-256不一致!`);
  process.exit(1);
}

console.log(`复制后Worker文件验证通过: ${workerForm}`);
console.log(`  大小: ${workerFormSize} bytes`);
console.log(`  SHA-256: ${workerFormSha256}`);

// 11. 输出结果
console.log(`\n=== 构建完成 ===`);
console.log(`Git SHA:        ${gitSha}`);
console.log(`Build Time:     ${buildTime}`);
console.log(`Main File:      ${formMainMatch[0]}`);
console.log(`Worker版本:     ${pdfjsVersion}`);
console.log(`Worker Source:  ${WORKER_NODE_MODULES} (${workerSrcSize} bytes)`);
console.log(`Worker Dist:    ${workerDist} (${workerDistSize} bytes)`);
console.log(`Worker Form:    ${workerForm} (${workerFormSize} bytes)`);
console.log(`Worker SHA-256: ${workerSrcSha256}`);
console.log(`Target Dir:     ${STATIC_FORM}`);
console.log(`Build Info:     ${join(STATIC_FORM, 'build-info.json')}`);

// 列出 static/form 内容
console.log(`\nstatic/form 内容:`);
const files = readdirSync(STATIC_FORM, { withFileTypes: true });
for (const f of files) {
  if (f.isDirectory()) {
    console.log(`  [dir]  ${f.name}/`);
  } else {
    console.log(`  ${f.name}`);
  }
}
