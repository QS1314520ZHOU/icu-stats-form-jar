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

@Injectable()
export class HljldFormService {
  private readonly baseUrl = '/api/v1/icu/hljld';

  constructor(private http: HttpClient) {}

  load(pid: string, start: Date, end: Date): Observable<HljldSourceData> {
    const params = new HttpParams()
      .set('pid', pid)
      .set('startTime', start.toISOString())
      .set('endTime', end.toISOString());

    return forkJoin({
      bedside: this.http.get<BedsideRecord[]>(`${this.baseUrl}/bedside`, { params }).pipe(catchError(() => of([]))),
      drugExecutions: this.http.get<DrugExecution[]>(`${this.baseUrl}/drug-executions`, { params }).pipe(catchError(() => of([]))),
      drugMethods: this.http.get<DrugMethodConfig[]>(`${this.baseUrl}/drug-methods`).pipe(catchError(() => of([]))),
      nurseRecords: this.http.get<NurseRecord[]>(`${this.baseUrl}/nurse-records`, { params }).pipe(catchError(() => of([]))),
      signatures: this.http.get<SignatureRecord[]>(`${this.baseUrl}/signatures`, { params }).pipe(catchError(() => of([]))),
    }).pipe(map(result => ({
      bedside: result.bedside || [],
      drugExecutions: result.drugExecutions || [],
      drugMethods: result.drugMethods || [],
      nurseRecords: result.nurseRecords || [],
      signatures: result.signatures || [],
    })));
  }
}
