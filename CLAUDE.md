ICU 重症评分/记录表单与 SmartCare 采集系统（icu-stats-form-jar）。

一个以 Spring Boot 单体 JAR 交付、内嵌多个前端的 ICU 专项记录/评分表单系统。后端提供各类 ICU 治疗记录（CRRT、CVC、IABP、PICCO、血浆置换等）的 REST 接口与 MongoDB 持久化；前端表单（Angular）以 iframe 方式嵌入 SmartCare 宿主，通过 postMessage 接收病人上下文。

技术栈：

- 后端：Java、Spring Boot、Spring Data MongoDB、Maven（打包为可执行 JAR）
- 数据库：MongoDB（数据库名 SmartCare）
- 前端：Angular 12、TypeScript、RxJS（sjm1-app）
- 集成：iframe 嵌入 SmartCare 宿主 + postMessage 广播病人上下文
- 服务形态：单 JAR 内静态托管多前端（MultiFrontendWebConfig 多前端路由）

## Token 与文件读取规则

不要为了了解项目而扫描或读取整个仓库。

每次任务必须遵循：

1. 先根据下面的文件索引定位入口。
2. 只读取当前任务涉及的文件和直接依赖。
3. 优先使用 `rg` 搜索类名、函数名和 API 路径。
4. 不要递归读取整个 `src/main/java` 或 `sjm1-app/src`。
5. 不要重复读取当前会话中已经读取过的文件。
6. 默认最多读取 8 个源代码文件。
7. 如果确实需要读取超过 12 个文件，先说明原因。
8. 对大文件（如各类 *Record 实体）只读取相关字段/区段，不要每次读取完整文件。
9. 修改前先输出简短计划，不要先做全仓分析。
10. 不要读取构建产物（target/）、依赖目录（node_modules/）、图片和二进制文件。

禁止无目的的执行：

```bash
find . -type f
cat src/main/java/com/smartcare/backend/**/*.java
ls -R
```

## 文件索引（入口定位）

### 后端（Spring Boot）

- 应用入口：`src/main/java/com/smartcare/backend/BackendApplication.java`
- 全局配置 `src/main/java/com/smartcare/backend/config/`
  - `MultiFrontendWebConfig.java` —— 多前端静态资源与路由映射
  - `FrontendRedirectController.java` —— 前端页面重定向
  - `JacksonConfig.java` —— JSON 序列化配置
  - `GlobalExceptionHandler.java` —— 全局异常处理
- 控制器 `src/main/java/com/smartcare/backend/controller/`
  - 账号/科室/床位：`AccountController` `DepartmentController` `ConfigBedController` `HospitalConfigController` `PatientController`
  - ICU 治疗记录：`CrrtController` `CvcController` `HpController` `IabpController` `PeController` `PiccoController` `ProteinAController` `RmController` `Sjm1VeinExtraController` `TubeExeController`
- 实体（MongoDB 文档）`src/main/java/com/smartcare/backend/entity/`
  - `CrrtRecord` `CvcRecord` `HpRecord` `IabpRecord` `PeRecord` `PiccoRecord` `ProteinARecord` `RmRecord` `Sjm1VeinExtra` `TubeExe`
  - 账号：`entity/account/Account.java`

### 前端（Angular，sjm1-app）

- 启动/路由：`sjm1-app/src/main.ts`、`sjm1-app/src/app/app.module.ts`、`sjm1-app/src/app/app.routes.ts`、`sjm1-app/src/app/app.ts`
- 业务组件：
  - `sjm1-app/src/app/sjm1-vein-maintenance.component.ts`
  - `sjm1-app/src/app/sjm-crrt-vein-maintenance.component.ts`
- 宿主集成：
  - `sjm1-app/src/app/services/host-patient.service.ts` —— 接收 SmartCare postMessage 病人上下文
  - `sjm1-app/src/app/models/smartcare-host-message.model.ts` —— 宿主消息数据结构

### 配置与构建

- `pom.xml` —— Maven 依赖与打包配置
- `.env.example` —— MongoDB / 端口 / 医院名 环境变量样例
- `sjm1-app/package.json`、`sjm1-app/angular.json` —— 前端依赖与构建

## 关键约定

- 一类 ICU 记录 = 一个 Controller + 一个 Record 实体（例如 CRRT 对应 `CrrtController` + `CrrtRecord`）。新增记录类型时按此成对扩展。
- 病人上下文来自 SmartCare 宿主的 postMessage 广播，不要在前端硬编码病人信息；统一走 `host-patient.service.ts`。
- MongoDB 集合与字段口径需与宿主 SmartCare 保持一致（数据库名 SmartCare）。
- 环境相关配置从环境变量读取，参考 `.env.example`，不要提交真实凭据。
