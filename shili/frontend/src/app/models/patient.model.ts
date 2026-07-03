import { Gender } from './gender.model';

/** 与宿主 postMessage 及展示字段对齐（扩展字段由宿主按需传入） */
export interface Patient {
  id?: string;
  hisPid?: string;
  /** 业务侧病人标识（与后端 Patient.pid 对齐；存各单记录时请用 id） */
  pid?: string;
  mrn?: string;
  name?: string;
  birthday?: string | Date;
  gender?: Gender | string;
  hisBed?: string;
  dept?: string;
  deptCode?: string;
  clinicalDiagnosis?: string;
}
