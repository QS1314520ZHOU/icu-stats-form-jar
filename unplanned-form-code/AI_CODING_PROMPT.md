# AI 编码提示词：新增“非计划拔管风险评估及护理措施记录单”

你正在修改仓库：`QS1314520ZHOU/icu-stats-form-jar`，默认分支 `master`。

## 目标

在现有 Angular 表单系统中新增“重钢总医院非计划拔管风险评估及护理措施记录单”，访问路径为：

`/form/unPlannedCGZYYForm`

实现方式参照现有 `/form/toleranceForm`（`ToleranceScoreComponent`）的数据加载、患者切换、账号签名回填、分页、屏幕缩放和打印逻辑；护理措施勾选逻辑参照现有评分表组件中 `nurseMeasureList` 的处理方式。表单视觉结构必须尽量复刻所提供的两页 PDF：A4 横向、第一页为风险评分主体、第二页为导管固定续项+总分/危险程度+护理措施+护士签名。

## 开工前必须阅读

1. 根目录 `CLAUDE.md`
2. 根目录 `FORM_CATALOG.md`
3. `sjm1-app/src/app/tolerance-score.component.ts`
4. `sjm1-app/src/app/patient-fall-danger.component.ts`
5. `sjm1-app/src/app/app.routes.ts`
6. `sjm1-app/src/app/app.module.ts`
7. `sjm1-app/src/app/form-date.util.ts`
8. `sjm1-app/src/app/services/host-patient.service.ts`

不要递归通读整个仓库，不要修改无关文件。

## 数据接口

查询接口：

`GET /api/v1/icu/score/listByPid?pid={pid}&scoreType=unPlannedCGZYYScore`

只显示满足以下条件的记录：

- `valid === true`
- `scoreType === "unPlannedCGZYYScore"`
- `time` 非空

按 `time` 升序排列。

医院名称：

`GET /api/v1/config/hospital`

签名账号回填：

`GET /api/v1/icu/accounts/listByIds?ids=id1,id2,...`

患者信息必须来自现有 `HostPatientService.patient$`，禁止硬编码患者数据。

## 数据结构与字段映射

示例 Score 记录：

```json
{
  "pid": "...",
  "time": "2026-08-14T02:00:00.000Z",
  "scoreType": "unPlannedCGZYYScore",
  "total": 11,
  "conclusion": "高危",
  "valid": true,
  "inputUserId": "...",
  "inputUser": "工程师",
  "nurseMeasureList": [{ "code": "...", "value": true }],
  "unPlannedCGZYYScore": {
    "rass": 0,
    "noRass": 2,
    "noRassIndexList": [3],
    "ssd": 2,
    "gthz": 1,
    "xwhz": 2,
    "dgsl": 2,
    "dggd": 2
  }
}
```

映射规则：

- `rass`：在“实施镇静剂的患者”中，对应分值行打 `√`。
- `noRass`：在“未实施镇静或不适宜用 RASS 评分患者”中打 `√`。
- `noRassIndexList` 是零基行索引，应优先使用，以区分多个同为 3 分的选项；示例 `[3]` 对应第 4 行“嗜睡或昏睡或痴呆”（2 分）。
- 兼容旧数据：如果没有 `noRassIndexList`，可用 `noRass` 分值回退，但同分值只能勾选第一条，不能把全部 3 分行都勾上。
- `ssd`：舒适度对应分值行打 `√`。
- `gthz`：沟通合作对应分值行打 `√`。
- `xwhz`：行为合作对应分值行打 `√`。
- `dgsl`：导管数量对应分值行打 `√`。
- `dggd`：导管固定对应分值行打 `√`。
- `total`：评估总分。
- `conclusion`：危险程度。
- `inputUserId` 优先通过账号接口回填 `trueName`，失败时使用 `inputUser`。

## 护理措施映射

PDF 共 19 条护理措施，顺序固定：

- 妥善固定：索引 0～4，共 5 条
- 患者管理：索引 5～7，共 3 条
- 镇静镇痛管理：索引 8～10，共 3 条
- 谵妄管理：索引 11～12，共 2 条
- 身体约束管理：索引 13～17，共 5 条
- 尽早拔管：索引 18，共 1 条

对每个评估列，若 `nurseMeasureList[index].value === true`，在对应护理措施行打 `√`。不得依赖乱码化/拼音化 `code` 的可读文本；现有数据的数组顺序与 PDF 条目顺序一致。

## PDF 版式要求

### 第一页

- 标题：`{hospitalName}非计划拔管风险评估及护理措施记录单`
- 患者信息：科室、姓名、床号、住院号、性别、年龄、诊断。
- 表头固定列：项目名称、具体评估细则（两列）、分值。
- 右侧最多 6 个评估日期列，每列显示日期和时间。
- 评分项目：
  - 神志意识及精神状态
    - 实施镇静剂的患者：RASS -5~-3=0，-2~0=1，1~2=2，3~4=3
    - 未实施镇静或不适宜用 RASS：6 条，分值依次 0、3、3、2、3、3
  - 舒适度：0、1、2、3
  - 沟通合作：0、1、3
  - 行为合作：0、1、2
  - 导管数量：1、2
  - 导管固定第一页仅显示“使用胶布或贴膜固定或系带固定”=3
- 页底显示 PDF 中完整备注及页码。

### 第二页

- 表格宽度和评估日期列必须与第一页严格对齐。
- 顶部续接导管固定：2 分、1 分两行。
- 显示评估总分、危险程度。
- 显示 19 条护理措施及逐列 `√`。
- 显示护士签名。
- 页底显示同一备注及页码。

### 多记录分页

- 每组最多 6 条评估记录。
- 每组生成 2 张物理页（评分页+护理措施页）。
- 7～12 条记录生成第 3、4 页，以此类推。
- 无数据时仍渲染一组两页空表。
- 工具栏支持“全部/指定物理页”打印。

## 代码要求

新增：

`sjm1-app/src/app/unplanned-extubation.component.ts`

修改：

- `sjm1-app/src/app/app.routes.ts`
- `sjm1-app/src/app/app.module.ts`
- `FORM_CATALOG.md`

组件名：`UnplannedExtubationComponent`

selector：`app-unplanned-extubation`

路由：

```ts
{ path: 'unPlannedCGZYYForm', component: UnplannedExtubationComponent }
```

必须：

- 使用 `formatShanghaiDate`、`formatShanghaiTime`、`databaseTimeValue`。
- 使用 `takeUntil` 正确清理订阅。
- 患者切换时清空上一位患者的列、分页、年龄、诊断和选中页。
- 使用 A4 landscape 打印，打印前恢复 `zoom:1`。
- 打印窗口被拦截时给出提示。
- 不新增后端接口，不修改 MongoDB 字段。
- 不提交真实患者数据或凭据。

## 验收样例

给定：

```json
{
  "total": 11,
  "conclusion": "高危",
  "unPlannedCGZYYScore": {
    "noRass": 2,
    "noRassIndexList": [3],
    "ssd": 2,
    "gthz": 1,
    "xwhz": 2,
    "dgsl": 2,
    "dggd": 2
  }
}
```

必须得到：

- 未实施镇静分组第 4 行“嗜睡或昏睡或痴呆”打 `√`。
- 舒适度 2 分、沟通合作 1 分、行为合作 2 分、导管数量 2 分、导管固定 2 分分别打 `√`。
- 总分显示 11，危险程度显示“高危”。
- 所有 `nurseMeasureList.value === true` 的对应护理措施打 `√`。

## 验证步骤

1. 运行 Angular 构建：

```bash
cd sjm1-app
npm run build
```

2. 手动验证 `/form/unPlannedCGZYYForm`：
   - 患者切换无残留。
   - 评分勾选正确。
   - 护理措施勾选正确。
   - 6列、7列、空数据分页正确。
   - 第一页和第二页列线对齐。
   - 打印预览为 A4 横向，无截断、重叠、横向溢出。

3. 由于修改了 `sjm1-app/src/**`，按仓库规则执行：

```bash
./build-jar.sh
```

不得仅执行 `mvn clean package`。必须同步提交新的 `src/main/resources/static/form/*` 哈希构建产物，并删除不再被 `index.html` 引用的旧哈希文件。

4. 最后报告：修改文件、构建结果、打印检查结果、未执行项。
