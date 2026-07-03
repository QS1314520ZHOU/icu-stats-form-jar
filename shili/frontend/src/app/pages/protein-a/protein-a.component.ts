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

export interface ProteinARow {
  id: string;
  time: Date;
  bp: string;
  hr: number | null;
  bloodFlow: number | null;
  plasmaFlow: number | null;
  totalPlasma: number | null;
  pa: number | null;
  pv: number | null;
  tmp: number | null;
  anticoagulant: string;
  replacementFluid: number | null;
  adverseReactions: string;
  nurseSignature: string;
  nurseAccountId: string;
}

@Component({
  selector: 'app-protein-a',
  templateUrl: './protein-a.component.html',
  styleUrls: ['./protein-a.component.scss'],
})
export class ProteinAComponent implements OnInit, AfterViewInit, OnDestroy {
  /**
   * 主表列宽（与表头顺序一致，总宽约 624px，与 A4 可印宽度匹配）。
   * 「治疗参数」3 列每列各减少 4px（共 -12px），全部加到「护士签名」列宽上。
   */
  readonly proteinAWidthConfig: readonly string[] = [
    '42px', // 时间
    '50px', // 血压
    '44px', // 心率
    '46px', // 血流速（50-4）
    '46px', // 血浆流速（50-4）
    '48px', // 累计处理血浆（52-4）
    '41px', // 动脉压 PA
    '41px', // 静脉压 PV
    '41px', // 跨膜压 TMP
    '56px', // 抗凝剂剂量
    '56px', // 血浆置换液补充量
    '54px', // 不良反应
    '59px', // 护士签名（47+12）
  ];

  currentDate = new Date();
  docInfo = {
    vascularAccess: '右股静脉双腔导管',
    adsorberType: 'DNA250',
  };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: ProteinARow[] = [];
  pagedRecords: ProteinARow[][] = [[]];
  measureSample: ProteinARow[] = [];
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
      adsorberType: [this.docInfo.adsorberType],
      time: [new Date(), Validators.required],
      bp: [''],
      hr: [null],
      bloodFlow: [null],
      plasmaFlow: [null],
      totalPlasma: [null],
      pa: [null],
      pv: [null],
      tmp: [null],
      anticoagulant: [''],
      replacementFluid: [null],
      adverseReactions: ['无'],
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
      this.docInfo = {
        vascularAccess: '右股静脉双腔导管',
        adsorberType: 'DNA250',
      };
      return;
    }
    this.api.getProteinAByPid(pid).subscribe({
      next: (list) => {
        const docs = list || [];
        this.loadedDocIds = docs.map((d: { id?: string }) => d.id).filter(Boolean) as string[];
        const d0 = docs[0] as
          | { id?: string; vascularAccess?: string; adsorberType?: string }
          | undefined;
        this.documentId = d0?.id ?? null;
        this.docInfo = {
          vascularAccess: d0?.vascularAccess ?? '右股静脉双腔导管',
          adsorberType: d0?.adsorberType ?? 'DNA250',
        };
        const rows: ProteinARow[] = [];
        for (const doc of docs) {
          for (const m of doc.monitoringRecords || []) {
            rows.push({
              id: this.newRowId(),
              time: parseBackendDateTime(m.time),
              bp: m.bp ?? '',
              hr: m.hr ?? null,
              bloodFlow: m.bloodFlow ?? null,
              plasmaFlow: m.plasmaFlow ?? null,
              totalPlasma: m.totalPlasma ?? null,
              pa: m.pa ?? null,
              pv: m.pv ?? null,
              tmp: m.tmp ?? null,
              anticoagulant: m.anticoagulant ?? '',
              replacementFluid: m.replacementFluid ?? null,
              adverseReactions: m.adverseReactions ?? '',
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
      bp: r.bp || null,
      hr: r.hr,
      bloodFlow: r.bloodFlow,
      plasmaFlow: r.plasmaFlow,
      totalPlasma: r.totalPlasma,
      pa: r.pa,
      pv: r.pv,
      tmp: r.tmp,
      anticoagulant: r.anticoagulant || null,
      replacementFluid: r.replacementFluid,
      adverseReactions: r.adverseReactions || null,
      nurseSignature: r.nurseSignature || null,
      nurseAccountId: r.nurseAccountId || null,
    }));

    const body: Record<string, unknown> = {
      pid,
      vascularAccess: this.docInfo.vascularAccess || null,
      adsorberType: this.docInfo.adsorberType || null,
      monitoringRecords,
    };
    if (this.documentId) {
      body['id'] = this.documentId;
    }

    this.api.saveProteinA(body).subscribe({
      next: (res: { id?: string }) => {
        const newId = res?.id;
        this.documentId = newId ?? this.documentId;
        const oldIds = this.loadedDocIds.filter((x) => x && x !== newId);
        for (const oid of oldIds) {
          this.api.deleteProteinA(oid).subscribe({ error: () => undefined });
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
      vascularAccess: this.docInfo.vascularAccess,
      adsorberType: this.docInfo.adsorberType,
      time: new Date(),
      adverseReactions: '无',
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

  editRecord(data: ProteinARow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue({
      ...data,
      vascularAccess: this.docInfo.vascularAccess,
      adsorberType: this.docInfo.adsorberType,
    });
    this.isModalVisible = true;
  }

  deleteRecord(data: ProteinARow): void {
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
      const { vascularAccess, adsorberType, ...rowFields } = fv;
      this.docInfo = {
        vascularAccess: vascularAccess ?? '',
        adsorberType: adsorberType ?? '',
      };
      const nurseSignature = this.hostPatient.resolveAccountName(rowFields.nurseAccountId);
      if (this.isEdit) {
        const index = this.records.findIndex((r) => r.id === this.editingId);
        if (index > -1) {
          this.records[index] = {
            ...this.records[index],
            ...rowFields,
            nurseSignature,
            id: this.records[index].id,
          };
        }
      } else {
        const newRecord: ProteinARow = {
          id: this.newRowId(),
          ...rowFields,
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
