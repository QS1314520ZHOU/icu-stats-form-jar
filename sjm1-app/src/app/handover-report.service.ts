import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import {
  DepartmentDailySnapshot,
  DraftConflictError,
  DraftPatchRequest,
  HandoverDraft,
  NurseRecord,
} from './handover-report.models';

@Injectable()
export class HandoverReportService {
  private readonly baseUrl = '/api/v1/icu/handover-report';
  private readonly nurseRecordUrl = '/api/v1/icu/hljld/nurse-records';

  constructor(private readonly http: HttpClient) {}

  loadDaily(condition: { reportDate: string; department?: string; departmentCode?: string }): Observable<DepartmentDailySnapshot> {
    let params = new HttpParams().set('reportDate', condition.reportDate);
    if (condition.department) { params = params.set('department', condition.department); }
    if (condition.departmentCode) { params = params.set('departmentCode', condition.departmentCode); }
    return this.http.get<DepartmentDailySnapshot>(`${this.baseUrl}/daily`, { params });
  }

  /**
   * 按患者和班次时间范围查询护理记录。
   * 复用 HljldController 已有的 /nurse-records 接口。
   */
  loadNurseRecords(pid: string, startTime: Date, endTime: Date): Observable<NurseRecord[]> {
    const normalizedPid = String(pid ?? '').trim();
    if (!normalizedPid) {
      return throwError(() => new Error('当前患者缺少护理记录关联ID'));
    }
    const params = new HttpParams()
      .set('pid', normalizedPid)
      .set('startTime', startTime.toISOString())
      .set('endTime', endTime.toISOString());

    return this.http
      .get<NurseRecord[] | { data?: NurseRecord[] }>(this.nurseRecordUrl, { params })
      .pipe(
        map(response => this.normalizeArray(response)),
        map(records =>
          records
            .filter(record => record?.valid !== false)
            .filter(record => !!String(record?.desc ?? '').trim())
            .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()),
        ),
      );
  }

  /**
   * 字段级补丁保存，支持并发修改。
   * 不再使用整份PUT覆盖。
   */
  patchDraft(request: DraftPatchRequest): Observable<HandoverDraft> {
    return this.http.patch<HandoverDraft>(`${this.baseUrl}/draft`, request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 409 || error.status === 412) {
          return throwError(() => new DraftConflictError(error.error?.latestDraft));
        }
        return throwError(() => error);
      }),
    );
  }

  /**
   * 替换危重患者选择。
   */
  replaceCriticalPatients(request: {
    departmentId: string;
    reportDate: string;
    baseVersion: number;
    patientIds: string[];
    selectedBy: string;
  }): Observable<HandoverDraft> {
    return this.patchDraft({
      departmentId: request.departmentId,
      reportDate: request.reportDate,
      baseVersion: request.baseVersion,
      changes: [
        {
          type: 'replaceCriticalPatients',
          patientIds: request.patientIds,
          selectedBy: request.selectedBy,
        },
      ],
    });
  }

  /**
   * 设置患者交班文本。
   */
  setPatientText(request: {
    departmentId: string;
    reportDate: string;
    baseVersion: number;
    rowKey: string;
    shift: 'day' | 'evening' | 'night';
    value: string;
    expectedFieldVersion?: number;
  }): Observable<HandoverDraft> {
    return this.patchDraft({
      departmentId: request.departmentId,
      reportDate: request.reportDate,
      baseVersion: request.baseVersion,
      changes: [
        {
          type: 'setPatientText',
          rowKey: request.rowKey,
          shift: request.shift,
          value: request.value,
          expectedFieldVersion: request.expectedFieldVersion,
        },
      ],
    });
  }

  /**
   * 设置手工安全指标。
   */
  setManualMetric(request: {
    departmentId: string;
    reportDate: string;
    baseVersion: number;
    metricKey: string;
    shift: 'day' | 'evening' | 'night';
    value: string;
    expectedFieldVersion?: number;
  }): Observable<HandoverDraft> {
    return this.patchDraft({
      departmentId: request.departmentId,
      reportDate: request.reportDate,
      baseVersion: request.baseVersion,
      changes: [
        {
          type: 'setManualMetric',
          metricKey: request.metricKey,
          shift: request.shift,
          value: request.value,
          expectedFieldVersion: request.expectedFieldVersion,
        },
      ],
    });
  }

  /**
   * 设置班次护士签名。
   */
  setShiftSignature(request: {
    departmentId: string;
    reportDate: string;
    baseVersion: number;
    shift: 'day' | 'evening' | 'night';
    accountId: string;
    expectedFieldVersion?: number;
  }): Observable<HandoverDraft> {
    return this.patchDraft({
      departmentId: request.departmentId,
      reportDate: request.reportDate,
      baseVersion: request.baseVersion,
      changes: [
        {
          type: 'setShiftSignature',
          shift: request.shift,
          accountId: request.accountId,
          expectedFieldVersion: request.expectedFieldVersion,
        },
      ],
    });
  }

  /**
   * 设置护士长签名。
   */
  setHeadNurseSignature(request: {
    departmentId: string;
    reportDate: string;
    baseVersion: number;
    accountId: string;
    expectedFieldVersion?: number;
  }): Observable<HandoverDraft> {
    return this.patchDraft({
      departmentId: request.departmentId,
      reportDate: request.reportDate,
      baseVersion: request.baseVersion,
      changes: [
        {
          type: 'setHeadNurseSignature',
          accountId: request.accountId,
          expectedFieldVersion: request.expectedFieldVersion,
        },
      ],
    });
  }

  /**
   * 设置备注。
   */
  setRemark(request: {
    departmentId: string;
    reportDate: string;
    baseVersion: number;
    shift: 'day' | 'evening' | 'night';
    value: string;
    expectedFieldVersion?: number;
  }): Observable<HandoverDraft> {
    return this.patchDraft({
      departmentId: request.departmentId,
      reportDate: request.reportDate,
      baseVersion: request.baseVersion,
      changes: [
        {
          type: 'setRemark',
          shift: request.shift,
          value: request.value,
          expectedFieldVersion: request.expectedFieldVersion,
        },
      ],
    });
  }

  /**
   * 设置"其它"内容。
   */
  setOtherText(request: {
    departmentId: string;
    reportDate: string;
    baseVersion: number;
    shift: 'day' | 'evening' | 'night';
    value: string;
    expectedFieldVersion?: number;
  }): Observable<HandoverDraft> {
    return this.patchDraft({
      departmentId: request.departmentId,
      reportDate: request.reportDate,
      baseVersion: request.baseVersion,
      changes: [
        {
          type: 'setOtherText',
          shift: request.shift,
          value: request.value,
          expectedFieldVersion: request.expectedFieldVersion,
        },
      ],
    });
  }

  private normalizeArray<T>(response: T[] | { data?: T[] } | null | undefined): T[] {
    if (Array.isArray(response)) { return response; }
    if (response && Array.isArray((response as { data?: T[] }).data)) { return (response as { data: T[] }).data; }
    return [];
  }
}
