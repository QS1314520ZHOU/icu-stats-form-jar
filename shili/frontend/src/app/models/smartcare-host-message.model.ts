import { Patient } from './patient.model';

/** 嵌入页 postMessage 约定 */
export interface SmartCareHostMessage {
  type: 'SmartCare';
  patient?: Patient;
  account?: string;
  token?: string;
  [key: string]: unknown;
}

export function isSmartCareHostMessage(data: unknown): data is SmartCareHostMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as SmartCareHostMessage).type === 'SmartCare'
  );
}
