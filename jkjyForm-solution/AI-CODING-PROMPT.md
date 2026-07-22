# AI 编码提示词

你是一名资深 Angular + Spring Boot + MongoDB 工程师。请在仓库 `QS1314520ZHOU/icu-stats-form-jar` 中实现“重钢总医院重症医学科健康教育实施、评价记录表”。

## 必须先阅读并复用

1. `CLAUDE.md`
2. `sjm1-app/src/app/app.routes.ts`、`app.module.ts`
3. `services/host-patient.service.ts`、`models/smartcare-host-message.model.ts`
4. `patient-fall-danger.component.ts`、`form-print.util.ts`
5. 后端现有 Controller/Entity/Repository/Service 的命名和 MongoDB 规范

## 页面与排版

- Angular 内部路由必须为 `/jkjyForm`；单 JAR 访问地址为 `/form/jkjyForm`。
- 表单内容与提供的 PDF 一致，A4 纵向；标题、患者信息、分类合并单元格、宣教时间列、宣教对象、评价、护士签名、贵重物品和联系电话均需保留。
- 患者信息只来自 HostPatientService，禁止硬编码、禁止在本集合重复保存。
- 每页最多 5 条评估记录；每条记录对应 PDF 的一个“宣教时间”列；多于 5 条自动分页。
- 屏幕端可缩放适配 iframe；打印时隐藏工具栏和弹框，输出 A4 portrait。

## 工具栏交互

- 增加“新增”“编辑”“打印”按钮。
- 新增：打开录入弹框，展示全部宣教项目并允许多选；评估时间默认浏览器当前本地时间且可修改；护士签名默认 SmartCare 当前账号 `account.trueName`，可从账号列表或文本修改；评估时间和护士签名必填。
- 编辑：先打开记录列表弹框，列出序号、时间、评估人，并提供编辑和删除。
- 编辑记录：关闭列表弹框，打开与新增相同的弹框，完整回填记录，保存时更新原记录。
- 删除：二次确认，只把 `valid` 修改为 `false`，不物理删除；刷新列表和表单。
- 所有请求要有 loading、防重复提交、错误提示；切换患者时清空旧患者状态并取消旧请求。

## 数据模型

创建 MongoDB 文档 `HealthEducationRecord`，集合 `healthEducationRecord`。字段：
`id,pid,assessmentTime,itemCodes,educationTarget,evaluationCodes,nurseId,nurseName,specialMedicationOther,externalExamOther,internalExamOther,otherEducation,valuableCodes,valuableOther,receiverConfirmed,receiverName,receivedAt,valid,createdAt,createdBy,updatedAt,updatedBy`。

创建复合索引 `{pid:1,valid:1,assessmentTime:1}`。保存时后端再次校验 pid、assessmentTime、nurseName；更新时禁止修改 pid；删除接口逻辑删除。

## API

- `GET /api/v1/icu/health-education/listByPid?pid=...`
- `POST /api/v1/icu/health-education/save`
- `PATCH /api/v1/icu/health-education/{id}/invalidate?operatorId=...`

## 验收标准

1. `npm run build` 与 `mvn test` 通过。
2. 新增默认时间和当前护士正确，时间和签名必填。
3. 编辑能完整回填并更新；删除后数据库记录仍在且 `valid=false`，页面不再展示。
4. 切换患者不串数据。
5. PDF 所有固定文案与选项可见，打印无工具栏、无滚动条、无裁切。
6. 至少补充 service/controller 单元测试和前端核心交互测试。
