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
    return this.http.get<DepartmentDailySnapshot>(`${this.baseUrl}/daily`, { params }).pipe(
      map(snapshot => this.normalizeSnapshot(snapshot)),
    );
  }

  /**
   * 归一化快照：
   * 1. 账户文档补 id（Mongo 原始文档只有 _id，否则界面上选中的护士签名
   *    在打印时按 id 查不到姓名）。
   * 2. 清洗历史脏签名值（"undefined"），并把误存成姓名的值换回账号 id。
   */
  private normalizeSnapshot(snapshot: DepartmentDailySnapshot): DepartmentDailySnapshot {
    const accounts = (snapshot.nurseAccounts || []).map(account => ({
      ...account,
      id: account.id || account._id || '',
    }));

    const idByName = new Map<string, string>();
    const idSet = new Set<string>();
    for (const account of accounts) {
      if (!account.id) { continue; }
      idSet.add(account.id);
      if (account.trueName && !idByName.has(account.trueName)) {
        idByName.set(account.trueName, account.id);
      }
    }

    const shiftSignatures = snapshot.draft?.shiftSignatures || {};
    for (const shift of ['day', 'evening', 'night'] as const) {
      const value = (shiftSignatures[shift] || '').trim();
      if (!value || value === 'undefined') {
        if (value) { shiftSignatures[shift] = ''; }
        continue;
      }
      if (!idSet.has(value) && idByName.has(value)) {
        shiftSignatures[shift] = idByName.get(value)!;
      }
    }

    return {
      ...snapshot,
      nurseAccounts: accounts,
      draft: snapshot.draft ? { ...snapshot.draft, shiftSignatures } : snapshot.draft,
    };
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
   *
   * 版本过期（同一份草稿在另一个页面/标签页被保存过，或本页请求并发）
   * 返回409时，取服务端返回的最新版本号重放一次：字段级补丁只会覆盖
   * 本次修改的字段，其余字段保持服务端最新值，避免用户自己的保存被丢弃。
   */
  patchDraft(request: DraftPatchRequest): Observable<HandoverDraft> {
    return this.sendPatch(request, true);
  }

  /**
   * @param allowRebase 版本过期时是否允许按最新版本重放（仅一次，防止死循环）
   */
  private sendPatch(request: DraftPatchRequest, allowRebase: boolean): Observable<HandoverDraft> {
    return this.http.patch<HandoverDraft>(`${this.baseUrl}/draft`, request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status !== 409 && error.status !== 412) {
          return throwError(() => error);
        }

        const latestDraft: HandoverDraft | undefined = error.error?.latestDraft;
        const latestVersion = latestDraft?.version;
        if (allowRebase && latestDraft && typeof latestVersion === 'number' && latestVersion !== request.baseVersion) {
          return this.sendPatch({ ...request, baseVersion: latestVersion }, false);
        }
        return throwError(() => new DraftConflictError(latestDraft!));
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
