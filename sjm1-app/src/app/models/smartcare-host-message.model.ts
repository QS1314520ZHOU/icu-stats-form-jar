/** 嵌入页 postMessage 约定 */
export interface SmartCareHostMessage {
  type: 'SmartCare';
  patient: {
    id?: string;
    _id?: string;
    pid?: string;
    patientId?: string;
    patientID?: string;
    patient?: {
      id?: string;
      _id?: string;
      [k: string]: any;
    };
    [k: string]: any;
  };
  account?: { id?: string; trueName?: string; username?: string; [k: string]: any };
  token?: string;
}

export function getSmartCarePatientPid(p: any): string {
  return String(
    p?.id ??
    p?._id ??
    p?.pid ??
    p?.patientId ??
    p?.patientID ??
    p?.patient?.id ??
    p?.patient?._id ??
    ''
  ).trim();
}

export function isSmartCareHostMessage(raw: any): raw is SmartCareHostMessage {
  return !!raw
    && raw.type === 'SmartCare'
    && !!raw.patient
    && !!getSmartCarePatientPid(raw.patient);
}
