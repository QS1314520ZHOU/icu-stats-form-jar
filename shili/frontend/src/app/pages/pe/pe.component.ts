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

export interface PeRow {
  id: string;
  time: Date;
  bp: string;
  hr: number | null;
  bloodFlow: number | null;
  plasmaFlow: number | null;
  totalVolume: number | null;
  pa: number | null;
  pv: number | null;
  tmp: number | null;
  anticoagulant: string;
  calcium: number | null;
  allergic: string;
  nurseSignature: string;
  nurseAccountId: string;
}

function buildPeCondition(
  anticoagulant: string,
  calcium: number | null,
  allergic: string,
  bp: string,
  hr: number | null,
): string {
  return [
    `抗凝:${anticoagulant ?? ''}`,
    `钙:${calcium ?? ''}`,
    `过敏:${allergic ?? ''}`,
    `BP:${bp ?? ''}`,
    `HR:${hr ?? ''}`,
  ].join(';');
}

function parsePeCondition(pc: string): {
  anticoagulant: string;
  calcium: number | null;
  allergic: string;
  bp: string;
  hr: number | null;
} {
  const o = {
    anticoagulant: '',
    calcium: null as number | null,
    allergic: '无',
    bp: '',
    hr: null as number | null,
  };
  if (!pc) {
    return o;
  }
  for (const seg of pc.split(';')) {
    const i = seg.indexOf(':');
    if (i < 0) {
      continue;
    }
    const k = seg.slice(0, i);
    const v = seg.slice(i + 1).trim();
    if (k.includes('抗凝')) {
      o.anticoagulant = v;
    }
    if (k === '钙' || k.includes('钙')) {
      o.calcium = v === '' ? null : Number(v);
    }
    if (k.includes('过敏')) {
      o.allergic = v || '无';
    }
    if (k === 'BP' || k.includes('BP')) {
      o.bp = v;
    }
    if (k === 'HR' || k.includes('HR')) {
      o.hr = v === '' ? null : Number(v);
    }
  }
  return o;
}

@Component({
  selector: 'app-pe',
  templateUrl: './pe.component.html',
  styleUrls: ['./pe.component.scss'],
})
export class PeComponent implements OnInit, AfterViewInit, OnDestroy {
  /**
   * 主表列宽（与表头顺序一致，总宽约 624px，与 A4 可印宽度匹配）。
   * 「流速与容量」3 列 +「压力监测」3 列每列各减小 3px（共 -18px），全部加到「护士签名」列宽上。
   */
  readonly peWidthConfig: readonly string[] = [
    '42px', // 时间
    '70px', // 生命体征
    '47px', // 血流速 (50-3)
    '47px', // 血浆流速 (50-3)
    '49px', // 累计置换量 (52-3)
    '41px', // 动脉压 PA (44-3)
    '41px', // 静脉压 PV (44-3)
    '41px', // 跨膜压 TMP (44-3)
    '56px', // 抗凝剂
    '60px', // 葡萄糖酸钙
    '50px', // 过敏反应
    '80px', // 护士签名 (62+18)
  ];

  currentDate = new Date();
  docInfo = { vascularAccess: '右侧颈内静脉双腔导管', separatorType: 'Plasmaflo P2' };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: PeRow[] = [];
  pagedRecords: PeRow[][] = [[]];
  measureSample: PeRow[] = [];
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
      vascularAccess: [this.docInfo.vascularAccess],
      separatorType: [this.docInfo.separatorType],
      time: [new Date(), Validators.required],
      bp: [''],
      hr: [null],
      bloodFlow: [null],
      plasmaFlow: [null],
      totalVolume: [null],
      pa: [null],
      pv: [null],
      tmp: [null],
      anticoagulant: [''],
      calcium: [null],
      allergic: ['无'],
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
      this.docInfo = { vascularAccess: '右侧颈内静脉双腔导管', separatorType: 'Plasmaflo P2' };
      return;
    }
    this.api.getPeByPid(pid).subscribe({
      next: (list) => {
        const docs = list || [];
        this.loadedDocIds = docs.map((d: { id?: string }) => d.id).filter(Boolean) as string[];
        const first = docs[0] as { id?: string; vascularAccess?: string; separatorType?: string } | undefined;
        this.documentId = first?.id ?? null;
        this.docInfo = {
          vascularAccess: first?.vascularAccess ?? '右侧颈内静脉双腔导管',
          separatorType: first?.separatorType ?? 'Plasmaflo P2',
        };
        const rows: PeRow[] = [];
        for (const doc of docs) {
          for (const m of doc.monitoringRecords || []) {
            const extra = parsePeCondition(m.patientCondition || '');
            rows.push({
              id: this.newRowId(),
              time: parseBackendDateTime(m.time),
              bp: extra.bp,
              hr: extra.hr,
              bloodFlow: m.bloodFlowRate ?? null,
              plasmaFlow: m.plasmaReplacementRate ?? null,
              totalVolume: m.totalPlasmaExchanged ?? null,
              pa: m.arterialPressure ?? null,
              pv: m.venousPressure ?? null,
              tmp: m.tmp ?? null,
              anticoagulant: extra.anticoagulant,
              calcium: extra.calcium,
              allergic: extra.allergic,
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
      bloodFlowRate: r.bloodFlow,
      plasmaReplacementRate: r.plasmaFlow,
      totalPlasmaExchanged: r.totalVolume,
      arterialPressure: r.pa,
      venousPressure: r.pv,
      tmp: r.tmp,
      patientCondition: buildPeCondition(r.anticoagulant, r.calcium, r.allergic, r.bp, r.hr),
      nurseSignature: r.nurseSignature || null,
      nurseAccountId: r.nurseAccountId || null,
    }));

    const body: Record<string, unknown> = {
      pid,
      vascularAccess: this.docInfo.vascularAccess || null,
      separatorType: this.docInfo.separatorType || null,
      monitoringRecords,
    };
    if (this.documentId) {
      body['id'] = this.documentId;
    }

    this.api.savePe(body).subscribe({
      next: (res: { id?: string }) => {
        const newId = res?.id;
        this.documentId = newId ?? this.documentId;
        const oldIds = this.loadedDocIds.filter((x) => x && x !== newId);
        for (const oid of oldIds) {
          this.api.deletePe(oid).subscribe({ error: () => undefined });
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
    this.recordForm.reset({ time: new Date(), allergic: '无' });
    this.recordForm.patchValue({
      vascularAccess: this.docInfo.vascularAccess,
      separatorType: this.docInfo.separatorType,
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

  editRecord(data: PeRow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue({
      ...data,
      vascularAccess: this.docInfo.vascularAccess,
      separatorType: this.docInfo.separatorType,
    });
    this.isModalVisible = true;
  }

  deleteRecord(data: PeRow): void {
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
      const { vascularAccess, separatorType, ...rowFv } = fv;
      this.docInfo = {
        vascularAccess: vascularAccess ?? '',
        separatorType: separatorType ?? '',
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
        const newRecord: PeRow = {
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

