import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, catchError, debounceTime, finalize, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';
import { IcuFormViewerContextService } from './icu-form-viewer-context.service';
import { databaseTimeValue, formatShanghaiMonthDay, formatShanghaiHourMinute, formatShanghaiDateMinute } from './form-date.util';
import { normalizePrintPages, shouldPrintPage } from './form-print-pages.util';
import { firstDiagnosisSegment, resolvePageDiagnosis } from './diagnosis-history.util';
import { DiagnosisHistoryService } from './diagnosis-history.service';

interface PiccoParamRecord { id?: string; pid: string; recordTime: string; values?: Record<string,string>; valid?: boolean; updatedBy?: string; }
interface PiccoMetric { label: string; normal: string; code: string; }
interface TimePoint { instant: number; rawTime: string; }
interface RenderPage { index: number; timePoints: TimePoint[]; diagnosis?: string; }
interface AccountOption { accountId: string; accountName: string; profession?: string; username?: string; code?: string; }
interface SignatureValue { accountId: string; accountName: string; }
type SaveState = 'idle'|'saving'|'saved'|'error';

/** 允许新增/编辑参数记录的账号 profession（医生/管理员/主任） */
const EDIT_PROFS = ['doctor', 'admin', 'director'];

const PICCO_METRICS: PiccoMetric[] = [
 {label:'MAP（平均动脉压）',normal:'70–90 mmHg',code:'param_MAP(平均动脉压)'},
 {label:'CVP（中心静脉压）',normal:'5–12 mmHg',code:'param_CVP(中心静脉压)'},
 {label:'HR（心率）',normal:'60–100 次/min',code:'param_HR(心率)'},
 {label:'CI（心输出量指数）',normal:'3.0–5.0 L/min/㎡',code:'param_CI(心输出量指数)'},
 {label:'dPmax（左心室收缩力指数）',normal:'1000–2000 mmHg/s',code:'param_dPmax(左心室收缩力指数)'},
 {label:'GEDI（全心舒张末期容积指数）',normal:'680–800 ml/㎡',code:'param_GEDI(全心舒张末期容积指数)'},
 {label:'SVI（每搏量指数）',normal:'40–60 ml/㎡',code:'param_SVI(每搏量指数)'},
 {label:'ELWI（血管外肺水指数）',normal:'3.0–7.0 ml/kg',code:'param_ELWI(血管外肺水指数)'},
 {label:'PVPI（肺血管通透性指数）',normal:'1.0–3.0',code:'param_PVPI(肺血管通透性指数)'},
 {label:'GEF（全心射血分数）',normal:'25–35%',code:'param_GEF(全心射血分数)'},
 {label:'SVRI（全身血管阻力指数）',normal:'1700–2400 dyn·s·cm⁻⁵·㎡',code:'param_SVRI(全身血管阻力指数)'},
 {label:'SVV（每搏量变异）',normal:'≤10%',code:'param_SVV(每搏量变异)'},
 {label:'TB（血液温度）',normal:'℃',code:'param_TB(血液温度)'},
 {label:'ITBI（胸腔内血容积指数）',normal:'850–1000 ml/㎡',code:'param_ITBI(胸腔内血容积指数)'},
 {label:'LCSWI（左心每搏作功指数）',normal:'50–62',code:'param_LCSWI(左心每搏作做功指数)'},
 {label:'CFI（心功能指数）',normal:'4.5–6.5 L/min',code:'param_CFI(心功能指数)'},
 {label:'被动抬腿试验',normal:'',code:'param_被动抬腿试验'},
];

@Component({selector:'app-picco-record',standalone:false,templateUrl:'./picco-record.component.html',styleUrls:['./picco-record.component.css']})
export class PiccoRecordComponent implements OnInit, OnDestroy {
 private readonly PARAMS='/api/v1/icu/picco-params';
 private readonly EXTRA='/api/v1/icu/picco-extra';
 private readonly destroy$=new Subject<void>();
 private readonly extraSave$=new Subject<void>();
 private readonly values=new Map<string,string>();
 private readonly signatures=new Map<string,SignatureValue>();
 readonly metrics=PICCO_METRICS;
 patient:any=null; account:any=null; pid=''; age:number|null=null; diagnosisDisplay='';
 loading=false; loadError=''; pages:RenderPage[]=[{index:1,timePoints:[]}]; selectedPrintPages:number[]=[]; printing=false;
 records:PiccoParamRecord[]=[]; recordListOpen=false; recordFormOpen=false; recordEditing=false; recordSaving=false; recordError=''; deletingId='';
 recordForm:{id?:string;recordTime:string;values:Record<string,string>;signatureId:string}={recordTime:'',values:{},signatureId:''};
 insertionSide:''|'RIGHT'|'LEFT'=''; arteryName=''; catheterLengthCm=''; heightCm=''; weightKg=''; extraSaveState:SaveState='idle';
 accounts:AccountOption[]=[];
 // Viewer 模式标志
 isViewerMode = false;

 constructor(private http:HttpClient,private hostPatient:HostPatientService,private cdr:ChangeDetectorRef,private contextService:IcuFormViewerContextService){}
 ngOnInit():void{
  // 检测 viewer 模式
  this.contextService.getContext$().pipe(
    takeUntil(this.destroy$),
  ).subscribe(ctx => {
    this.isViewerMode = ctx.isViewerMode;
    this.cdr.markForCheck();
  });

  this.extraSave$.pipe(debounceTime(500),tap(()=>{this.extraSaveState='saving';this.cdr.detectChanges();}),switchMap(()=>this.http.post(`${this.EXTRA}/save`,{pid:this.pid,insertionSide:this.insertionSide,arteryName:this.arteryName.trim(),catheterLengthCm:this.catheterLengthCm.trim(),heightCm:this.heightCm.trim(),weightKg:this.weightKg.trim(),signatures:[...this.signatures.entries()].map(([timeKey,s])=>({timeKey,accountId:s.accountId,accountName:s.accountName})),updatedBy:String(this.account?.id||this.account?._id||'')}).pipe(map(()=>true),catchError(()=>of(false)))),takeUntil(this.destroy$)).subscribe(ok=>{this.extraSaveState=ok?'saved':'error';this.cdr.detectChanges();});
  this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a=>this.account=a);
  this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p=>{if(!p?.id){this.reset();return;} const next=String(p.id).trim();this.patient=p;this.pid=next;this.closeParamDialogs();this.age=this.calcAge(p.birthday);this.diagnosisDisplay=this.formatDiagnosis(p.clinicalDiagnosis);this.load();this.loadExtra();});
  this.loadAccounts();
 }
 ngOnDestroy():void{this.destroy$.next();this.destroy$.complete();}
 private reset():void{this.pid='';this.patient=null;this.values.clear();this.signatures.clear();this.pages=[{index:1,timePoints:[]}];this.selectedPrintPages=[];this.records=[];this.closeParamDialogs();}
 load():void{
  if(!this.pid)return;this.loading=true;this.loadError='';
  this.http.get<PiccoParamRecord[]|{data:PiccoParamRecord[]}>(`${this.PARAMS}/listByPid`,{params:{pid:this.pid}}).pipe(takeUntil(this.destroy$)).subscribe({
   next:r=>{const src=Array.isArray(r)?r:(r.data||[]);this.build(src);this.loading=false;this.cdr.detectChanges();},
   error:e=>{this.loadError=e?.error?.message||'PICCO参数记录加载失败';this.loading=false;this.build([]);this.cdr.detectChanges();}});
 }
 private build(records:PiccoParamRecord[]):void{
  this.values.clear();
  this.records=(Array.isArray(records)?records:[]).filter(r=>!!r&&r.valid!==false)
   .slice().sort((a,b)=>databaseTimeValue(a.recordTime)-databaseTimeValue(b.recordTime));
  const timeMap=new Map<number,TimePoint>();
  this.records.forEach(r=>{
   const instant=databaseTimeValue(r.recordTime);
   if(!Number.isFinite(instant))return;
   if(!timeMap.has(instant))timeMap.set(instant,{instant,rawTime:String(r.recordTime??'')});
   const vals=r.values||{};
   Object.keys(vals).forEach(code=>{
    const val=String(vals[code]??'').trim();
    if(val)this.values.set(`${code}@@${instant}`,val);
   });
  });
  const timePoints=[...timeMap.values()].sort((a,b)=>a.instant-b.instant);
  this.pages=[];
  for(let i=0;i<timePoints.length;i+=8)this.pages.push({index:this.pages.length+1,timePoints:timePoints.slice(i,i+8)});
  if(!this.pages.length)this.pages=[{index:1,timePoints:[]}];
  this.normalizeSelectedPrintPages(this.pages.length);
 }
 metricValue(m:PiccoMetric,tp:TimePoint|undefined):string{return tp?this.values.get(`${m.code}@@${tp.instant}`)??'':'';}
 timeAt(p:RenderPage,i:number):TimePoint|undefined{return p.timePoints[i];}
 signatureNameAt(tp:TimePoint|undefined):string{return tp?(this.signatures.get(String(tp.instant))?.accountName||''):'';}
 /**
  * 穿刺部位 单选再点一次取消：
  * radio 原生不支持反选，preventDefault 拦掉原生选中，由模型驱动视觉状态。
  */
 onSideToggle(side:'RIGHT'|'LEFT',e:Event):void{
  e.preventDefault();
  this.insertionSide=this.insertionSide===side?'':side;
  this.onExtraChanged();
 }
 displayDate(tp:TimePoint|undefined):string{return tp?formatShanghaiMonthDay(tp.instant):'';}
 displayClock(tp:TimePoint|undefined):string{return tp?formatShanghaiHourMinute(tp.instant):'';}
 genderText(v:any):string{return['Male','M','男','1'].includes(String(v))?'男':['Female','F','女','2'].includes(String(v))?'女':String(v??'');}
 onExtraChanged():void{if(this.pid){this.extraSaveState='idle';this.extraSave$.next();}}
 saveExtraNow():void{this.onExtraChanged();}
 private loadExtra():void{this.insertionSide='';this.arteryName='';this.catheterLengthCm='';this.heightCm='';this.weightKg='';this.signatures.clear();this.http.get<any>(`${this.EXTRA}/latest`,{params:{pid:this.pid}}).pipe(takeUntil(this.destroy$),catchError(()=>of(null))).subscribe(d=>{if(d?.valid===true){this.insertionSide=d.insertionSide||'';this.arteryName=d.arteryName||'';this.catheterLengthCm=d.catheterLengthCm!=null?String(d.catheterLengthCm):'';this.heightCm=d.heightCm||'';this.weightKg=d.weightKg||'';(Array.isArray(d.signatures)?d.signatures:[]).forEach((s:any)=>{const key=String(s?.timeKey??'').trim();const accountId=String(s?.accountId??'').trim();if(key&&accountId)this.signatures.set(key,{accountId,accountName:String(s?.accountName??'')});});}this.cdr.detectChanges();});}
 private loadAccounts():void{
  const DOCTOR_PROFS=['director','doctor'];
  this.http.get<any[]>('/api/v1/icu/accounts').pipe(takeUntil(this.destroy$),catchError(()=>of([]))).subscribe(rows=>{
   const all=(Array.isArray(rows)?rows:[]).map(r=>({accountId:String(r?.accountId??r?._id??r?.id??'').trim(),accountName:String(r?.accountName??r?.trueName??r?.name??'').trim(),profession:String(r?.profession??'').trim(),username:String(r?.username??r?.loginName??'').trim(),code:String(r?.code??r?.jobNumber??'').trim()})).filter(a=>!!a.accountId&&!!a.accountName);
   this.accounts=all.filter(a=>DOCTOR_PROFS.includes((a.profession||'').toLowerCase()));
   // 账号列表晚于新增弹窗打开时，补一次默认签名（当前账号）
   if(this.recordFormOpen&&!this.recordEditing&&!this.recordForm.signatureId)this.recordForm.signatureId=this.defaultSignId();
   this.cdr.detectChanges();
  });
 }
 // ── 参数记录新增/编辑（仅 Doctor/Admin/Director 可点击，其他账号提示无权限） ──
 private canEditParams():boolean{return EDIT_PROFS.includes(String(this.account?.profession??'').trim().toLowerCase());}
 private ensureParamPermission():boolean{if(this.canEditParams())return true;alert('没有权限，仅医生账号可新增或编辑参数记录');return false;}
 /** 默认签名 = 当前账号；当前账号不在医生下拉列表里时返回空（展示空） */
 private defaultSignId():string{
  const cur=String(this.account?.accountId??this.account?.id??this.account?._id??'').trim();
  return cur&&this.accounts.some(a=>a.accountId===cur)?cur:'';
 }
 /** 按记录时间键写入/清除签名（签名经 picco-extra 持久化，随参数记录保存） */
 private applyRecordSignature(ms:number,signatureId:string):void{
  const key=String(ms);
  const id=String(signatureId??'').trim();
  if(!id){this.signatures.delete(key);return;}
  const acc=this.accounts.find(a=>a.accountId===id);
  if(acc)this.signatures.set(key,{accountId:acc.accountId,accountName:acc.accountName});
 }
 openCreateParam():void{
  if(!this.ensureParamPermission())return;
  if(!this.pid)return;
  this.recordEditing=false;this.recordError='';
  this.recordForm={recordTime:this.toLocalInput(new Date()),values:{},signatureId:this.defaultSignId()};
  this.recordFormOpen=true;
 }
 openEditParamList():void{
  if(!this.ensureParamPermission())return;
  if(!this.pid)return;
  this.recordError='';this.recordListOpen=true;
 }
 editParam(r:PiccoParamRecord):void{
  if(!this.ensureParamPermission())return;
  this.recordListOpen=false;this.recordEditing=true;this.recordError='';
  const ms=databaseTimeValue(r.recordTime);
  const existing=Number.isFinite(ms)?this.signatures.get(String(ms))?.accountId??'':'';
  this.recordForm={id:r.id,recordTime:this.toLocalInput(new Date(r.recordTime)),values:{...(r.values||{})},signatureId:existing||this.defaultSignId()};
  this.recordFormOpen=true;
 }
 saveParam():void{
  if(!this.ensureParamPermission())return;
  this.recordError='';
  const raw=this.recordForm.recordTime.trim();
  if(!raw){this.recordError='记录时间为必填项';return;}
  const ms=new Date(raw).getTime();
  if(Number.isNaN(ms)){this.recordError='记录时间格式不正确';return;}
  const values:Record<string,string>={};
  this.metrics.forEach(m=>{const v=String(this.recordForm.values[m.code]??'').trim();if(v)values[m.code]=v;});
  if(!Object.keys(values).length){this.recordError='请至少录入一项参数值';return;}
  const dup=this.records.find(r=>r.id!==this.recordForm.id&&databaseTimeValue(r.recordTime)===ms);
  if(dup){this.recordError='该时间点已存在参数记录，请通过编辑修改';return;}
  this.recordSaving=true;
  const body:{id?:string;pid:string;recordTime:string;values:Record<string,string>;updatedBy:string}=
   {pid:this.pid,recordTime:new Date(ms).toISOString(),values,updatedBy:String(this.account?.id??this.account?._id??'')};
  if(this.recordForm.id)body.id=this.recordForm.id;
  this.http.post<any>(`${this.PARAMS}/save`,body).pipe(finalize(()=>this.recordSaving=false),takeUntil(this.destroy$)).subscribe({
   next:()=>{
    // 编辑时记录时间被改动：签名从旧时间键迁走
    if(this.recordForm.id){
     const old=this.records.find(r=>r.id===this.recordForm.id);
     if(old){const oldMs=databaseTimeValue(old.recordTime);if(Number.isFinite(oldMs)&&oldMs!==ms)this.signatures.delete(String(oldMs));}
    }
    // 签名在弹窗里选择，随记录一起落库（走 picco-extra 的 signatures）
    this.applyRecordSignature(ms,this.recordForm.signatureId);
    this.extraSaveState='idle';this.extraSave$.next();
    this.recordFormOpen=false;this.load();
   },
   error:e=>{this.recordError=e?.error?.message||'保存失败，请稍后重试';}});
 }
 invalidateParam(r:PiccoParamRecord):void{
  if(!this.ensureParamPermission())return;
  if(!r.id||this.deletingId)return;
  if(!confirm(`确认删除 ${this.fmtRecordTime(r.recordTime)} 的参数记录？`))return;
  this.deletingId=r.id;
  const operationPid=this.pid;
  this.http.patch(`${this.PARAMS}/${r.id}/invalidate`,null,{params:{operatorId:String(this.account?.id??this.account?._id??'')}}).pipe(
   finalize(()=>this.deletingId=''),takeUntil(this.destroy$)).subscribe({
   next:()=>{
    if(operationPid!==this.pid)return;
    // 记录删除后同时清掉该时间点的签名，避免残留
    const ms=databaseTimeValue(r.recordTime);
    if(Number.isFinite(ms)&&this.signatures.delete(String(ms))){this.extraSaveState='idle';this.extraSave$.next();}
    this.load();
   },
   error:()=>alert('删除失败')});
 }
 closeParamDialogs():void{this.recordListOpen=false;this.recordFormOpen=false;this.recordError='';this.recordSaving=false;this.recordEditing=false;}
 fmtRecordTime(v?:string):string{return v?formatShanghaiDateMinute(v):'';}
 paramCount(r:PiccoParamRecord):number{return Object.values(r.values||{}).filter(v=>String(v??'').trim()).length;}
 private toLocalInput(d:Date):string{const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
 isPrintPageSelected(pageNumber:number,totalPages=this.pages.length):boolean{return shouldPrintPage(pageNumber,this.selectedPrintPages,totalPages);}
 private normalizeSelectedPrintPages(totalPages:number):void{const normalized=normalizePrintPages(this.selectedPrintPages,totalPages);this.selectedPrintPages=(normalized.length===totalPages&&totalPages>0)?[]:normalized;}
 print():void{this.printing=true;this.cdr.detectChanges();const afterPrint=()=>{this.printing=false;this.cdr.detectChanges();window.removeEventListener('afterprint',afterPrint);};window.addEventListener('afterprint',afterPrint);window.print();}
 private calcAge(b:any):number|null{if(!b)return null;const d=new Date(b);if(isNaN(d.getTime()))return null;const n=new Date();let a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a;}
 private formatDiagnosis(d?:string):string{if(!d)return'';return d.split(/[;；,，]/)[0].trim();}
}
