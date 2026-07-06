/** 嵌入页 postMessage 约定 */
export interface SmartCareHostMessage {
  type: 'SmartCare';
  patient: { id: string; [k: string]: any };
  account?: { id: string; trueName?: string; [k: string]: any };
  token?: string;
}

export function isSmartCareHostMessage(raw: any): raw is SmartCareHostMessage {
  return !!raw && raw.type === 'SmartCare' && !!raw.patient && !!raw.patient.id;
}
