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
  dischargeEducation?: boolean; transferEducation?: boolean;
  valuableCodes: string[]; valuableOther?: string;
  receiverConfirmed?: boolean; receiverName?: string; receivedAt?: string;
  valid?: boolean; updatedBy?: string;
}
interface AccountOption { accountId: string; accountName: string; }
interface RenderPage { index: number; records: (HealthEducationRecord|null)[]; }
interface HealthEducationSharedInfo { valuableCodes: string[]; valuableOther: string; receiverConfirmed: boolean; receiverName: string; receivedAt: string; }

const GROUPS: OptionGroup[] = [
  { name: '入院/转入宣教', items: [
    {code:'ADMISSION_STAFF',label:'人员介绍',detail:'科主任、护士长、主管医生、主管护士及护工等'},
    {code:'ENVIRONMENT',label:'环境介绍',detail:'医院环境、病区环境，如出入院处、医保办、病员服务中心等'},
    {code:'RULES',label:'介绍住院相关制度',detail:'病区管理、作息、探视、消毒隔离制度及护工服务内容等'},
    {code:'SAFETY',label:'介绍住院安全',detail:'用水、用电安全、禁止烟火、防盗、贵重物品保存、防烫伤等注意事项'},
    {code:'COST',label:'住院费用及住院一日清单发放说明等'},
    {code:'WARM_TIPS',label:'发放《入院温馨提示》',detail:'患者住院所需生活用物及饮食准备宣教'},
    {code:'RISKS',label:'患者跌倒坠床、皮肤压力性损伤、非计划性拔管、VTE发生及营养等风险告知及预防相关知识宣教'},
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
  loading = false; saving = false; deletingId = ''; loadError = '';
  records: HealthEducationRecord[] = []; pages: RenderPage[] = [];
  selectedPrintPage: number | null = null;
  editListOpen = false; formOpen = false; editing = false; errorText = '';
  accounts: AccountOption[] = []; account: any = null;
  form: HealthEducationRecord = this.emptyForm('');
  sharedInfo: HealthEducationSharedInfo = this.emptySharedInfo();
  sharedDraft: HealthEducationSharedInfo = this.emptySharedInfo();
  sharedEditing = false; sharedSaving = false;
  private sharedCarrierRecord: HealthEducationRecord | null = null;
  private pid = ''; private destroy$ = new Subject<void>();
  private refresh$ = new Subject<void>();

  constructor(private http: HttpClient, private hostPatient: HostPatientService,
              private cdr: ChangeDetectorRef, private host: ElementRef) {}

  ngOnInit(): void {
    this.loadHospitalName(); this.loadAccounts();
    this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a => this.account = a);
    this.hostPatient.patient$.pipe(
      filter(Boolean), map(p => ({p, pid:String(p.id || '').trim()})), filter(x => !!x.pid),
      distinctUntilChanged((a,b) => a.pid === b.pid),
      tap(({p,pid}) => { this.closeDialogs(); this.patient=p; this.pid=pid; this.age=this.calcAge(p.birthday); this.records=[]; this.sharedInfo=this.emptySharedInfo(); this.sharedDraft=this.emptySharedInfo(); this.sharedCarrierRecord=null; this.sharedEditing=false; this.paginate(); this.loadError=''; }),
      switchMap(({pid}) => this.fetchRecords(pid)), takeUntil(this.destroy$)
    ).subscribe();
    this.refresh$.pipe(takeUntil(this.destroy$)).subscribe(() => { if(this.pid) this.fetchRecords(this.pid).subscribe(); });
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private fetchRecords(pid: string) {
    this.loading = true; this.loadError = '';
    return this.http.get<HealthEducationRecord[]>(`${this.API}/listByPid`, {params:{pid}}).pipe(
      tap(list => { this.records=(Array.isArray(list)?list:[]).sort((a,b)=>this.ts(a.assessmentTime)-this.ts(b.assessmentTime)); this.hydrateSharedInfo(); this.paginate(); }),
      finalize(()=>{this.loading=false; this.cdr.detectChanges();})
    );
  }
  private reload(): void { this.refresh$.next(); }

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
    const operationPid = this.pid;
    const body={...this.form, pid:this.pid, assessmentTime:new Date(this.form.assessmentTime).toISOString(),
      receivedAt:this.form.receivedAt ? new Date(this.form.receivedAt).toISOString() : undefined,
      nurseName:this.form.nurseName.trim(), updatedBy:String(this.account?.id || '')};
    this.http.post<HealthEducationRecord>(`${this.API}/save`, body).pipe(finalize(()=>this.saving=false), takeUntil(this.destroy$)).subscribe({
      next:()=>{ if(operationPid===this.pid){ this.formOpen=false; this.reload(); } },
      error:e=>this.errorText=e?.error?.message || '保存失败，请稍后重试'
    });
  }
  invalidate(r: HealthEducationRecord): void {
    if (!r.id || this.deletingId) return;
    if (!confirm(`确认删除 ${this.fmtDateTime(r.assessmentTime)} 的评估记录？`)) return;
    this.deletingId = r.id;
    const operationPid = this.pid;
    this.http.patch(`${this.API}/${r.id}/invalidate`, null, {params:{operatorId:String(this.account?.id || '')}}).pipe(
      finalize(()=>this.deletingId=''), takeUntil(this.destroy$)
    ).subscribe({
      next:()=>{ if(operationPid===this.pid) this.reload(); },
      error:()=>alert('删除失败')
    });
  }

  checked(r: HealthEducationRecord|null, code: string): string { return r?.itemCodes?.includes(code) ? '√' : ''; }
  get otherEducationSummary(): string { return this.records.filter(r=>!!r?.otherEducation?.trim()).map(r=>{const d=this.fmtMonthDay(r.assessmentTime);const t=this.fmtHourMinute(r.assessmentTime);return `${d} ${t}：${r.otherEducation!.trim()}`;}).join('；'); }
  itemDisplayText(r: HealthEducationRecord|null, code: string): string {
    if (!r?.itemCodes?.includes(code)) return '';
    switch (code) {
      case 'SPECIAL_OTHER': return r.specialMedicationOther ? '√ 其他：'+r.specialMedicationOther : '√';
      case 'EXAM_OTHER': return r.externalExamOther ? '√ 其它：'+r.externalExamOther : '√';
      case 'WARD_OTHER': return r.internalExamOther ? '√ 其它：'+r.internalExamOther : '√';
      case 'OTHER': return r.otherEducation ? '√ '+r.otherEducation : '√';
      default: return '√';
    }
  }
  valuableMark(r: HealthEducationRecord|null, code: string): string {
    return r?.valuableCodes?.includes(code) ? '☑' : '□';
  }
  has(arr: string[]|undefined, code: string): boolean { return !!arr?.includes(code); }
  toggle(field: 'itemCodes'|'evaluationCodes'|'valuableCodes', code: string, on: boolean): void {
    const set=new Set(this.form[field] || []); on ? set.add(code) : set.delete(code); this.form[field]=[...set];
  }
  targetMark(r: HealthEducationRecord|null, code: string): string {
    return r && (r.educationTarget===code || r.educationTarget==='AB') ? '√' : '';
  }
  evalText(r: HealthEducationRecord|null): string { return (r?.evaluationCodes || []).join('、'); }
  groupRows(g: OptionGroup): number { return g.items.length; }
  selectNurse(a: AccountOption): void { this.form.nurseId = a.accountId; this.form.nurseName = a.accountName; }
  onNurseInput(v: string): void { this.form.nurseName = v; const m = this.accounts.find(a => a.accountName===v.trim()); this.form.nurseId = m?.accountId || ''; }

  print(): void {
    const allSheets = Array.from(this.host.nativeElement.querySelectorAll('.sheet')) as HTMLElement[];
    if (!allSheets.length) { alert('没有可打印的表单'); return; }
    const sp = this.selectedPrintPage;
    if (sp !== null && (!Number.isInteger(sp) || sp < 1 || sp > this.pages.length)) { alert('选择的打印页码无效'); return; }
    let body = '';
    allSheets.forEach((s: HTMLElement, idx: number) => {
      if (sp !== null && idx + 1 !== sp) return;
      const c = s.cloneNode(true) as HTMLElement;
      c.querySelectorAll('.no-print').forEach(el => el.remove());
      body += '<section class="print-page">' + c.outerHTML + '</section>';
    });
    const css = `
      @page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}
      .print-page{box-sizing:border-box;width:210mm;height:297mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
      .print-page:last-child{page-break-after:auto;break-after:auto}
      .sheet{box-sizing:border-box;position:relative;width:210mm;min-height:297mm;margin:0;padding:8mm 8mm 14mm;box-shadow:none;background:#fff;color:#000;overflow:hidden}
      h1{margin:0 0 4px;text-align:center;font-family:SimHei,sans-serif;font-size:18pt}
      .patient-line{display:flex;justify-content:space-between;margin:2px 0 4px;font-family:'SimSun','宋体',serif;font-size:11pt;font-weight:400;color:#000}
      .patient-line strong{font-weight:700}
      .paper-table{width:100%;border-collapse:collapse;table-layout:fixed;font-family:'SimSun','宋体',serif;font-size:9pt;font-weight:400;line-height:1.2;color:#000;text-shadow:none!important;filter:none!important}
      .paper-table th,.paper-table td{box-sizing:border-box;border:1px solid #000;padding:2px 3px;vertical-align:middle;font-family:inherit;font-size:inherit;color:#000;background:transparent;text-shadow:none!important;filter:none!important}
      .paper-table th{font-weight:700}.paper-table td{font-weight:400}
      .paper-table col.category-column{width:20px}
      .paper-table col.content-column{width:auto}
      .paper-table col.record-column{width:46px}
      .paper-table .group{box-sizing:border-box;width:20px;min-width:20px;max-width:20px;padding:2px 1px;writing-mode:vertical-rl;text-orientation:upright;text-align:center;vertical-align:middle;white-space:normal;word-break:keep-all;font-size:9pt;font-weight:700;line-height:1.05;letter-spacing:0;color:#000}
      .paper-table .content{width:auto;padding:2px 4px;text-align:left;white-space:normal;word-break:normal;overflow-wrap:break-word}
      .paper-table .mark,.paper-table .time-cell,.paper-table .sign-cell{box-sizing:border-box;width:46px;min-width:46px;max-width:46px;padding:1px 2px;text-align:center;vertical-align:middle;white-space:normal;word-break:normal;font-size:9pt;font-weight:400;color:#000}
      .education-header{text-align:center;vertical-align:middle}
      .bottom-desc{text-align:left!important}
      .bottom-title{text-align:center}
      .other-summary-cell{padding:3px 5px!important;text-align:left;white-space:normal;word-break:normal;overflow-wrap:break-word;font-weight:400;line-height:1.3}
      .shared-info-cell,.handover-cell{padding:3px 5px!important;font-family:'SimSun','宋体',serif;font-size:9pt;font-weight:400;color:#000}
      .handover-cell .handover-content{display:grid;grid-template-columns:minmax(180px,1.2fr) minmax(160px,1fr) minmax(210px,1.2fr) auto;align-items:center;gap:8px 12px}
      .contact-cell{padding:3px 5px!important;text-align:center;font-family:'SimSun','宋体',serif;font-size:9pt;font-weight:400;line-height:1.2;color:#000}
      .time-date,.time-clock{display:block;text-align:center;white-space:nowrap;line-height:1.1}
      .sheet-pageno{position:absolute;left:8mm;right:8mm;bottom:5mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap}
      .no-print,.shared-screen-editor,.shared-actions{display:none!important}
      .other-summary-cell .no-print{display:none!important}
    `;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('打印窗口被拦截'); return; }
    win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+body+'</body></html>');
    win.document.close();
    const doPrint = () => {
      const s = win.document.querySelectorAll<HTMLElement>('.sheet');
      s.forEach(sh => { if(sh.scrollHeight>sh.clientHeight+1) console.warn('Overflow:',sh.scrollHeight-sh.clientHeight); });
      win.focus(); win.print();
    };
    const ready = () => { const d=win.document as any; if(d.fonts?.ready){ d.fonts.ready.then(()=>{requestAnimationFrame(()=>requestAnimationFrame(doPrint));}); } else { requestAnimationFrame(()=>requestAnimationFrame(doPrint)); } };
    win.addEventListener('afterprint', () => { try{win.close()}catch(e){} });
    if((win.document as any).readyState==='complete') ready(); else win.addEventListener('load', ready);
  }

  closeDialogs(): void { this.editListOpen=false; this.formOpen=false; this.errorText=''; }
  private emptySharedInfo(): HealthEducationSharedInfo { return {valuableCodes:[],valuableOther:'',receiverConfirmed:false,receiverName:'',receivedAt:''}; }
  private cloneSharedInfo(v:HealthEducationSharedInfo):HealthEducationSharedInfo { return {valuableCodes:[...v.valuableCodes],valuableOther:v.valuableOther,receiverConfirmed:v.receiverConfirmed,receiverName:v.receiverName,receivedAt:v.receivedAt}; }
  private hydrateSharedInfo():void{const s=[...this.records].reverse().find(r=>!!r.valuableCodes?.length||!!r.valuableOther?.trim()||r.receiverConfirmed===true||!!r.receiverName?.trim()||!!r.receivedAt)||this.records[this.records.length-1]||null;this.sharedCarrierRecord=s;this.sharedInfo={valuableCodes:[...(s?.valuableCodes||[])],valuableOther:s?.valuableOther||'',receiverConfirmed:s?.receiverConfirmed===true,receiverName:s?.receiverName||'',receivedAt:s?.receivedAt?this.toLocalInput(new Date(s.receivedAt)):''};this.sharedDraft=this.cloneSharedInfo(this.sharedInfo);}
  startSharedEdit():void{if(!this.sharedCarrierRecord){alert('请先新增一条健康教育评估记录');return;}this.sharedDraft=this.cloneSharedInfo(this.sharedInfo);this.sharedEditing=true;}
  cancelSharedEdit():void{this.sharedDraft=this.cloneSharedInfo(this.sharedInfo);this.sharedEditing=false;}
  toggleSharedValuable(code:string,checked:boolean):void{const s=new Set(this.sharedDraft.valuableCodes||[]);checked?s.add(code):s.delete(code);this.sharedDraft.valuableCodes=[...s];}
  saveSharedInfo():void{const c=this.sharedCarrierRecord;if(!c?.id||this.sharedSaving)return;const op=this.pid;this.sharedSaving=true;const b:HealthEducationRecord={...c,valuableCodes:[...(this.sharedDraft.valuableCodes||[])],valuableOther:this.sharedDraft.valuableOther?.trim()||'',receiverConfirmed:this.sharedDraft.receiverConfirmed===true,receiverName:this.sharedDraft.receiverName?.trim()||'',receivedAt:this.sharedDraft.receivedAt?new Date(this.sharedDraft.receivedAt).toISOString():undefined,updatedBy:String(this.account?.id||'')};this.http.post<HealthEducationRecord>(`${this.API}/save`,b).pipe(finalize(()=>{this.sharedSaving=false}),takeUntil(this.destroy$)).subscribe({next:()=>{if(op!==this.pid)return;this.sharedEditing=false;this.reload();},error:e=>alert(e?.error?.message||'贵重物品交接信息保存失败')});}
  private paginate(): void {
    const out: RenderPage[]=[]; const source=this.records.length?this.records:[null as any];
    for(let i=0;i<source.length;i+=5){const rows=(source.slice(i,i+5) as (HealthEducationRecord|null)[]); while(rows.length<5)rows.push(null); out.push({index:out.length+1,records:rows});}
    this.pages=out;
    if(this.selectedPrintPage!==null && this.selectedPrintPage>this.pages.length) this.selectedPrintPage=null;
  }
  private emptyForm(pid: string): HealthEducationRecord { return {pid,assessmentTime:'',itemCodes:[],educationTarget:'',evaluationCodes:[],nurseName:'',valuableCodes:[],receiverConfirmed:false,dischargeEducation:false,transferEducation:false}; }
  private loadAccounts(): void { this.http.get<AccountOption[]>('/api/v1/icu/accounts').pipe(takeUntil(this.destroy$)).subscribe({next:x=>this.accounts=Array.isArray(x)?x:[],error:()=>{}}); }
  private loadHospitalName(): void { this.http.get<any>('/api/v1/config/hospital').pipe(takeUntil(this.destroy$)).subscribe({next:x=>{if(x?.hospitalName)this.hospitalName=x.hospitalName;},error:()=>{}}); }
  fmtDateTime(v?: string): string { if(!v)return ''; const d=new Date(v); if(Number.isNaN(d.getTime()))return v; const p=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  fmtMonthDay(v?: string): string { if(!v)return ''; const d=new Date(v); if(Number.isNaN(d.getTime()))return ''; const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getMonth()+1)}-${p(d.getDate())}`; }
  fmtHourMinute(v?: string): string { if(!v)return ''; const d=new Date(v); if(Number.isNaN(d.getTime()))return ''; const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; }
  formatHandoverDate(v?: string): string { if(!v)return '____ 年 __ 月 __ 日'; const d=new Date(v); if(Number.isNaN(d.getTime()))return '____ 年 __ 月 __ 日'; const p=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()} 年 ${p(d.getMonth()+1)} 月 ${p(d.getDate())} 日`; }
  educationTargetText(r: HealthEducationRecord|null): string { if(!r)return ''; if(r.educationTarget==='A')return 'A'; if(r.educationTarget==='B')return 'B'; if(r.educationTarget==='AB')return 'A、B'; return ''; }
  private toLocalInput(d: Date): string { const p=(n:number)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
  private ts(v?:string):number { const t=v?new Date(v).getTime():0; return Number.isNaN(t)?0:t; }
  private calcAge(v?:string):number|null { if(!v)return null; const b=new Date(v); if(Number.isNaN(b.getTime()))return null; const n=new Date(); let a=n.getFullYear()-b.getFullYear(); if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--; return a>=0?a:null; }
}
