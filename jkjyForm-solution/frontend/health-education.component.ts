import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

interface OptionItem { code: string; label: string; detail?: string; }
interface OptionGroup { name: string; items: OptionItem[]; }
interface HealthEducationRecord {
  id?: string; pid: string; assessmentTime: string; itemCodes: string[];
  educationTarget: 'A'|'B'|'AB'|''; evaluationCodes: string[];
  nurseId?: string; nurseName: string;
  specialMedicationOther?: string; externalExamOther?: string;
  internalExamOther?: string; otherEducation?: string;
  valuableCodes: string[]; valuableOther?: string;
  receiverConfirmed?: boolean; receiverName?: string; receivedAt?: string;
  valid?: boolean; updatedBy?: string;
}
interface AccountOption { accountId: string; accountName: string; }
interface RenderPage { index: number; records: (HealthEducationRecord|null)[]; }

const GROUPS: OptionGroup[] = [
  { name: '入院/转入宣教', items: [
    {code:'ADMISSION_STAFF',label:'人员介绍',detail:'科主任、护士长、主管医生、主管护士及护工等'},
    {code:'ENVIRONMENT',label:'环境介绍',detail:'医院环境、病区环境，如出入院处、医保办、病员服务中心等'},
    {code:'RULES',label:'住院相关制度',detail:'病区管理、作息、探视、消毒隔离制度及护工服务内容等'},
    {code:'SAFETY',label:'住院安全',detail:'用水、用电安全、禁止烟火、防盗、贵重物品保存、防烫伤等'},
    {code:'COST',label:'住院费用及住院一日清单发放说明等'},
    {code:'WARM_TIPS',label:'发放《入院温馨提示》',detail:'患者住院所需生活用物及饮食准备宣教'},
    {code:'RISKS',label:'风险告知及预防',detail:'跌倒坠床、压力性损伤、非计划性拔管、VTE及营养等'},
    {code:'RESTRAINT',label:'保护性约束及风险告知'}]},
  { name: '疾病宣教', items: [
    {code:'DISEASE_CARE',label:'疾病护理教育',detail:'临床表现、主要治疗、心理护理、体位、营养、功能锻炼等'},
    {code:'SMOKING_CESSATION',label:'戒烟宣教'}]},
  { name: '药物宣教', items: [
    {code:'ORAL_MEDICATION',label:'口服药宣教',detail:'作用、用药途径及方法'},
    {code:'ENTERAL_NUTRITION',label:'肠内营养制剂宣教',detail:'使用目的、途径、方法及注意事项'},
    {code:'IV_MEDICATION',label:'静脉用药宣教',detail:'使用目的、途径、方法及注意事项'},
    {code:'SPECIAL_ANTIBIOTIC',label:'特殊用药：抗菌药物'},
    {code:'VASOACTIVE',label:'特殊用药：血管活性药物'},
    {code:'SEDATION',label:'特殊用药：镇静镇痛药物'},
    {code:'SPECIAL_OTHER',label:'特殊用药：其他'}]},
  { name: '检查宣教', items: [
    {code:'EXAM_CT',label:'外出检查：CT'}, {code:'MRI',label:'外出检查：磁共振'},
    {code:'GASTROSCOPY',label:'外出检查：胃镜'}, {code:'EXAM_OTHER',label:'外出检查：其它'},
    {code:'TRANSPORT_RISK',label:'患者转运风险'},
    {code:'BRONCHOSCOPY',label:'科内检查：纤维支气管镜灌洗'},
    {code:'WARD_OTHER',label:'科内检查：其它'}]},
  { name: '术前宣教', items: [{code:'PREOP',label:'术前准备与配合',detail:'体位练习、咳嗽咳痰、床上排便方法等'}]},
  { name: '术后宣教', items: [{code:'POSTOP',label:'术后注意事项',detail:'饮食、活动、术口、管道及疼痛护理'}]},
  { name: '出院/转科宣教', items: [
    {code:'DISCHARGE_PROCEDURE',label:'办理出院（转科）手续，发带药及资料'},
    {code:'DISCHARGE_GUIDANCE',label:'饮食、用药、休息及预防疾病指导'},
    {code:'FOLLOWUP',label:'复诊及随访事项，发放《出院通知单》'}]},
  { name: '其它', items: [{code:'OTHER',label:'其它宣教'}]}
];
const VALUABLES = ['手机','现金','医保卡','身份证','银行卡','钥匙','假牙'];

@Component({
  standalone: false,
  selector: 'app-health-education',
  templateUrl: './health-education.component.html',
  styleUrls: ['./health-education.component.css']
})
export class HealthEducationComponent implements OnInit, OnDestroy {
  private readonly API = '/api/v1/icu/health-education';
  readonly groups = GROUPS; readonly valuables = VALUABLES;
  readonly targetOptions = [{code:'A',label:'家属'},{code:'B',label:'病人'}];
  readonly evaluationOptions = [{code:'A',label:'能复述'},{code:'B',label:'能解释'},{code:'C',label:'能模仿'},{code:'D',label:'能操作'}];

  patient: any = null; hospitalName = '重钢总医院'; age: number|null = null;
  loading = false; saving = false; records: HealthEducationRecord[] = []; pages: RenderPage[] = [];
  editListOpen = false; formOpen = false; editing = false; errorText = '';
  accounts: AccountOption[] = []; account: any = null;
  form: HealthEducationRecord = this.emptyForm('');
  private pid = ''; private destroy$ = new Subject<void>();

  constructor(private http: HttpClient, private hostPatient: HostPatientService,
              private cdr: ChangeDetectorRef, private host: ElementRef) {}

  ngOnInit(): void {
    this.loadHospitalName(); this.loadAccounts();
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a => this.account = a);
    this.hostPatient.patient$.pipe(
      filter(Boolean), map(p => ({p, pid:String(p.id || '').trim()})), filter(x => !!x.pid),
      distinctUntilChanged((a,b) => a.pid === b.pid),
      tap(({p,pid}) => { this.closeDialogs(); this.patient=p; this.pid=pid; this.age=this.calcAge(p.birthday); this.records=[]; this.paginate(); }),
      switchMap(({pid}) => this.fetchRecords(pid)), takeUntil(this.destroy$)
    ).subscribe();
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private fetchRecords(pid: string) {
    this.loading = true;
    return this.http.get<HealthEducationRecord[]>(`${this.API}/listByPid`, {params:{pid}}).pipe(
      tap(list => { this.records=(Array.isArray(list)?list:[]).sort((a,b)=>this.ts(a.assessmentTime)-this.ts(b.assessmentTime)); this.paginate(); }),
      finalize(()=>{this.loading=false; this.cdr.detectChanges();})
    );
  }
  private reload(): void { if (this.pid) this.fetchRecords(this.pid).subscribe(); }

  openCreate(): void {
    if (!this.pid) return;
    this.editing=false; this.errorText=''; this.form=this.emptyForm(this.pid);
    this.form.assessmentTime=this.toLocalInput(new Date());
    this.form.nurseId=String(this.account?.id || this.account?.username || '');
    this.form.nurseName=this.account?.trueName || this.account?.accountName || '';
    this.formOpen=true;
  }
  openEditList(): void { this.editListOpen=true; }
  editRecord(r: HealthEducationRecord): void {
    this.editListOpen=false; this.editing=true; this.errorText='';
    this.form=JSON.parse(JSON.stringify(r));
    this.form.assessmentTime=this.toLocalInput(new Date(r.assessmentTime));
    if (this.form.receivedAt) this.form.receivedAt=this.toLocalInput(new Date(this.form.receivedAt));
    this.form.itemCodes ||= []; this.form.evaluationCodes ||= []; this.form.valuableCodes ||= [];
    this.formOpen=true;
  }
  save(): void {
    this.errorText='';
    if (!this.form.assessmentTime) { this.errorText='评估时间为必填项'; return; }
    if (!this.form.nurseName?.trim()) { this.errorText='护士签名为必填项'; return; }
    this.saving=true;
    const body={...this.form, pid:this.pid, assessmentTime:new Date(this.form.assessmentTime).toISOString(),
      receivedAt:this.form.receivedAt ? new Date(this.form.receivedAt).toISOString() : undefined,
      nurseName:this.form.nurseName.trim(), updatedBy:String(this.account?.id || '')};
    this.http.post<HealthEducationRecord>(`${this.API}/save`, body).pipe(finalize(()=>this.saving=false)).subscribe({
      next:()=>{this.formOpen=false; this.reload();}, error:e=>this.errorText=e?.error?.message || '保存失败，请稍后重试'
    });
  }
  invalidate(r: HealthEducationRecord): void {
    if (!r.id || !confirm(`确认删除 ${this.fmtDateTime(r.assessmentTime)} 的评估记录？`)) return;
    this.http.patch(`${this.API}/${r.id}/invalidate`, null, {params:{operatorId:String(this.account?.id || '')}}).subscribe({
      next:()=>this.reload(), error:()=>alert('删除失败')
    });
  }

  checked(r: HealthEducationRecord|null, code: string): string { return r?.itemCodes?.includes(code) ? '√' : ''; }
  has(arr: string[]|undefined, code: string): boolean { return !!arr?.includes(code); }
  toggle(field: 'itemCodes'|'evaluationCodes'|'valuableCodes', code: string, on: boolean): void {
    const set=new Set(this.form[field] || []); on ? set.add(code) : set.delete(code); this.form[field]=[...set];
  }
  targetMark(r: HealthEducationRecord|null, code: string): string {
    return r && (r.educationTarget===code || r.educationTarget==='AB') ? '√' : '';
  }
  evalText(r: HealthEducationRecord|null): string { return (r?.evaluationCodes || []).join('、'); }
  groupRows(g: OptionGroup): number { return g.items.length; }
  pageRecords(p: RenderPage): (HealthEducationRecord|null)[] { return p.records; }

  print(): void { window.print(); }
  closeDialogs(): void { this.editListOpen=false; this.formOpen=false; this.errorText=''; }
  private paginate(): void {
    const out: RenderPage[]=[]; const source=this.records.length?this.records:[null as any];
    for(let i=0;i<source.length;i+=5){const rows=(source.slice(i,i+5) as (HealthEducationRecord|null)[]); while(rows.length<5)rows.push(null); out.push({index:out.length+1,records:rows});}
    this.pages=out;
  }
  private emptyForm(pid: string): HealthEducationRecord { return {pid,assessmentTime:'',itemCodes:[],educationTarget:'',evaluationCodes:[],nurseName:'',valuableCodes:[],receiverConfirmed:false}; }
  private loadAccounts(): void { this.http.get<AccountOption[]>('/api/v1/icu/accounts').subscribe({next:x=>this.accounts=Array.isArray(x)?x:[],error:()=>{}}); }
  private loadHospitalName(): void { this.http.get<any>('/api/v1/config/hospital').subscribe({next:x=>{if(x?.hospitalName)this.hospitalName=x.hospitalName;},error:()=>{}}); }
  fmtDateTime(v?: string): string { if(!v)return ''; const d=new Date(v); if(isNaN(d.getTime()))return v; const p=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  private toLocalInput(d: Date): string { const p=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
  private ts(v?:string):number { const t=v?new Date(v).getTime():0; return isNaN(t)?0:t; }
  private calcAge(v?:string):number|null { if(!v)return null; const b=new Date(v); if(isNaN(b.getTime()))return null; const n=new Date(); let a=n.getFullYear()-b.getFullYear(); if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--; return a>=0?a:null; }
}
