import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, catchError, debounceTime, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';
import { IcuFormViewerContextService } from './icu-form-viewer-context.service';
import { databaseTimeValue, formatShanghaiMonthDay, formatShanghaiHourMinute } from './form-date.util';
import { normalizePrintPages, shouldPrintPage } from './form-print-pages.util';

interface BedsideRecord { pid: string|number; code: string; time: string; strVal?: string; valid: boolean|string|number; }
interface PiccoMetric { label: string; normal: string; code: string; }
interface TimePoint { instant: number; rawTime: string; }
interface RenderPage { index: number; timePoints: TimePoint[]; }
interface AccountOption { accountId: string; accountName: string; profession?: string; username?: string; code?: string; }
interface SignatureValue { accountId: string; accountName: string; }
type SaveState = 'idle'|'saving'|'saved'|'error';

const PICCO_METRICS: PiccoMetric[] = [
 {label:'MAP（平均动脉压）',normal:'70–90 mmHg',code:'param_MAP(平均动脉压)'},
 {label:'CVP（中心静脉压）',normal:'5–12 mmHg',code:'param_CVP(中心静脉压)'},
 {label:'HR（心率）',normal:'60–100 次/min',code:'param_HR(心率)'},
 {label:'CI（心输出量指数）',normal:'3.0–5.0 L/min/㎡',code:'param_CCI'},
 {label:'dPmax（左心室收缩力指数）',normal:'1000–2000 mmHg/s',code:'param_dPmx'},
 {label:'GEDI（全心舒张末期容积指数）',normal:'680–800 ml/㎡',code:'param_GEDI'},
 {label:'SVI（每搏量指数）',normal:'40–60 ml/㎡',code:'param_SVI'},
 {label:'ELWI（血管外肺水指数）',normal:'3.0–7.0 ml/kg',code:'param_ELWI'},
 {label:'PVPI（肺血管通透性指数）',normal:'1.0–3.0',code:'param_PVPI'},
 {label:'GEF（全心射血分数）',normal:'25–35%',code:'param_GEF'},
 {label:'SVRI（全身血管阻力指数）',normal:'1700–2400 dyn·s·cm⁻⁵·㎡',code:'param_SVRI'},
 {label:'SVV（每搏量变异）',normal:'≤10%',code:'param_SVV'},
 {label:'TB（血液温度）',normal:'℃',code:'param_TB'},
 {label:'ITBI（胸腔内血容积指数）',normal:'850–1000 ml/㎡',code:'param_ITBI'},
 {label:'LCSWI（左心每搏作功指数）',normal:'50–62',code:'param_LCSWI(左心每搏作做功指数)'},
 {label:'CFI（心功能指数）',normal:'4.5–6.5 L/min',code:'param_CFI'},
 {label:'被动抬腿试验',normal:'',code:'param_被动抬腿试验'},
];

@Component({selector:'app-picco-record',standalone:false,templateUrl:'./picco-record.component.html',styleUrls:['./picco-record.component.css']})
export class PiccoRecordComponent implements OnInit, OnDestroy {
 private readonly API='/api/v1/icu/bedside';
 private readonly EXTRA='/api/v1/icu/picco-extra';
 private readonly destroy$=new Subject<void>();
 private readonly extraSave$=new Subject<void>();
 private readonly values=new Map<string,string>();
 private readonly signatures=new Map<string,SignatureValue>();
 readonly metrics=PICCO_METRICS;
 readonly metricCodes=PICCO_METRICS.map(x=>x.code);
 readonly queryCodes=[...this.metricCodes];
 patient:any=null; account:any=null; pid=''; age:number|null=null; diagnosisDisplay='';
 loading=false; loadError=''; pages:RenderPage[]=[{index:1,timePoints:[]}]; selectedPrintPages:number[]=[]; printing=false;
 insertionSide:''|'RIGHT'|'LEFT'=''; arteryName=''; catheterLengthCm=''; heightCm=''; weightKg=''; extraSaveState:SaveState='idle';
 accounts:AccountOption[]=[]; signFiltered:AccountOption[]=[]; signQuery=''; signDropdownOpen=false; private signEditKey:string|null=null; private signCloseToken=0;
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
  this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p=>{if(!p?.id){this.reset();return;} const next=String(p.id).trim();this.patient=p;this.pid=next;this.age=this.calcAge(p.birthday);this.diagnosisDisplay=this.formatDiagnosis(p.clinicalDiagnosis);this.load();this.loadExtra();});
  this.loadAccounts();
 }
 ngOnDestroy():void{this.destroy$.next();this.destroy$.complete();}
 private reset():void{this.pid='';this.patient=null;this.values.clear();this.signatures.clear();this.signDropdownOpen=false;this.signEditKey=null;this.signQuery='';this.pages=[{index:1,timePoints:[]}];this.selectedPrintPages=[];}
 load():void{
  if(!this.pid)return;this.loading=true;this.loadError='';
  const params=new HttpParams().set('pid',this.pid).set('codes',this.queryCodes.join(','));
  this.http.get<BedsideRecord[]|{data:BedsideRecord[]}>(`${this.API}/listByPid`,{params}).pipe(takeUntil(this.destroy$)).subscribe({
   next:r=>{const src=Array.isArray(r)?r:(r.data||[]);this.build(src);this.loading=false;this.cdr.detectChanges();},
   error:e=>{this.loadError=e?.error?.message||'PICCO记录加载失败';this.loading=false;this.build([]);this.cdr.detectChanges();}});
 }
 private build(records:BedsideRecord[]):void{
  this.values.clear();
  const metricSet=new Set(this.metricCodes);
  const timeMap=new Map<number,TimePoint>();
  records.forEach(r=>{
   const pid=String(r.pid??'').trim(),code=String(r.code??'').trim(),time=String(r.time??'').trim();
   const ok=r.valid===true||r.valid===1||r.valid==='1'||String(r.valid).toLowerCase()==='true';
   if(!ok||pid!==this.pid||!code||!time)return;
   const instant=databaseTimeValue(time);
   if(!Number.isFinite(instant))return;
   if(metricSet.has(code)){
    const val=String(r.strVal??'').trim();
    if(!val)return;
    if(!timeMap.has(instant))timeMap.set(instant,{instant,rawTime:time});
    this.values.set(`${code}@@${instant}`,val);
   }
  });
  const timePoints=[...timeMap.values()].sort((a,b)=>a.instant-b.instant);
  this.pages=[];
  for(let i=0;i<timePoints.length;i+=8)this.pages.push({index:this.pages.length+1,timePoints:timePoints.slice(i,i+8)});
  if(!this.pages.length)this.pages=[{index:1,timePoints:[]}];
  this.normalizeSelectedPrintPages(this.pages.length);
 }
 metricValue(m:PiccoMetric,tp:TimePoint|undefined):string{return tp?this.values.get(`${m.code}@@${tp.instant}`)??'':'';}
 timeAt(p:RenderPage,i:number):TimePoint|undefined{return p.timePoints[i];}
 hasColumnData(tp:TimePoint|undefined):boolean{
  if(!tp)return false;
  for(const m of this.metrics){const v=this.values.get(`${m.code}@@${tp.instant}`);if(v!=null&&v!=='')return true;}
  return false;
 }
 signKey(tp:TimePoint|undefined):string{return tp?String(tp.instant):'';}
 isSignEditing(tp:TimePoint|undefined):boolean{return !!tp&&this.signEditKey===String(tp.instant);}
 signInputAt(tp:TimePoint|undefined):string{return this.isSignEditing(tp)?this.signQuery:this.signatureNameAt(tp);}
 signatureNameAt(tp:TimePoint|undefined):string{return tp?(this.signatures.get(String(tp.instant))?.accountName||''):'';}
 openSignDropdown(tp:TimePoint|undefined):void{if(!tp)return;this.signCloseToken++;this.signEditKey=String(tp.instant);this.signQuery=this.signatureNameAt(tp);this.signFiltered=this.accounts.slice(0,20);this.signDropdownOpen=true;}
 onSignSearch(tp:TimePoint|undefined,value:string):void{if(!tp)return;this.signEditKey=String(tp.instant);this.signQuery=value;const keyword=value.trim().toLowerCase();this.signFiltered=this.accounts.filter(a=>!keyword||[a.accountName,a.username,a.code].some(f=>String(f||'').toLowerCase().includes(keyword))).slice(0,20);this.signDropdownOpen=true;}
 selectSignDoctor(tp:TimePoint|undefined,account:AccountOption):void{if(!tp)return;this.signatures.set(String(tp.instant),{accountId:account.accountId,accountName:account.accountName});this.signQuery=account.accountName;this.signDropdownOpen=false;this.signEditKey=null;this.onExtraChanged();}
 clearSign(tp:TimePoint|undefined):void{if(!tp)return;this.signatures.delete(String(tp.instant));this.signQuery='';this.signDropdownOpen=false;this.signEditKey=null;this.onExtraChanged();}
 closeSignDropdownLater():void{const token=++this.signCloseToken;window.setTimeout(()=>{if(token!==this.signCloseToken)return;this.signDropdownOpen=false;this.signEditKey=null;},150);}
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
   this.signFiltered=this.accounts.slice(0,20);
   this.cdr.detectChanges();
  });
 }
 isPrintPageSelected(pageNumber:number,totalPages=this.pages.length):boolean{return shouldPrintPage(pageNumber,this.selectedPrintPages,totalPages);}
 private normalizeSelectedPrintPages(totalPages:number):void{const normalized=normalizePrintPages(this.selectedPrintPages,totalPages);this.selectedPrintPages=(normalized.length===totalPages&&totalPages>0)?[]:normalized;}
 print():void{this.printing=true;this.cdr.detectChanges();const afterPrint=()=>{this.printing=false;this.cdr.detectChanges();window.removeEventListener('afterprint',afterPrint);};window.addEventListener('afterprint',afterPrint);window.print();}
 private calcAge(b:any):number|null{if(!b)return null;const d=new Date(b);if(isNaN(d.getTime()))return null;const n=new Date();let a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a;}
 private formatDiagnosis(d?:string):string{if(!d)return'';return d.split(/[;；,，]/)[0].trim();}
}
