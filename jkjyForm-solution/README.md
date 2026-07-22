# 健康教育实施、评价记录表（/jkjyForm）实现方案

适配项目：`QS1314520ZHOU/icu-stats-form-jar`

## 路径约定

- Angular 路由：`/jkjyForm`
- 单 JAR 实际访问路径：`/form/jkjyForm`（项目静态前端统一挂在 `/form/**`）
- API 前缀：`/api/v1/icu/health-education`

## 文件落位

- `frontend/health-education.component.ts|html|css` → `sjm1-app/src/app/`
- 将 `frontend/app.routes.patch.ts` 中路由合并到 `app.routes.ts`
- 将 `frontend/app.module.patch.ts` 中声明合并到 `app.module.ts`
- `backend/*.java` 按文件首行 package 放到 Spring Boot 对应目录

## 数据设计

MongoDB 集合：`healthEducationRecord`

每一条有效记录代表 PDF 中一个“宣教时间”列；前端每页最多展示 5 条记录。患者基本信息不重复保存，始终来自 SmartCare `postMessage`。

关键字段：

- `pid`：患者 ID，必填、建索引
- `assessmentTime`：宣教/评估时间，ISO-8601，必填
- `itemCodes`：选中的宣教项目编码集合
- `educationTarget`：`A` 家属、`B` 病人、`AB` 两者
- `evaluationCodes`：`A/B/C/D` 多选（能复述/能解释/能模仿/能操作）
- `nurseId`、`nurseName`：护士账号与签名；新增默认当前账号，允许修改
- `specialMedicationOther`、`externalExamOther`、`internalExamOther`、`otherEducation`：其它说明
- `valuableCodes`、`valuableOther`、`receiverConfirmed`、`receiverName`、`receivedAt`：贵重物品交接
- `valid`：逻辑删除标记；删除时仅置 `false`
- `createdAt/createdBy/updatedAt/updatedBy`：审计字段

## API

- `GET /api/v1/icu/health-education/listByPid?pid=...`：仅返回 `valid=true`
- `POST /api/v1/icu/health-education/save`：新增或修改
- `PATCH /api/v1/icu/health-education/{id}/invalidate?operatorId=...`：逻辑删除

## 交互

- 工具栏“新增”：打开录入弹框；时间默认当前本地时间，护士默认宿主当前账号；时间、签名必填。
- 工具栏“编辑”：打开记录列表弹框；每行可“编辑”或“删除”。
- 编辑：复用新增弹框并回填完整记录。
- 删除：二次确认后调用 invalidate，后端将 `valid=false`。
- 打印：隐藏工具栏与弹框，A4 纵向；每页最多 5 条评估列。

## 注意

此代码以仓库当前 Angular NgModule、FormsModule、HttpClientModule 和 HostPatientService 结构编写。建议合并后执行 `npm run build` 与 `mvn test/package`。
