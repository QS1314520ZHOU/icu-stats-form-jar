#!/bin/bash

# 前端编译 + Java打包 + Git提交推送 一键脚本
# 使用方法: ./build-and-push.sh "提交说明"
#   不传参数时自动根据改动文件生成提交说明

set -e

# ============================================================
# 工具路径配置（避免每次搜索）
# ============================================================
export PATH="/d/Program Files/nodejs:/c/nodejs/node_global:$PATH"
NODE="D:/Program Files/nodejs/node.exe"
NPM="D:/Program Files/nodejs/npm.cmd"
MVN="F:/maven/apache-maven-3.6.0-bin/apache-maven-3.6.0/bin/mvn.cmd"
GIT="F:/Git/Git/cmd/git.exe"

# ============================================================
# 自动生成提交说明（用户未手动指定时）
# ============================================================
auto_commit_msg() {
    local msg_parts=()

    # 检查 Java 后端改动
    local java_files=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.java$' || true)
    if [ -n "$java_files" ]; then
        # 提取 Controller / Service / Entity 名称
        local controllers=$(echo "$java_files" | grep -oP '(?<=/)[A-Z][a-zA-Z]+(?=Controller)' | sort -u | tr '\n' '、' | sed 's/、$//')
        local services=$(echo "$java_files" | grep -oP '(?<=/)[A-Z][a-zA-Z]+(?=Service)' | sort -u | tr '\n' '、' | sed 's/、$//')
        local entities=$(echo "$java_files" | grep -oP '(?<=/)[A-Z][a-zA-Z]+(?=\.java)' | grep -v 'Controller\|Service\|Config\|Exception' | sort -u | tr '\n' '、' | sed 's/、$//')

        [ -n "$controllers" ] && msg_parts+=("后端: ${controllers}")
        [ -n "$services" ] && msg_parts+=("服务: ${services}")
        [ -n "$entities" ] && msg_parts+=("实体: ${entities}")

        # 检查 pom.xml
        if echo "$java_files" | grep -q 'pom.xml'; then
            msg_parts+=("pom依赖变更")
        fi
    fi

    # 检查 Angular 前端改动
    local ts_files=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.ts$' | grep 'sjm1-app/src/app/' || true)
    if [ -n "$ts_files" ]; then
        local components=$(echo "$ts_files" | grep -oP '[a-z-]+(?=\.component\.(ts|html|css))' | sort -u | tr '\n' '、' | sed 's/、$//')
        local pipes=$(echo "$ts_files" | grep -oP '[a-z-]+(?=\.pipe\.ts)' | sort -u | tr '\n' '、' | sed 's/、$//')
        local services_fe=$(echo "$ts_files" | grep -oP '[a-z-]+(?=\.service\.ts)' | grep -v 'host-patient\|hljld-form' | sort -u | tr '\n' '、' | sed 's/、$//')
        local models=$(echo "$ts_files" | grep -oP '[a-z-]+(?=\.model\.ts)' | sort -u | tr '\n' '、' | sed 's/、$//')
        local routes=$(echo "$ts_files" | grep -q 'app.routes\|app.module' && echo "路由" || true)

        [ -n "$components" ] && msg_parts+=("组件: ${components}")
        [ -n "$pipes" ] && msg_parts+=("管道: ${pipes}")
        [ -n "$services_fe" ] && msg_parts+=("前端服务: ${services_fe}")
        [ -n "$models" ] && msg_parts+=("模型: ${models}")
        [ -n "$routes" ] && msg_parts+=("路由配置")
    fi

    # 检查其他重要文件
    local other_files=$(git diff --name-only HEAD 2>/dev/null | grep -vE '\.(java|ts|html|css|js|json|map)$' | grep -v 'target/' | grep -v 'dist/' | grep -v 'node_modules/' || true)
    if [ -n "$other_files" ]; then
        local docs=$(echo "$other_files" | grep -E '\.md$' | wc -l)
        local configs=$(echo "$other_files" | grep -E '\.(yml|yaml|properties|xml)$' | wc -l)
        [ "$docs" -gt 0 ] && msg_parts+=("文档更新")
        [ "$configs" -gt 0 ] && msg_parts+=("配置更新")
    fi

    # 组装最终提交信息
    if [ ${#msg_parts[@]} -eq 0 ]; then
        echo "chore: 前端重新编译并同步到Java静态资源"
    else
        echo "chore: $(IFS='，'; echo "${msg_parts[*]}")"
    fi
}

if [ -n "$1" ]; then
    COMMIT_MSG="$1"
else
    COMMIT_MSG=$(auto_commit_msg)
fi

echo "提交说明: $COMMIT_MSG"

echo "=== 步骤1: 编译Angular前端 ==="
cd sjm1-app
$NODE node_modules/@angular/cli/bin/ng.js build
cd ..

echo ""
echo "=== 步骤2: 同步构建产物到Java静态资源 ==="
rm -rf src/main/resources/static/form
mkdir -p src/main/resources/static/form
cp -r sjm1-app/dist/sjm1-app/browser/* src/main/resources/static/form/
echo "已同步: index.html, main-*.js, polyfills-*.js, styles-*.css"

echo ""
echo "=== 步骤3: Maven打包 ==="
$MVN clean package -DskipTests

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
$GIT add -A
$GIT commit -m "$COMMIT_MSG"
$GIT push origin master

echo ""
echo "=== 构建完成 ==="
echo "提交: $($GIT log --oneline -1)"
echo "JAR包: target/backend-from-0.0.1.jar"
echo "大小: $(ls -lh target/backend-from-0.0.1.jar | awk '{print $5}')"
echo "SHA-256: $(sha256sum target/backend-from-0.0.1.jar | cut -d' ' -f1 | head -c 16)..."
