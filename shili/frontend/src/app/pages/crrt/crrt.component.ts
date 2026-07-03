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
import { CRRT_TABLE_WIDTH_CONFIG } from './crrt-table-widths';

export interface CrrtRow {
  id: string;
  time: Date;
  bp: string;
  hr: number | null;
  mode: string;
  pa: number | null;
  pv: number | null;
  tmp: number | null;
  pbf: number | null;
  qb: number | null;
  qd: number | null;
  qf: number | null;
  waste: number | null;
  anticoagulant: string;
  quf: number | null;
  alarms: string;
  nurseSignature: string;
  nurseAccountId: string;
}

@Component({
  selector: 'app-crrt',
  templateUrl: './crrt.component.html',
  styleUrls: ['./crrt.component.scss'],
})
export class CrrtComponent implements OnInit, AfterViewInit, OnDestroy {
  /** 与 crrt-table-widths.ts 一致，供 nzWidthConfig 生成 <col> 内联宽度（打印可继承） */
  readonly crrtWidthConfig: string[] = [...CRRT_TABLE_WIDTH_CONFIG];

  currentDate = new Date();
  docInfo = { vascularAccess: '右侧颈内静脉双腔导管', filterType: 'AV600S' };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: CrrtRow[] = [];
  /** 按 A4 高度切分后的页数据（每页一张「纸」） */
  pagedRecords: CrrtRow[][] = [[]];
  /** 供隐藏测量块渲染一行，用于计算行高 */
  measureSample: CrrtRow[] = [];
  private documentId: string | null = null;
  private loadedDocIds: string[] = [];
  private readonly sub = new Subscription();
  /** 首屏分页后的留白修正次数（避免死循环） */
  private refineGapPass = 0;
  /** 屏幕分页稳定后的每页行数（供 refine / 与屏幕一致打印分页） */
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
      filterType: [this.docInfo.filterType],
      time: [new Date(), Validators.required],
      bp: [''],
      hr: [null],
      mode: ['CVVH', Validators.required],
      pa: [null],
      pv: [null],
      tmp: [null],
      pbf: [null],
      qb: [null],
      qd: [null],
      qf: [null],
      waste: [null],
      anticoagulant: [''],
      quf: [null],
      alarms: ['无'],
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
      this.docInfo = { vascularAccess: '右侧颈内静脉双腔导管', filterType: 'AV600S' };
      return;
    }
    this.api.getCrrtByPid(pid).subscribe({
      next: (list) => {
        const docs = list || [];
        this.loadedDocIds = docs.map((d: { id?: string }) => d.id).filter(Boolean) as string[];
        const first = docs[0] as { id?: string; vascularAccess?: string; filterType?: string } | undefined;
        this.documentId = first?.id ?? null;
        this.docInfo = {
          vascularAccess: first?.vascularAccess ?? '右侧颈内静脉双腔导管',
          filterType: first?.filterType ?? 'AV600S',
        };
        const rows: CrrtRow[] = [];
        for (const doc of docs) {
          for (const nr of doc.nursingRecords || []) {
            rows.push({
              id: this.newRowId(),
              time: parseBackendDateTime(nr.time),
              bp: nr.bp ?? '',
              hr: nr.hr ?? null,
              mode: nr.mode ?? 'CVVH',
              pa: nr.pa ?? null,
              pv: nr.pv ?? null,
              tmp: nr.tmp ?? null,
              pbf: nr.pbf ?? null,
              qb: nr.qb ?? null,
              qd: nr.qd ?? null,
              qf: nr.qf ?? null,
              waste: nr.waste ?? null,
              anticoagulant: nr.anticoagulant ?? '',
              quf: nr.quf ?? null,
              alarms: nr.alarms ?? '',
              nurseSignature: nr.nurseSignature ?? '',
              nurseAccountId: nr.nurseAccountId ?? '',
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
    const nursingRecords = this.records.map((r) => ({
      time: formatBackendDateTime(r.time),
      bp: r.bp || null,
      hr: r.hr,
      mode: r.mode,
      pa: r.pa,
      pv: r.pv,
      tmp: r.tmp,
      pbf: r.pbf,
      qb: r.qb,
      qd: r.qd,
      qf: r.qf,
      waste: r.waste,
      anticoagulant: r.anticoagulant || null,
      quf: r.quf,
      alarms: r.alarms || null,
      nurseSignature: r.nurseSignature || null,
      nurseAccountId: r.nurseAccountId || null,
    }));

    const body: Record<string, unknown> = {
      pid,
      vascularAccess: this.docInfo.vascularAccess || null,
      filterType: this.docInfo.filterType || null,
      nursingRecords,
    };
    if (this.documentId) {
      body['id'] = this.documentId;
    }

    this.api.saveCrrt(body).subscribe({
      next: (res: { id?: string }) => {
        const newId = res?.id;
        this.documentId = newId ?? this.documentId;
        const oldIds = this.loadedDocIds.filter((x) => x && x !== newId);
        for (const oid of oldIds) {
          this.api.deleteCrrt(oid).subscribe({ error: () => undefined });
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
    this.recordForm.reset({ time: new Date(), mode: 'CVVH', alarms: '无' });
    this.recordForm.patchValue({
      vascularAccess: this.docInfo.vascularAccess,
      filterType: this.docInfo.filterType,
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

  editRecord(data: CrrtRow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue({
      ...data,
      vascularAccess: this.docInfo.vascularAccess,
      filterType: this.docInfo.filterType,
    });
    this.isModalVisible = true;
  }

  deleteRecord(data: CrrtRow): void {
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
      const { vascularAccess, filterType, ...rowFv } = fv;
      this.docInfo = {
        vascularAccess: vascularAccess ?? '',
        filterType: filterType ?? '',
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
        const newRecord: CrrtRow = {
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

  /** 等 DOM（含测量块）渲染后再计算分页，避免少行/错页 */
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
