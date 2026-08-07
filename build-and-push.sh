#!/bin/bash

# 前端编译 + Java打包 + Git提交推送 一键脚本
# 使用方法: ./build-and-push.sh "提交说明"

set -e

COMMIT_MSG=${1:-"chore: 前端重新编译并同步到Java静态资源"}

echo "=== 步骤1: 编译Angular前端 ==="
cd sjm1-app
npm run build
cd ..

echo ""
echo "=== 步骤2: 同步构建产物到Java静态资源 ==="
rm -rf src/main/resources/static/form
mkdir -p src/main/resources/static/form
cp -r sjm1-app/dist/sjm1-app/browser/* src/main/resources/static/form/
echo "已同步: index.html, main-*.js, polyfills-*.js, styles-*.css"

echo ""
echo "=== 步骤3: Maven打包 ==="
mvn clean package -DskipTests

echo ""
echo "=== 步骤4: 验证JAR包 ==="
MAIN_JS=$(unzip -p target/backend-from-0.0.1.jar BOOT-INF/classes/static/form/index.html 2>/dev/null | grep -o 'main-[A-Z0-9]*\.js' | head -1)
if [ -f "sjm1-app/dist/sjm1-app/browser/$MAIN_JS" ]; then
    echo "✓ JAR中的 $MAIN_JS 与构建产物一致"
else
    echo "✗ 验证失败: JAR中的main-*.js文件不匹配"
    exit 1
fi

echo ""
echo "=== 步骤5: Git提交推送 ==="
git add -A
git commit -m "$COMMIT_MSG"
git push origin master

echo ""
echo "=== 构建完成 ==="
echo "提交: $(git log --oneline -1)"
echo "JAR包: target/backend-from-0.0.1.jar"
echo "大小: $(ls -lh target/backend-from-0.0.1.jar | awk '{print $5}')"
echo "SHA-256: $(sha256sum target/backend-from-0.0.1.jar | cut -d' ' -f1 | head -c 16)..."
