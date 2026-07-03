import {
  AfterViewInit,
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Subscription } from 'rxjs';
import { HostPatientService } from '../../services/host-patient.service';
import { IcuApiService } from '../../services/icu-api.service';
import { applyA4Pagination, refineFirstPageGapOnce } from '../../utils/a4-pagination.helper';
import { formatBackendDateTime, parseBackendDateTime } from '../../utils/icu-datetime';

export interface CvcRow {
  id: string;
  time: Date;
  bp: string;
  hr: number | null;
  cvp: number | null;
  depth: number | null;
  punctureSite: string;
  dressing: string;
  patency: string;
  proneStatus: string;
  complications: string;
  nurseSignature: string;
  nurseAccountId: string;
}

function buildCvcCatheterStatus(r: CvcRow): string {
  return [
    `深度:${r.depth ?? ''}`,
    `穿刺点:${r.punctureSite ?? ''}`,
    `通畅:${r.patency ?? ''}`,
    `俯卧:${r.proneStatus ?? ''}`,
    `BP:${r.bp ?? ''}`,
    `HR:${r.hr ?? ''}`,
    `并发症:${r.complications ?? ''}`,
  ].join(';');
}

function parseCvcCatheterStatus(s: string): Partial<CvcRow> {
  const o: Partial<CvcRow> = {};
  if (!s) {
    return o;
  }
  for (const seg of s.split(';')) {
    const i = seg.indexOf(':');
    if (i < 0) {
      continue;
    }
    const k = seg.slice(0, i);
    const v = seg.slice(i + 1).trim();
    if (k.includes('深度')) {
      o.depth = v === '' ? null : Number(v);
    }
    if (k.includes('穿刺点')) {
      o.punctureSite = v;
    }
    if (k.includes('通畅')) {
      o.patency = v;
    }
    if (k.includes('俯卧')) {
      o.proneStatus = v;
    }
    if (k === 'BP' || k.includes('BP')) {
      o.bp = v;
    }
    if (k === 'HR' || k.includes('HR')) {
      o.hr = v === '' ? null : Number(v);
    }
    if (k.includes('并发症')) {
      o.complications = v;
    }
  }
  return o;
}

@Component({
  selector: 'app-cvc',
  templateUrl: './cvc.component.html',
  styleUrls: ['./cvc.component.scss'],
})
export class CvcComponent implements OnInit, AfterViewInit, OnDestroy {
  /** 主表列宽（与表头顺序一致，约 624px，与 A4 可印宽度匹配） */
  readonly cvcWidthConfig: readonly string[] = [
    '42px', // 时间
    '88px', // 生命体征 (BP/HR)
    '56px', // CVP (cmH2O)
    '56px', // 导管置入深度
    '68px', // 穿刺点情况
    '56px', // 敷料情况
    '56px', // 导管通畅度
    '72px', // 俯卧位通气状态
    '72px', // 并发症观察
    '58px', // 护士签名
  ];

  currentDate = new Date();
  /** 文档级：导管类型、置管部位（与行内「穿刺点情况」punctureSite 区分，表单用 docPunctureSite） */
  docInfo = { catheterType: '三腔中心静脉导管', punctureSite: '右侧颈内静脉' };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: CvcRow[] = [];
  pagedRecords: CvcRow[][] = [[]];
  measureSample: CvcRow[] = [];
  private documentId: string | null = null;
  private loadedDocIds: string[] = [];
  private readonly sub = new Subscription();
  private refineGapPass = 0;
  private effectiveRowsPerPage = 24;

  private readonly onSmartcarePostPrint = (): void => {
    this.ngZone.run(() => this.schedulePaginate());
  };

  constructor(
    private readonly fb: FormBuilder,
    private readonly message: NzMessageService,
    readonly hostPatient: HostPatientService,
    private readonly api: IcuApiService,
    private readonly ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.recordForm = this.fb.group({
      docCatheterType: [this.docInfo.catheterType],
      docPunctureSite: [this.docInfo.punctureSite],
      time: [new Date(), Validators.required],
      bp: [''],
      hr: [null],
      cvp: [null],
      depth: [null],
      punctureSite: ['正常'],
      dressing: ['清洁干燥'],
      patency: ['通畅'],
      proneStatus: ['无'],
      complications: ['无'],
      nurseAccountId: ['', Validators.required],
    });
    this.sub.add(this.hostPatient.patient$.subscribe(() => this.loadFromServer()));
    document.addEventListener('smartcare-post-print', this.onSmartcarePostPrint);
  }

  ngAfterViewInit(): void {
    this.schedulePaginate();
  }

  ngOnDestroy(): void {
    document.removeEventListener('smartcare-post-print', this.onSmartcarePostPrint);
    this.sub.unsubscribe();
  }

  private newRowId(): string {
    return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private loadFromServer(): void {
    const pid = this.hostPatient.getPid();
    if (!pid) {
      this.records = [];
      this.measureSample = [];
      this.pagedRecords = [[]];
      this.documentId = null;
      this.loadedDocIds = [];
      this.docInfo = { catheterType: '三腔中心静脉导管', punctureSite: '右侧颈内静脉' };
      return;
    }
    this.api.getCvcByPid(pid).subscribe({
      next: (list) => {
        const docs = list || [];
        this.loadedDocIds = docs.map((d: { id?: string }) => d.id).filter(Boolean) as string[];
        const first = docs[0] as { id?: string; catheterType?: string; punctureSite?: string } | undefined;
        this.documentId = first?.id ?? null;
        this.docInfo = {
          catheterType: first?.catheterType ?? '三腔中心静脉导管',
          punctureSite: first?.punctureSite ?? '右侧颈内静脉',
        };
        const rows: CvcRow[] = [];
        for (const doc of docs) {
          for (const m of doc.monitoringRecords || []) {
            const ex = parseCvcCatheterStatus(m.catheterStatus || '');
            rows.push({
              id: this.newRowId(),
              time: parseBackendDateTime(m.time),
              bp: ex.bp ?? '',
              hr: ex.hr ?? null,
              cvp: m.cvp ?? null,
              depth: ex.depth ?? null,
              punctureSite: ex.punctureSite ?? '正常',
              dressing: m.dressingStatus ?? '清洁干燥',
              patency: ex.patency ?? '通畅',
              proneStatus: ex.proneStatus ?? '无',
              complications: ex.complications ?? '无',
              nurseSignature: m.nurseSignature ?? '',
              nurseAccountId: m.nurseAccountId ?? '',
            });
          }
        }
        this.records = rows;
        this.measureSample = this.records.length ? [this.records[0]] : [];
        this.pagedRecords = this.records.length ? [this.records.slice()] : [[]];
        this.schedulePaginate();
      },
      error: (err) => {
        console.error(err);
        this.message.error('加载失败');
      },
    });
  }

  private persist(): void {
    const pid = this.hostPatient.getPid();
    if (!pid) {
      this.message.warning('请先选择病人（宿主需传入 patient.id）');
      return;
    }
    const monitoringRecords = this.records.map((r) => ({
      time: formatBackendDateTime(r.time),
      cvp: r.cvp,
      catheterStatus: buildCvcCatheterStatus(r),
      dressingStatus: r.dressing || null,
      nurseSignature: r.nurseSignature || null,
      nurseAccountId: r.nurseAccountId || null,
    }));

    const body: Record<string, unknown> = {
      pid,
      catheterType: this.docInfo.catheterType || null,
      punctureSite: this.docInfo.punctureSite || null,
      monitoringRecords,
    };
    if (this.documentId) {
      body['id'] = this.documentId;
    }

    this.api.saveCvc(body).subscribe({
      next: (res: { id?: string }) => {
        const newId = res?.id;
        this.documentId = newId ?? this.documentId;
        const oldIds = this.loadedDocIds.filter((x) => x && x !== newId);
        for (const oid of oldIds) {
          this.api.deleteCvc(oid).subscribe({ error: () => undefined });
        }
        this.loadedDocIds = newId ? [newId] : this.loadedDocIds;
        this.message.success('保存成功');
      },
      error: (err) => {
        console.error(err);
        this.message.error(err?.error?.message || '保存失败');
      },
    });
  }

  @HostListener('window:page-toolbar-help')
  onToolbarHelp(): void {
    this.showGuidelinesModal();
  }

  @HostListener('window:page-toolbar-history')
  onToolbarHistory(): void {
    this.showHistoryModal();
  }

  @HostListener('window:page-toolbar-add')
  onToolbarAdd(): void {
    this.showModal();
  }

  showModal(): void {
    if (!this.hostPatient.getPid()) {
      this.message.warning('请先选择病人（宿主需传入 patient.id）');
      return;
    }
    this.isEdit = false;
    this.editingId = null;
    this.recordForm.reset({
      time: new Date(),
      punctureSite: '正常',
      dressing: '清洁干燥',
      patency: '通畅',
      proneStatus: '无',
      complications: '无',
    });
    this.recordForm.patchValue({
      docCatheterType: this.docInfo.catheterType,
      docPunctureSite: this.docInfo.punctureSite,
    });
    this.isModalVisible = true;
  }

  showGuidelinesModal(): void {
    this.isGuidelinesVisible = true;
  }

  handleGuidelinesCancel(): void {
    this.isGuidelinesVisible = false;
  }

  showHistoryModal(): void {
    this.isHistoryVisible = true;
  }

  handleHistoryCancel(): void {
    this.isHistoryVisible = false;
  }

  editRecord(data: CvcRow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue({
      ...data,
      docCatheterType: this.docInfo.catheterType,
      docPunctureSite: this.docInfo.punctureSite,
    });
    this.isModalVisible = true;
  }

  deleteRecord(data: CvcRow): void {
    this.records = this.records.filter((r) => r.id !== data.id);
    this.measureSample = this.records.length ? [this.records[0]] : [];
    this.pagedRecords = this.records.length ? [this.records.slice()] : [[]];
    this.schedulePaginate();
    this.persist();
  }

  handleOk(): void {
    if (!this.hostPatient.getPid()) {
      this.message.warning('请先选择病人（宿主需传入 patient.id）');
      return;
    }
    if (this.recordForm.valid) {
      const fv = this.recordForm.value;
      const { docCatheterType, docPunctureSite, ...rowFv } = fv;
      this.docInfo = {
        catheterType: docCatheterType ?? '',
        punctureSite: docPunctureSite ?? '',
      };
      const nurseSignature = this.hostPatient.resolveAccountName(rowFv.nurseAccountId);
      if (this.isEdit) {
        const index = this.records.findIndex((r) => r.id === this.editingId);
        if (index > -1) {
          this.records[index] = {
            ...this.records[index],
            ...rowFv,
            nurseSignature,
            id: this.records[index].id,
          };
        }
      } else {
        const newRecord: CvcRow = {
          id: this.newRowId(),
          ...rowFv,
          nurseSignature,
        };
        this.records = [...this.records, newRecord];
      }
      this.measureSample = this.records.length ? [this.records[0]] : [];
      this.pagedRecords = this.records.length ? [this.records.slice()] : [[]];
      this.schedulePaginate();
      this.isModalVisible = false;
      this.persist();
    } else {
      Object.values(this.recordForm.controls).forEach((control) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }

  handleCancel(): void {
    this.isModalVisible = false;
  }

  private schedulePaginate(): void {
    this.refineGapPass = 0;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const r = applyA4Pagination(this.records);
        this.pagedRecords = r.pagedRecords;
        this.effectiveRowsPerPage = r.effectiveRowsPerPage;
        requestAnimationFrame(() => this.runRefineGap());
      });
    });
  }

  private runRefineGap(): void {
    const next = refineFirstPageGapOnce(
      this.records,
      this.pagedRecords,
      this.effectiveRowsPerPage,
      this.refineGapPass,
    );
    if (next.didRefine) {
      this.pagedRecords = next.pagedRecords;
      this.effectiveRowsPerPage = next.effectiveRowsPerPage;
      this.refineGapPass = next.refineGapPass;
      requestAnimationFrame(() => this.runRefineGap());
    }
  }
}

