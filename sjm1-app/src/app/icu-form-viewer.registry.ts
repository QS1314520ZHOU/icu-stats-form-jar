import { IcuFormViewerFormDef } from './icu-form-viewer.models';

/**
 * 统一调阅页面表单注册清单。
 * 仅包含允许在统一调阅页面展示的业务表单。
 *
 * 排除项：
 * - transfusionForm：输血记录单
 * - temperatureRecord：体温单（第三方）
 * - bloodSugar：血糖单（第三方）
 * - printCenter：打印工具，不是患者业务表单
 * - hljldFormPDF：旧护理记录单技术路由，与新护理记录单重复
 */
export const ICU_VIEWER_FORMS: IcuFormViewerFormDef[] = [
  /* ── 默认护理记录单（最前） ── */
  { key: 'hljldFormPDFNew', title: '重症监护护理记录单', route: 'hljldFormPDFNew' },

  /* ── 交班报告 ── */
  { key: 'handoverReport', title: 'ICU 交班报告', route: 'handoverReport' },

  /* ── 管道维护 ── */
  { key: 'sjm1', title: '深静脉维护记录单（一）', route: 'sjm1' },
  { key: 'sjmCrrt', title: '深静脉维护记录单（三）·透析导管', route: 'sjmCrrt' },

  /* ── 专科治疗 ── */
  { key: 'ydwzlForm', title: '亚低温治疗体温记录单', route: 'ydwzlForm' },
  { key: 'ecmoForm', title: 'ECMO 运行护理记录单', route: 'ecmoForm' },
  { key: 'crrtForm', title: 'CRRT 护理记录单', route: 'crrtForm' },
  { key: 'crrtOrderForm', title: 'CRRT 治疗医嘱单', route: 'crrtOrderForm' },
  { key: 'piccoForm', title: 'PiCCO 监测记录单', route: 'piccoForm' },
  { key: 'iabpForm', title: 'IABP 护理记录单', route: 'iabpForm' },

  /* ── 风险与评分 ── */
  { key: 'toleranceForm', title: '肠内营养耐受性评分表', route: 'toleranceForm' },
  { key: 'commitSuicideForm', title: '自杀风险评估表（NGASR）', route: 'commitSuicideForm' },
  { key: 'IADForm', title: '失禁相关性皮炎（IAD）评估记录单', route: 'IADForm' },
  { key: 'baetheiForm', title: '住院患者日常生活能力评估单（Barthel）', route: 'baetheiForm' },
  { key: 'patientFallDangerForm', title: '跌倒/坠床风险评估及预防措施记录单', route: 'patientFallDangerForm' },
  { key: 'bradenForm', title: '住院患者压力性损伤评估及措施记录单（Braden）', route: 'bradenForm' },
  { key: 'unPlannedCGZYYForm', title: '非计划拔管风险评估及护理措施记录单', route: 'unPlannedCGZYYForm' },

  /* ── 护理记录 ── */
  { key: 'jkjyForm', title: '健康教育记录单', route: 'jkjyForm' },
  { key: 'wpgmForm', title: '住院患者物品管理表', route: 'wpgmForm' },
];
