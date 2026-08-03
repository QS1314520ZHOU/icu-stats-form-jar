import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  BedsideRecord,
  DrugExecution,
  DrugMethodConfig,
  HljldSourceData,
  NurseRecord,
  SignatureRecord,
} from './hljld-form.models';

export interface SourceStatus {
  source: string;
  url: string;
  status: 'success' | 'error';
  httpStatus?: number;
  count: number;
  error?: string;
}

export interface LoadResult {
  data: HljldSourceData;
  statuses: SourceStatus[];
}

/** 护理记录单所需Bedside codes */
const FIXED_BEDSIDE_CODES = [
  'param_带入药量',
  'param_kouFu',
  'param_biSi',
  'param_chaoLvLiang',
  'param_niaoLiang',
  'param_daBianAmount',
  'param_造瘘口量',
  'param_outuwuliang',
  'param_咯血',
  'param_tanLiang',
  'param_外出检查',
  'param_物理治疗',
  'param_基础护理1',
  'param_健康教育',
  'param_YaoYeti_in_hour',
  'param_YaoStomach_in_hour',
  'param_YaoShuXue_in_hour',
  'param_Yishi',
];

@Injectable()
export class HljldFormService {
  private readonly hljldBase = '/api/v1/icu/hljld';
  private readonly bedsideApi = '/api/v1/icu/bedside/listByPid';

  constructor(private http: HttpClient) {}

  load(pid: string, start: Date, end: Date): Observable<LoadResult> {
    const statuses: SourceStatus[] = [];
    const isDev = typeof location !== 'undefined' && /localhost|127\.0\.0\.1/.test(location.hostname);

    const safeGet = <T>(name: string, url: string, reqParams?: HttpParams): Observable<{ data: T[]; status: SourceStatus }> => {
      return this.http.get<T[]>(url, { params: reqParams }).pipe(
        map(response => {
          const data = this.normalizeArray(response);
          const st: SourceStatus = { source: name, url, status: 'success', count: data.length };
          statuses.push(st);
          if (isDev) { console.info(`[HLJLD][source] ${name}`, { url, pid, startTime: start.toISOString(), endTime: end.toISOString(), count: data.length }); }
          return { data, status: st };
        }),
        catchError(error => {
          const st: SourceStatus = {
            source: name,
            url,
            status: 'error',
            httpStatus: error?.status,
            count: 0,
            error: error?.message || String(error),
          };
          statuses.push(st);
          if (isDev) { console.error(`[HLJLD][source-error] ${name}`, { url, pid, status: error?.status, message: st.error }); }
          return of({ data: [] as T[], status: st });
        }),
      );
    };

    // Bedside: 复用已有 /api/v1/icu/bedside/listByPid 接口
    // 不传codes参数，获取该患者全部Bedside记录，前端按时间和code筛选
    // 这样可以覆盖动态code（如"引流"类记录）
    const bedsideParams = new HttpParams()
      .set('pid', pid);

    return forkJoin({
      bedside: safeGet<BedsideRecord>('bedside', this.bedsideApi, bedsideParams),
      drugExecutions: safeGet<DrugExecution>('drugExecutions', `${this.hljldBase}/drug-executions`, new HttpParams().set('pid', pid).set('startTime', start.toISOString()).set('endTime', end.toISOString())),
      drugMethods: safeGet<DrugMethodConfig>('drugMethods', `${this.hljldBase}/drug-methods`),
      nurseRecords: safeGet<NurseRecord>('nurseRecords', `${this.hljldBase}/nurse-records`, new HttpParams().set('pid', pid).set('startTime', start.toISOString()).set('endTime', end.toISOString())),
      signatures: safeGet<SignatureRecord>('signatures', `${this.hljldBase}/signatures`, new HttpParams().set('pid', pid).set('startTime', start.toISOString()).set('endTime', end.toISOString())),
    }).pipe(
      map(result => ({
        data: {
          bedside: result.bedside.data,
          drugExecutions: result.drugExecutions.data,
          drugMethods: result.drugMethods.data,
          nurseRecords: result.nurseRecords.data,
          signatures: result.signatures.data,
        },
        statuses,
      })),
    );
  }

  private normalizeArray<T>(response: T[] | { data?: T[] } | null): T[] {
    if (Array.isArray(response)) return response;
    if (response && Array.isArray((response as any).data)) return (response as any).data;
    return [];
  }
}
