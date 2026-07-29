# CLAUDE.md

## 项目概览

`icu-stats-form-jar` 是重钢总医院重症医学科护理记录与评分表单系统。项目采用 Spring Boot 单体可执行 JAR 交付，并将 Angular 表单前端作为静态资源托管；部分 ICU 治疗记录页面由 SmartCare 宿主 SPA 提供，本仓库后端负责 REST API 与 MongoDB 持久化。

- 默认分支：`master`
- 后端：Java 11、Spring Boot 2.7.18、Spring Data MongoDB、Maven
- 前端：Angular 21.2、TypeScript 5.9、RxJS 7.8、Node.js 24+
- 数据库：MongoDB，默认业务库名为 `SmartCare`
- 集成方式：页面嵌入 SmartCare；通过 `postMessage` 接收患者上下文
- 交付方式：Spring Boot 可执行 JAR，内嵌/托管多个前端入口

## 工作原则

1. 修改前先给出 3～5 条简短计划。
2. 先用本文件和 `FORM_CATALOG.md` 定位入口，再读取相关文件。
3. 优先用 `rg` 搜索类名、组件名、接口路径和字段名。
4. 只读取任务涉及的文件及其直接依赖；默认不超过 8 个源代码文件。
5. 如确需读取超过 12 个源代码文件，先说明原因。
6. 不递归通读 `src/main/java` 或 `sjm1-app/src`，不重复读取本会话已查看的文件。
7. 大型 `*Record`、评分组件或表单组件只读取相关字段、方法和模板区段。
8. 不读取或修改 `target/`、`node_modules/`、构建产物、图片和二进制文件，除非任务明确要求。
9. 不提交真实账号、密码、令牌、MongoDB URI 或患者隐私数据。
10. 修改后执行与改动范围匹配的最小验证，并报告未执行的验证项。

禁止无目的执行：

```bash
find . -type f
ls -R
cat src/main/java/com/smartcare/backend/**/*.java
```

推荐定位方式：

```bash
rg "类名|组件名|/api/v1/icu" src/main/java sjm1-app/src/app
rg "path:" sjm1-app/src/app/app.routes.ts
rg "@RequestMapping|@GetMapping|@PostMapping|@PutMapping|@DeleteMapping" src/main/java/com/smartcare/backend/controller
```

## 仓库结构与入口

### 根目录

- `CLAUDE.md`：AI 开发约定与项目索引
- `FORM_CATALOG.md`：表单、路由、API、实体对应关系；新增表单时同步更新
- `pom.xml`：Spring Boot/Maven 依赖与打包配置
- `.env.example`：环境变量示例，不得写入真实凭据
- `sjm1-app/`：Angular 表单前端
- `src/main/java/com/smartcare/backend/`：Spring Boot 后端
- 根目录的 `app.ts`、`host-patient.service.ts`：历史或参考文件；实际前端入口以 `sjm1-app/src/app/` 为准，修改前先确认是否仍被使用

### 后端入口

- 应用入口：`src/main/java/com/smartcare/backend/BackendApplication.java`
- 配置：`src/main/java/com/smartcare/backend/config/`
  - `MultiFrontendWebConfig.java`：多前端静态资源与路由映射
  - `FrontendRedirectController.java`：前端入口重定向
  - `JacksonConfig.java`：JSON 序列化配置
  - `GlobalExceptionHandler.java`：全局异常处理
- 控制器：`src/main/java/com/smartcare/backend/controller/`
- MongoDB 文档：`src/main/java/com/smartcare/backend/entity/`
- Repository：优先通过控制器注入类型或 `rg "Repository"` 定位，不要全目录扫描

### 前端入口

- 启动：`sjm1-app/src/main.ts`
- 模块：`sjm1-app/src/app/app.module.ts`
- 路由：`sjm1-app/src/app/app.routes.ts`
- 根组件：`sjm1-app/src/app/app.ts`
- 宿主上下文：
  - `sjm1-app/src/app/services/host-patient.service.ts`
  - `sjm1-app/src/app/models/smartcare-host-message.model.ts`
- 共用工具：
  - `form-date.util.ts`
  - `form-measure.util.ts`
  - `form-print.util.ts`

## 当前表单路由

Angular 表单统一挂载在 `/form/<route>`。路由源文件为 `sjm1-app/src/app/app.routes.ts`。

| route | 组件 | 说明 |
|---|---|---|
| `sjm1` | `Sjm1VeinMaintenanceComponent` | 深静脉维护记录单（一） |
| `sjmCrrt` | `SjmCrrtVeinMaintenanceComponent` | 深静脉维护记录单（三）/透析导管 |
| `ydwzlForm` | `YdwzlTemperatureComponent` | 亚低温治疗体温记录单 |
| `toleranceForm` | `ToleranceScoreComponent` | 肠内营养耐受性评分 |
| `commitSuicideForm` | `CommitSuicideScoreComponent` | 自杀风险评估（NGASR） |
| `IADForm` | `IadScoreComponent` | IAD 评估记录 |
| `baetheiForm` | `BaetheiScoreComponent` | Barthel 日常生活能力评估 |
| `patientFallDangerForm` | `PatientFallDangerComponent` | 跌倒/坠床风险评估 |
| `jkjyForm` | `HealthEducationComponent` | 健康教育记录 |
| `wpgmForm` | `WpgmFormComponent` | 住院患者物品管理 |
| `ecmoForm` | `EcmoRecordComponent` | ECMO 运行护理记录 |
| `bradenForm` | `BradenFormComponent` | Braden 压疮风险评估 |
| `transfusionForm` | `TransfusionRecordComponent` | 输血记录 |
| `piccoForm` | `PiccoRecordComponent` | PiCCO 监测记录表单 |
| `iabpForm` | `IabpRecordComponent` | IABP 护理记录表单 |
| `crrtForm` | `CrrtRecordComponent` | CRRT 护理记录表单 |
| `crrtOrderForm` | `CrrtOrderFormComponent` | CRRT 治疗医嘱单 |

空路径重定向到 `sjm1`。新增、删除或重命名路由时，必须同步检查：

1. `app.routes.ts` 的 import 与 route。
2. `app.module.ts` 的声明/导入。
3. 对应组件、模板和样式文件。
4. `FORM_CATALOG.md`。
5. `MultiFrontendWebConfig.java` 与宿主访问路径（如涉及新的前端入口）。

## 后端业务索引

### 基础与宿主数据

- 账号/签名：`AccountController`、`AccountSignature`
- 科室：`DepartmentController`
- 床位配置：`ConfigBedController`
- 床旁数据：`BedsideController`、`Bedside`
- 患者：`PatientController`
- 医院配置：`HospitalConfigController`

### ICU 治疗记录

- CRRT：`CrrtController` + `CrrtRecord`
- CRRT 医嘱：`CrrtOrderFormController` + `CrrtOrderFormRecord`
- CVC：`CvcController` + `CvcRecord`
- 呼吸治疗：`RmController` + `RmRecord`
- PiCCO：`PiccoController` + `PiccoRecord`
- PiCCO 表单扩展：`PiccoRecordExtraController` + `PiccoRecordExtra`
- IABP：`IabpController` + `IabpRecord`
- IABP 表单扩展：`IabpRecordExtraController` + `IabpRecordExtra`
- 血浆置换：`PeController` + `PeRecord`
- 血液灌流：`HpController` + `HpRecord`
- Protein A：`ProteinAController` + `ProteinARecord`
- ECMO 扩展：`EcmoExtraController` + `EcmoRecordExtra`
- 深静脉维护：`TubeExeController`、`Sjm1VeinExtraController` + `TubeExe`、`Sjm1VeinExtra`

### 护理、评分与扩展记录

- 通用评分：`ScoreController` + `Score`
- 跌倒风险扩展：`FallDangerFormExtraController` + `FallDangerFormExtra`
- 自理能力扩展：`SelfCareFormExtraController` + `SelfCareFormExtra`
- 亚低温扩展：`YdwzlFormExtraController` + `YdwzlFormExtra`
- 健康教育：`HealthEducationRecordController` + `HealthEducationRecord`
- 输血记录：`TransfusionRecordController` + `TransfusionRecord`、`TransfusionItem`、`TransfusionPage`

> 详细的“表单 → 路由 → API → 实体”映射以 `FORM_CATALOG.md` 为准。若目录与代码不一致，以代码为事实来源并同步修正文档。

## 关键业务约定

- 患者 ID 通常使用 `pid`，跨集合查询和保存时保持口径一致。
- 患者上下文来自 SmartCare 宿主的 `postMessage`，前端不得硬编码患者信息。
- 接收宿主消息统一走 `HostPatientService`；不要在每个组件重复注册全局 `message` 监听。
- 校验 `postMessage` 的消息结构；涉及部署域名时应配置并校验可信 `origin`，不要默认信任任意来源。
- MongoDB 集合名与字段名需兼容既有 SmartCare 数据，禁止随意重命名持久化字段。
- 日期、时间、单位换算和打印逻辑优先复用 `form-date.util.ts`、`form-measure.util.ts`、`form-print.util.ts`。
- `wpgmForm` 当前仅使用浏览器 `localStorage`，无后端持久化；不要误接入通用保存 API。
- Bedside 数据在 ECMO、亚低温等表单中主要作为只读来源，修改前确认接口语义。
- SmartCare 治疗记录系统的部分前端不在 `sjm1-app` 内；不要因为仓库内没有对应页面就删除其后端 API。

## 实现约定

### 新增或修改后端记录类型

1. 先确认是否已有可复用实体和 API。
2. 按现有模式维护 `Controller + Entity + Repository`，但不要机械复制无关字段。
3. API 路径保持 `/api/v1/icu/...` 风格。
4. 保持既有 MongoDB 集合名、字段名和 `pid` 查询方式兼容。
5. 输入校验、异常返回和 JSON 日期格式遵循现有全局配置。
6. 如前端直接调用，同步更新组件服务地址与 `FORM_CATALOG.md`。

### 新增或修改 Angular 表单

1. 优先复用宿主患者服务与公共日期、计量、打印工具。
2. 保持组件职责清晰；超大内联模板/样式应拆分为 `.html`、`.css`。
3. 路由名称需兼容宿主已有链接，重命名前先确认调用方。
4. 所有写操作必须处理保存中、成功、失败和重复提交状态。
5. 不在前端保存凭据或敏感患者数据；仅在明确业务需要时使用 `localStorage`。
6. 新表单同步更新 `app.routes.ts`、`app.module.ts`、`FORM_CATALOG.md` 和必要的后端索引。

## 构建与验证

### 后端

```bash
mvn test
mvn clean package
```

仅修改后端文档时无需构建。修改 Java 代码后至少运行相关测试或 `mvn test`；准备交付 JAR 时运行 `mvn clean package`。

### 前端

```bash
cd sjm1-app
npm install
npm run build
```

项目要求 Node.js 24+。仅修改单个组件时，至少执行 Angular 构建；涉及交互和打印布局时，还需手动验证对应 `/form/<route>` 页面。

### 最小回归检查

- Angular 路由能加载目标组件，无控制台错误。
- 宿主患者消息到达后，患者信息正确刷新。
- 查询、新建、编辑、保存、删除与重复提交行为符合预期。
- 日期/时间与单位显示正确。
- 打印页面无截断、重叠或缺失字段。
- 后端 API 与 MongoDB 既有数据兼容。
- 未提交 `.env`、真实凭据、患者数据、`target/` 或 `node_modules/`。

## 文档同步要求

以下变化必须更新本文件或 `FORM_CATALOG.md`：

- 新增/删除/重命名表单、路由、Controller、实体或 API。
- Angular、Java、Spring Boot、Node.js 的主版本变化。
- 宿主消息结构、患者标识或 MongoDB 集合/字段口径变化。
- 构建命令、环境变量或部署入口变化。
