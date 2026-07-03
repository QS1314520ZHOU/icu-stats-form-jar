import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Account } from '../models/account.model';
import { Department } from '../models/department.model';

@Injectable({ providedIn: 'root' })
export class IcuApiService {
  private readonly root = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  private u(path: string): string {
    return `${this.root}${path}`;
  }

  getDepartments(): Observable<Department[]> {
    return this.http.get<Department[]>(this.u('/api/v1/icu/departments'));
  }

  getAccounts(profession?: string): Observable<Account[]> {
    let url = this.u('/api/v1/icu/accounts');
    if (profession) {
      url += `?profession=${encodeURIComponent(profession)}`;
    }
    return this.http.get<Account[]>(url);
  }

  getCrrtByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/crrt/patient/${encodeURIComponent(pid)}`));
  }

  saveCrrt(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/crrt'), body);
  }

  deleteCrrt(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/crrt/${encodeURIComponent(id)}`));
  }

  getProteinAByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/protein-a/patient/${encodeURIComponent(pid)}`));
  }

  saveProteinA(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/protein-a'), body);
  }

  deleteProteinA(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/protein-a/${encodeURIComponent(id)}`));
  }

  getPeByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/pe/patient/${encodeURIComponent(pid)}`));
  }

  savePe(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/pe'), body);
  }

  deletePe(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/pe/${encodeURIComponent(id)}`));
  }

  getHpByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/hp/patient/${encodeURIComponent(pid)}`));
  }

  saveHp(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/hp'), body);
  }

  deleteHp(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/hp/${encodeURIComponent(id)}`));
  }

  getCvcByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/cvc/patient/${encodeURIComponent(pid)}`));
  }

  saveCvc(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/cvc'), body);
  }

  deleteCvc(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/cvc/${encodeURIComponent(id)}`));
  }

  getPiccoByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/picco/patient/${encodeURIComponent(pid)}`));
  }

  savePicco(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/picco'), body);
  }

  deletePicco(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/picco/${encodeURIComponent(id)}`));
  }

  getIabpByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/iabp/patient/${encodeURIComponent(pid)}`));
  }

  saveIabp(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/iabp'), body);
  }

  deleteIabp(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/iabp/${encodeURIComponent(id)}`));
  }

  getRmByPid(pid: string): Observable<any[]> {
    return this.http.get<any[]>(this.u(`/api/v1/icu/rm/patient/${encodeURIComponent(pid)}`));
  }

  saveRm(body: any): Observable<any> {
    return this.http.post<any>(this.u('/api/v1/icu/rm'), body);
  }

  deleteRm(id: string): Observable<void> {
    return this.http.delete<void>(this.u(`/api/v1/icu/rm/${encodeURIComponent(id)}`));
  }
}
