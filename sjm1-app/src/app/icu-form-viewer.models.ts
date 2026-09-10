/** 统一表单调阅页面模型定义 */

/** 表单注册项 */
export interface IcuFormViewerFormDef {
  key: string;
  title: string;
  route: string;
}

/** 页面状态机 */
export type IcuFormViewerState =
  | 'idle'
  | 'loading-patient'
  | 'loading-form'
  | 'ready'
  | 'patient-not-found'
  | 'error';

/** 患者信息（从后端 API 获取） */
export interface IcuPatient {
  id: string;
  _id?: string;
  name?: string;
  mrn?: string;
  hisBed?: string;
  dept?: string;
  deptCode?: string;
  gender?: string;
  birthday?: string;
  [key: string]: any;
}

/** Viewer 上下文（传递给 iframe 的子页面） */
export interface IcuFormViewerContext {
  isViewerMode: boolean;
  startTime: string | null;
  endTime: string | null;
  startInstant: Date | null;
  endInstant: Date | null;
  /** 规范化后的 Shanghai 日期字符串 yyyy-MM-dd（从时间戳转换） */
  startDateStr: string | null;
  endDateStr: string | null;
}
