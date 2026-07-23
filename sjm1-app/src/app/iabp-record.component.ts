import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, catchError, debounceTime, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';

interface BedsideRecord { pid:string|number; code:string; time:string; strVal?:string; valid:boolean|string|number; }
interface IabpMetric { label:string; code:string; }
interface IabpGroup { name:string; metrics:IabpMetric[]; }
interface RenderPage { index:number; times:string[]; }
type SaveState='idle'|'saving'|'saved'|'error';

const IABP_GROUPS:IabpGroup[]=[
 {name:'监测数据',metrics:[
  {label:'心率',code:'param_iabp心率'},
  {label:'反搏压 mmHg',code:'param_反搏压'},
  {label:'收缩压 mmHg',code:'param_iabp收缩压'},
  {label:'舒张压 mmHg',code:'param_iabp舒张压'},
  {label:'平均动脉压 mmHg',code:'param_iabp平均压'},
 ]},
 {name:'参数设置',metrics:[
  {label:'操作模式（Q4H）',code:'param_触发模式'},
  {label:'触发信号（Q4H）',code:'param_触发信号'},
  {label:'压力调整（Q4H）',code:'param_压力调整'},
  {label:'反搏辅助频率（Q4H）',code:'param_反搏辅助频率'},
 ]},
 {name:'传感器',metrics:[
  {label:'导管冲洗与校零（Q4H）',code:'param_是否正确执行冲洗导管与校零'},
  {label:'压力波形规则（Q4H）',code:'param_压力波形是否规则'},
 ]},
 {name:'球囊导管',metrics:[
  {label:'球囊导管固定有效（Q4H）',code:'param_球囊导管固定是否有效'},
  {label:'球囊导管内无回血（Q4H）',code:'param_球囊导管内有无回血'},
 ]},
 {name:'左上肢',metrics:[
  {label:'左上肢桡动脉搏动（Q4H）',code:'param_左上肢是否可扪及桡动脉搏动'},
  {label:'左上肢远端情况（Q4H）',code:'param_左上肢远端肢体有无紫绀及肿胀'},
 ]},
 {name:'穿刺侧肢体',metrics:[
  {label:'穿刺点情况（Q4H）',code:'param_置入/外露长度'},
  {label:'穿刺侧肢体远端搏动（Q4H）',code:'param_穿刺侧肢体远端动脉搏动是否可扪及'},
  {label:'穿刺侧肢体远端情况（Q4H）',code:'param_穿刺侧肢体远端肢体有无紫绀及肿胀'},
 ]},
 {name:'其它',metrics:[{label:'氮气瓶压力充足（Q4H）',code:'param_氮气瓶压力是否充足'}]},
];

@Component({selector:'app-iabp-record',standalone:false,templateUrl:'./iabp-record.component.html',styleUrls:['./iabp-record.component.css']})
export class IabpRecordComponent implements OnInit,OnDestroy{
 private readonly API='/api/v1/icu/bedside';
 private readonly EXTRA='/api/v1/icu/iabp-extra';
 private readonly destroy$=new Subject<void>();
 private readonly extraSave$=new Subject<void>();
 private readonly values=new Map<string,string>();
 readonly groups=IABP_GROUPS;
 readonly codes=IABP_GROUPS.flatMap(g=>g.metrics.map(m=>m.code));
 readonly columnIndexes=[0,1,2,3,4,5,6,7,8,9,10];
 patient:any=null;account:any=null;pid='';age:number|null=null;diagnosisDisplay='';
 loading=false;loadError='';pages:RenderPage[]=[{index:1,times:[]}];selectedPrintPage:number|null=null;
 insertionSite:'RIGHT_FEMORAL'|'LEFT_FEMORAL'|'OTHER'|''='';otherArtery='';catheterLengthCm:number|null=null;extraSaveState:SaveState='idle';
 constructor(private http:HttpClient,private hostPatient:HostPatientService,private cdr:ChangeDetectorRef){}
 ngOnInit():void{
  this.extraSave$.pipe(debounceTime(500),tap(()=>{this.extraSaveState='saving';this.cdr.detectChanges();}),switchMap(()=>this.http.post(`${this.EXTRA}/save`,{pid:this.pid,insertionSite:this.insertionSite,otherArtery:this.otherArtery.trim(),catheterLengthCm:this.catheterLengthCm,updatedBy:String(this.account?.id||this.account?._id||'')}).pipe(map(()=>true),catchError(()=>of(false)))),takeUntil(this.destroy$)).subscribe(ok=>{this.extraSaveState=ok?'saved':'error';this.cdr.detectChanges();});
  this.hostPatient.account$.pipe(takeUntil(this.destroy$)).subscribe(a=>this.account=a);
  this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(p=>{if(!p?.id){this.reset();return;}this.patient=p;this.pid=String(p.id).trim();this.age=this.calcAge(p.birthday);this.diagnosisDisplay=this.formatDiagnosis(p.clinicalDiagnosis);this.load();this.loadExtra();});
 }
 ngOnDestroy():void{this.destroy$.next();this.destroy$.complete();}
 private reset():void{this.pid='';this.patient=null;this.values.clear();this.pages=[{index:1,times:[]}];}
 load():void{if(!this.pid)return;this.loading=true;this.loadError='';const params=new HttpParams().set('pid',this.pid).set('codes',this.codes.join(','));this.http.get<BedsideRecord[]|{data?:BedsideRecord[]}>(`${this.API}/listByPid`,{params}).pipe(takeUntil(this.destroy$)).subscribe({next:r=>{const src=Array.isArray(r)?r:(r.data||[]);this.build(src.filter(x=>x.valid===true&&String(x.pid)===this.pid));this.loading=false;this.cdr.detectChanges();},error:e=>{this.loadError=e?.error?.message||'IABP记录加载失败';this.loading=false;this.build([]);this.cdr.detectChanges();}});}
 private build(records:BedsideRecord[]):void{this.values.clear();const allowed=new Set(this.codes);const timeSet=new Set<string>();records.forEach(r=>{const code=String(r.code||'').trim(),time=String(r.time||'').trim();if(allowed.has(code)&&time){this.values.set(`${code}@@${time}`,String(r.strVal??''));timeSet.add(time);}});const times=[...timeSet].sort((a,b)=>new Date(a).getTime()-new Date(b).getTime());this.pages=[];for(let i=0;i<times.length;i+=11)this.pages.push({index:this.pages.length+1,times:times.slice(i,i+11)});if(!this.pages.length)this.pages=[{index:1,times:[]}];}
 metricValue(m:IabpMetric,time?:string):string{return time?this.values.get(`${m.code}@@${time}`)||'':'';}
 timeAt(p:RenderPage,i:number):string|undefined{return p.times[i];}
 signatureAt(time?:string):string{return time?String(this.account?.trueName||''):'';}
 displayDate(v?:string):string{const d=v?new Date(v):null;return d&&!isNaN(d.getTime())?`${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';}
 displayClock(v?:string):string{const d=v?new Date(v):null;return d&&!isNaN(d.getTime())?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'';}
 genderText(v:any):string{return ['Male','M','男','1'].includes(String(v))?'男':['Female','F','女','2'].includes(String(v))?'女':String(v??'');}
 onExtraChanged():void{if(this.pid){this.extraSaveState='idle';this.extraSave$.next();}}
 saveExtraNow():void{this.onExtraChanged();}
 private loadExtra():void{this.insertionSite='';this.otherArtery='';this.catheterLengthCm=null;this.http.get<any>(`${this.EXTRA}/latest`,{params:{pid:this.pid}}).pipe(takeUntil(this.destroy$),catchError(()=>of(null))).subscribe(d=>{if(d?.valid===true){this.insertionSite=d.insertionSite||'';this.otherArtery=d.otherArtery||'';this.catheterLengthCm=d.catheterLengthCm??null;}this.cdr.detectChanges();});}
 print():void{window.print();}
 private calcAge(v:any):number|null{if(!v)return null;const d=new Date(v);if(isNaN(d.getTime()))return null;const n=new Date();let a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a;}
 private formatDiagnosis(v?:string):string{return v?v.split(/[;；,，]/)[0].trim():'';}
}
