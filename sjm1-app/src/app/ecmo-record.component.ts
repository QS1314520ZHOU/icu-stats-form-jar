import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { HostPatientService } from './services/host-patient.service';

interface BedsideRecord {
  id?: string;
  pid: string;
  code: string;
  time: string;
  strVal?: string;
  valid: boolean;
  editUser?: string;
  editTime?: string;
}

interface EcmoMetric {
  label: string;
  code: string;
}

interface EcmoGroup {
  name: string;
  metrics: EcmoMetric[];
}

interface RenderPage {
  index: number;
  times: string[];
}

const ECMO_GROUPS: EcmoGroup[] = [
  {
    name: 'ECMO相关参数',
    metrics: [
      { label: '治疗模式', code: 'param_ECMOMoShi' },
      { label: '治疗状态', code: 'param_治疗状态' },
      { label: '血流量（L/min）', code: 'param_ECMO_xueLiuLiang' },
      { label: '转速', code: 'param_ECMO_IXinBengZhuanSu' },
      { label: '气流量（L/min）', code: 'param_ECMO_QiLiuLiang' },
      { label: 'FiO₂(%)', code: 'param_ECMO_FiO2' },
      { label: '血温℃', code: 'param_bg_Temp' },
      { label: '设置水温℃', code: 'param_ShuiXiangTemp_set' },
      { label: '实际水温℃', code: 'param_ShuiXiangTemp_act' },
      { label: 'P泵前（mmHg）', code: 'param_P_Beng_MoQian_MoHou' },
      { label: 'P膜前（mmHg）', code: 'param_P膜前' },
      { label: 'P膜后（mmHg）', code: 'param_P膜后' },
    ],
  },
  {
    name: '抗凝适用和凝血指标',
    metrics: [
      { label: '抗凝剂（IU）', code: 'param_抗凝剂' },
      { label: '抗凝剂首剂（IU）', code: 'param_抗凝剂首剂' },
      { label: '抗凝剂维持剂量（IU）', code: 'param_抗凝剂维持量' },
      { label: 'ACT(S)', code: 'param_ACTs' },
      { label: 'APTT(S)', code: 'param_ECMO_aPTT' },
    ],
  },
  {
    name: '侧支循环',
    metrics: [
      { label: '是否建立侧支循环', code: 'param_是否建立侧支循环' },
      { label: '远端灌注管血流', code: 'param_远端灌注管血流' },
    ],
  },
  {
    name: '穿刺部位及肢体观察',
    metrics: [
      { label: '引血端置入部位', code: 'param_引血端置入部位' },
      { label: '引血端导管深度（cm）', code: 'param_引血端导管深度' },
      { label: '回血端置入部位', code: 'param_回血端置入部位' },
      { label: '导管置入深度（cm）', code: 'param_导管置入深度' },
      { label: '穿刺部位情况', code: 'param_穿刺部位情况' },
      { label: '远端肢体观察', code: 'param_远端肢体观察' },
    ],
  },
  {
    name: '设备运行观察',
    metrics: [
      { label: '设备运行正常', code: 'param_设备运行正常' },
      { label: '外部管路抖动情况', code: 'param_外部管路抖动情况' },
      { label: '管路有无气泡', code: 'param_管路有无气泡' },
      { label: '管路及膜肺凝血块观察', code: 'param_管路及膜肺凝血块观察' },
    ],
  },
  {
    name: '血气指标',
    metrics: [
      { label: 'PH', code: 'param_lis_xueQi_PH' },
      { label: 'PaO₂(mmHg)', code: 'param_lis_xueQi_PaO2' },
      { label: 'PaCO₂(mmHg)', code: 'param_PaCO2' },
      { label: 'HCO₃⁻（mmol/L）', code: 'param_bg_HCO3-' },
      { label: 'Lac（mmol/L）', code: 'param_bg_Lac' },
      { label: 'BE（mmol/L）', code: 'param_bg_BE' },
      { label: 'SaO₂(%)', code: 'param_SaO2' },
    ],
  },
];

@Component({
  standalone: false,
  selector: 'app-ecmo-record',
  templateUrl: './ecmo-record.component.html',
  styleUrls: ['./ecmo-record.component.css'],
})
export class EcmoRecordComponent implements OnInit, OnDestroy {
  private readonly API = '/api/v1/icu/bedside';
  private readonly destroy$ = new Subject<void>();
  private readonly values = new Map<string, string>();

  readonly groups = ECMO_GROUPS;
  readonly codes = ECMO_GROUPS.flatMap(group =>
    group.metrics.map(metric => metric.code),
  );

  patient: any = null;
  pid = '';
  age: number | null = null;

  loading = false;
  loadError = '';
  records: BedsideRecord[] = [];
  pages: RenderPage[] = [{ index: 1, times: [] }];
  selectedPrintPage: number | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly hostPatient: HostPatientService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.hostPatient.patient$
      .pipe(takeUntil(this.destroy$))
      .subscribe(patient => {
        if (!patient?.id) return;

        const nextPid = String(patient.id).trim();
        if (!nextPid) return;

        this.patient = patient;
        this.age = this.calculateAge(patient.birthday);

        if (nextPid !== this.pid) {
          this.pid = nextPid;
          this.load();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    if (!this.pid) return;

    this.loading = true;
    this.loadError = '';

    const params = new HttpParams()
      .set('pid', this.pid)
      .set('codes', this.codes.join(','));

    this.http
      .get<BedsideRecord[]>(`${this.API}/listByPid`, { params })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: records => {
          this.records = (Array.isArray(records) ? records : []).filter(
            record =>
              record.valid === true &&
              record.pid === this.pid &&
              this.codes.includes(record.code),
          );

          this.buildValueMap();
          this.buildPages();
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: error => {
          this.records = [];
          this.values.clear();
          this.pages = [{ index: 1, times: [] }];
          this.loading = false;
          this.loadError =
            error?.error?.message || 'ECMO运行记录加载失败，请稍后重试';
          this.cdr.detectChanges();
        },
      });
  }

  cellValue(code: string, time: string | undefined): string {
    if (!time) return '';
    return this.values.get(this.valueKey(code, time)) || '';
  }

  displayTime(time: string | undefined): string {
    if (!time) return '';
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return time;
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  timeAt(page: RenderPage, index: number): string | undefined {
    return page.times[index];
  }

  print(): void {
    const sheets = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('.sheet'),
    );
    if (!sheets.length) { alert('没有可打印的表单'); return; }
    if (this.selectedPrintPage !== null && (this.selectedPrintPage < 1 || this.selectedPrintPage > this.pages.length)) {
      alert('选择的打印页码无效'); return;
    }

    let body = '';
    sheets.forEach((sheet, index) => {
      if (this.selectedPrintPage !== null && index + 1 !== this.selectedPrintPage) return;
      const clone = sheet.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.no-print').forEach(node => node.remove());
      body += `<div class="print-page">${clone.outerHTML}</div>`;
    });

    const componentStyles = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent || '')
      .join('\n');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { alert('打印窗口被拦截，请允许弹出窗口'); return; }

    printWindow.document.write(`
      <!doctype html>
      <html lang="zh-CN">
        <head><meta charset="utf-8"><title>ECMO运行护理记录单</title>
        <style>${componentStyles}</style>
        <style>
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; padding: 0; background: #fff; }
          .no-print { display: none !important; }
          .print-page { width: 210mm; height: 297mm; margin: 0; overflow: hidden; break-after: page; page-break-after: always; }
          .print-page:last-child { break-after: auto; page-break-after: auto; }
          .sheet { margin: 0 !important; box-shadow: none !important; }
        </style></head>
        <body>${body}</body>
      </html>
    `);
    printWindow.document.close();

    const runPrint = () => {
      const doc: any = printWindow.document;
      const ready = doc.fonts?.ready ? doc.fonts.ready : Promise.resolve();
      ready.then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            printWindow.document.querySelectorAll<HTMLElement>('.sheet').forEach((sheet, index) => {
              if (sheet.scrollHeight > sheet.clientHeight + 1) {
                console.warn(`第${index + 1}页内容溢出`, sheet.scrollHeight - sheet.clientHeight);
              }
            });
            printWindow.focus();
            printWindow.print();
          });
        });
      });
    };

    if (printWindow.document.readyState === 'complete') runPrint();
    else printWindow.addEventListener('load', runPrint, { once: true });
    printWindow.addEventListener('afterprint', () => { try { printWindow.close(); } catch { /* ignore */ } }, { once: true });
  }

  private buildValueMap(): void {
    this.values.clear();
    const ordered = [...this.records].sort(
      (a, b) =>
        this.toTimestamp(a.time) - this.toTimestamp(b.time) ||
        this.toTimestamp(a.editTime) - this.toTimestamp(b.editTime),
    );
    for (const record of ordered) {
      if (!record.code || !record.time) continue;
      this.values.set(this.valueKey(record.code, record.time), String(record.strVal ?? ''));
    }
  }

  private buildPages(): void {
    const uniqueTimes = Array.from(
      new Set(this.records.map(record => String(record.time || '').trim()).filter(Boolean)),
    ).sort((a, b) => this.toTimestamp(a) - this.toTimestamp(b));

    if (!uniqueTimes.length) {
      this.pages = [{ index: 1, times: [] }];
      this.selectedPrintPage = null;
      return;
    }

    const pages: RenderPage[] = [];
    for (let index = 0; index < uniqueTimes.length; index += 8) {
      pages.push({ index: pages.length + 1, times: uniqueTimes.slice(index, index + 8) });
    }
    this.pages = pages;
    this.selectedPrintPage = null;
  }

  private valueKey(code: string, time: string): string { return `${code} ${time}`; }

  private toTimestamp(value?: string): number {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private calculateAge(birthday?: string): number | null {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    if (Number.isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const birthdayNotReached =
      today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
    if (birthdayNotReached) age -= 1;
    return age >= 0 ? age : null;
  }
}
