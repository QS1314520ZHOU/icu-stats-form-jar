import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';
import { databaseTimeValue, formatShanghaiMonthDay, formatShanghaiHourMinute } from './form-date.util';

interface BedsideRecord { pid: string|number; code: string; time: string; strVal?: string; valid: boolean|string|number; editUser?: string; }
interface PiccoMetric { label: string; normal: string; code: string; }
interface RenderPage { index: number; times: string[]; }
type SaveState = 'idle'|'saving'|'saved'|'error';

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
 private readonly API='/api/v1/icu/bedside';
 private readonly EXTRA='/api/v1/icu/picco-extra';
 private readonly destroy$=new Subject<void>();
 private readonly extraSave$=new Subject<void>();
 private readonly values=new Map<string,string>();
 private signatureRecords:Array<{time:string;instant:number;editUser:string}>=[];
 private accountNameMap=new Map<string,string>();
 readonly metrics=PICCO_METRICS;
 readonly metricCodes=PICCO_METRICS.map(x=>x.code);
 readonly queryCodes=Array.from(new Set([...this.metricCodes,'param_Yishi']));
 patient:any=null; account:any=null; pid=''; age:number|null=null; diagnosisDisplay='';
 loading=false; loadError=''; pages:RenderPage[]=[{index:1,times:[]}]; selectedPrintPage:number|null=null;
 insertionSide:''|'RIGHT'|'LEFT'=''; arteryName=''; catheterLengthCm:number|null=null; extraSaveState:SaveState='idle';
 constructor(private http:HttpClient,private hostPatient:HostPatientService,private cdr:ChangeDetectorRef){}
 ngOnInit():void{
  this.extraSave$.pipe(debounceTime(500),tap(()=>{this.extraSaveState='saving';this.cdr.detectChanges();}),switchMap(()=>this.http.post(`${this.EXTRA}/save`,{pid:this.pid,insertionSide:this.insertionSide,arteryName:this.arteryName.trim(),catheterLengthCm:this.catheterLengthCm,updatedBy:String(this.account?.id||this.account?._id||'')}).pipe(map(()=>true),catchError(()=>of(false)))),takeUntil(this.destroy$)).subscribe(ok=>{this.extraSaveState=ok?'saved':'error';this.cdr.detectChanges();});
  this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a=>this.account=a);
  this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p=>{if(!p?.id){this.reset();return;} const next=String(p.id).trim();this.patient=p;this.pid=next;this.age=this.calcAge(p.birthday);this.diagnosisDisplay=this.formatDiagnosis(p.clinicalDiagnosis);this.load();this.loadExtra();});
 }
 ngOnDestroy():void{this.destroy$.next();this.destroy$.complete();}
 private reset():void{this.pid='';this.patient=null;this.values.clear();this.signatureRecords=[];this.pages=[{index:1,times:[]}];}
 load():void{if(!this.pid)return;this.loading=true;this.loadError='';const params=new HttpParams().set('pid',this.pid).set('codes',this.queryCodes.join(','));this.http.get<BedsideRecord[]|{data:BedsideRecord[]}>(`${this.API}/listByPid`,{params}).pipe(takeUntil(this.destroy$)).subscribe({next:r=>{const src=Array.isArray(r)?r:(r.data||[]);this.build(src.filter(x=>x.valid===true&&String(x.pid)===this.pid));this.loading=false;this.cdr.detectChanges();},error:e=>{this.loadError=e?.error?.message||'PICCO记录加载失败';this.loading=false;this.build([]);this.cdr.detectChanges();}});}
 private build(records:BedsideRecord[]):void{this.values.clear();this.signatureRecords=[];const allowed=new Set(this.metricCodes);const timeSet=new Set<string>();records.forEach(r=>{const code=String(r.code||'').trim(),time=String(r.time||'').trim();if(code==='param_Yishi'){const user=String(r.editUser||'').trim();if(user){this.signatureRecords.push({time,instant:databaseTimeValue(time),editUser:user});}}else if(allowed.has(code)&&time){this.values.set(`${code}@@${time}`,String(r.strVal??''));timeSet.add(time);}});this.signatureRecords.sort((a,b)=>a.instant-b.instant);const times=[...timeSet].sort((a,b)=>databaseTimeValue(a)-databaseTimeValue(b));this.pages=[];for(let i=0;i<times.length;i+=8)this.pages.push({index:this.pages.length+1,times:times.slice(i,i+8)});if(!this.pages.length)this.pages=[{index:1,times:[]}];}
 metricValue(m:PiccoMetric,time?:string):string{return time?this.values.get(`${m.code}@@${time}`)||'':'';}
 signatureAt(time?:string):string{if(!time)return'';const target=databaseTimeValue(time);if(!Number.isFinite(target))return'';for(let i=this.signatureRecords.length-1;i>=0;i--){const s=this.signatureRecords[i];if(s.instant<=target&&s.editUser)return this.accountNameMap.get(s.editUser)||s.editUser;}return'';}
 private loadAccountNames(ids:string[]):void{if(!ids.length)return;const params=new HttpParams().set('ids',ids.join(','));this.http.get<any[]>('/api/v1/icu/accounts/listByIds',{params}).pipe(takeUntil(this.destroy$)).subscribe({next:rows=>{(Array.isArray(rows)?rows:[]).forEach(r=>{const id=String(r?.accountId??r?._id??r?.id??'').trim();const name=String(r?.accountName??r?.trueName??r?.name??'').trim();if(id&&name)this.accountNameMap.set(id,name);});this.cdr.detectChanges();},error:()=>{}});}
 timeAt(p:RenderPage,i:number):string|undefined{return p.times[i];}
 displayDate(v?:string):string{return formatShanghaiMonthDay(v);}
 displayClock(v?:string):string{return formatShanghaiHourMinute(v);}
 genderText(v:any):string{return ['Male','M','男','1'].includes(String(v))?'男':['Female','F','女','2'].includes(String(v))?'女':String(v??'');}
 onExtraChanged():void{if(this.pid){this.extraSaveState='idle';this.extraSave$.next();}}
 saveExtraNow():void{this.onExtraChanged();}
 private loadExtra():void{this.insertionSide='';this.arteryName='';this.catheterLengthCm=null;this.http.get<any>(`${this.EXTRA}/latest`,{params:{pid:this.pid}}).pipe(takeUntil(this.destroy$),catchError(()=>of(null))).subscribe(d=>{if(d?.valid===true){this.insertionSide=d.insertionSide||'';this.arteryName=d.arteryName||'';this.catheterLengthCm=d.catheterLengthCm??null;}this.cdr.detectChanges();});}
 print():void{window.print();}
 private calcAge(b:any):number|null{if(!b)return null;const d=new Date(b);if(isNaN(d.getTime()))return null;const n=new Date();let a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a;}
 private formatDiagnosis(d?:string):string{if(!d)return'';return d.split(/[;；,，]/)[0].trim();}
}
