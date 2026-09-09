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
  | 'checking-data'
  | 'loading-form'
  | 'ready'
  | 'patient-not-found'
  | 'no-form-data'
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

/** 后端可用性检查响应 */
export interface IcuFormAvailabilityResponse {
  formKey: string;
  status: 'AVAILABLE' | 'EMPTY' | 'CLIENT_SIDE' | 'ERROR';
  hasData: boolean | null;
  count: number | null;
  message?: string;
}

/** Viewer 上下文（传递给 iframe 的子页面） */
export interface IcuFormViewerContext {
  isViewerMode: boolean;
  startTime: string | null;
  endTime: string | null;
  startInstant: Date | null;
  endInstant: Date | null;
}
