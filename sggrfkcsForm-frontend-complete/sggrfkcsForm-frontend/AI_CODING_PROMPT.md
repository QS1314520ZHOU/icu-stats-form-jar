# AI 编码提示词

请在 `QS1314520ZHOU/icu-stats-form-jar` 中新增 `SggrfkcsFormComponent`，Angular 子路由为 `sggrfkcsForm`，最终地址 `/form/sggrfkcsForm`。实现方式必须参考 `health-education.component.ts/html/css`：订阅 `HostPatientService.patient$` 与 `account$`；患者切换后清空旧状态并通过 `switchMap` 重新查询；使用 `IcuFormViewerContextService`，`viewer=1` 隐藏操作栏；护士从 `/api/v1/icu/accounts` 检索确认；使用 REST 查询、保存、逻辑删除；复用 `app-print-page-multi-select`、`normalizePrintPages`、`shouldPrintPage`；打印时克隆 `.sheet`、删除 `.no-print`、等待字体后打印。

## 文件

- `sjm1-app/src/app/sggrfkcs-form.component.ts`
- `sjm1-app/src/app/sggrfkcs-form.component.html`
- `sjm1-app/src/app/sggrfkcs-form.component.css`
- 在 `app.routes.ts` 注册 `{ path: 'sggrfkcsForm', component: SggrfkcsFormComponent }`
- 在 `app.module.ts` 导入并加入 declarations。

## 表格

标题：`“三管”感染防控措施依从性监测`。

患者及导管留置必要性评估：镇静唤醒、早期康复、撤机或人工气道拔管评估、深静脉导管留置的必要性评估、导尿管留置必要性评估、医生签名。

VAP：床头抬高30°~45°、口腔护理、吸痰操作规范、声门下吸引、气管导管气囊测压25-30cmH₂O、积水杯最低位，倾倒冷凝水、呼吸机外部管路更换。

CRBSI：无菌操作、最大化无菌屏障、氯已定皮肤消毒、无菌敷料覆盖、更换、无菌接头更换，导管连接端口消毒时间不少于15s。

CAUTI：置管执行无菌操作、尿袋低于膀胱水平，高于地面、尿袋2／3满时清空、持续性封闭抗反流引流、尿道口正确清洁，必要时碘伏消毒。

末列：护士签名、督查者签名。备注：`备注：导管留置必要性评估√表示可拔管，×表示需继续留置。`

患者信息显示 `dept/name/hisBed/mrn/gender/birthday/clinicalDiagnosis`。

## 数据与接口

每项措施取值为 `'' | '√' | '×'`，统一保存在 `measures` 对象中。接口：

- `GET /api/v1/icu/sggrfkcs/listByPid?pid={pid}`
- `POST /api/v1/icu/sggrfkcs/save`
- `PATCH /api/v1/icu/sggrfkcs/{id}/invalidate?operatorId={accountId}`
- `GET /api/v1/icu/accounts`

不得用 localStorage 替代后端。

## 打印

每页固定 12 条，不足补空行；空数据仍显示一页。纸张为 `297mm × 210mm`，组件 CSS 和独立打印窗口 CSS 都必须声明 `@page { size: A4 landscape; margin: 0; }`。标题、患者信息、12 行和备注必须在同一页，不能出现备注单独占第二页或额外空白页。

完成后执行 `npm run build`，同步 `dist/sjm1-app/browser/*` 到 `src/main/resources/static/form/` 后再执行 Maven 打包。
