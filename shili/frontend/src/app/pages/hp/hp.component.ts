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

export interface HpRow {
  id: string;
  time: Date;
  bp: string;
  hr: number | null;
  bloodFlow: number | null;
  pa: number | null;
  pv: number | null;
  tmp: number | null;
  anticoagulant: string;
  status: string;
  complications: string;
  nurseSignature: string;
  nurseAccountId: string;
}

function buildHpPatientCondition(bp: string, hr: number | null, status: string, anticoagulant: string): string {
  return [`BP:${bp ?? ''}`, `HR:${hr ?? ''}`, `状态:${status ?? ''}`, `抗凝:${anticoagulant ?? ''}`].join(';');
}

function parseHpPatientCondition(pc: string): { bp: string; hr: number | null; status: string; anticoagulant: string } {
  const o = { bp: '', hr: null as number | null, status: '', anticoagulant: '' };
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
    if (k === 'BP' || k.includes('BP')) {
      o.bp = v;
    }
    if (k === 'HR' || k.includes('HR')) {
      o.hr = v === '' ? null : Number(v);
    }
    if (k.includes('状态')) {
      o.status = v;
    }
    if (k.includes('抗凝')) {
      o.anticoagulant = v;
    }
  }
  return o;
}

@Component({
  selector: 'app-hp',
  templateUrl: './hp.component.html',
  styleUrls: ['./hp.component.scss'],
})
export class HpComponent implements OnInit, AfterViewInit, OnDestroy {
  currentDate = new Date();
  docInfo = { vascularAccess: '右股静脉双腔导管', hemoperfuserType: 'HA330' };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: HpRow[] = [];
  pagedRecords: HpRow[][] = [[]];
  measureSample: HpRow[] = [];
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
      hemoperfuserType: [this.docInfo.hemoperfuserType],
      time: [new Date(), Validators.required],
      bp: [''],
      hr: [null],
      bloodFlow: [null],
      pa: [null],
      pv: [null],
      tmp: [null],
      anticoagulant: [''],
      status: ['平稳'],
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
      this.docInfo = { vascularAccess: '右股静脉双腔导管', hemoperfuserType: 'HA330' };
      return;
    }
    this.api.getHpByPid(pid).subscribe({
      next: (list) => {
        const docs = list || [];
        this.loadedDocIds = docs.map((d: { id?: string }) => d.id).filter(Boolean) as string[];
        const first = docs[0] as { id?: string; vascularAccess?: string; hemoperfuserType?: string } | undefined;
        this.documentId = first?.id ?? null;
        this.docInfo = {
          vascularAccess: first?.vascularAccess ?? '右股静脉双腔导管',
          hemoperfuserType: first?.hemoperfuserType ?? 'HA330',
        };
        const rows: HpRow[] = [];
        for (const doc of docs) {
          for (const m of doc.monitoringRecords || []) {
            const ex = parseHpPatientCondition(m.patientCondition || '');
            rows.push({
              id: this.newRowId(),
              time: parseBackendDateTime(m.time),
              bp: ex.bp,
              hr: ex.hr,
              bloodFlow: m.bloodFlowRate ?? null,
              pa: m.arterialPressure ?? null,
              pv: m.venousPressure ?? null,
              tmp: m.tmp ?? null,
              anticoagulant: ex.anticoagulant,
              status: ex.status || '平稳',
              complications: m.complications ?? '',
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
      arterialPressure: r.pa,
      venousPressure: r.pv,
      tmp: r.tmp,
      patientCondition: buildHpPatientCondition(r.bp, r.hr, r.status, r.anticoagulant),
      complications: r.complications || null,
      nurseSignature: r.nurseSignature || null,
      nurseAccountId: r.nurseAccountId || null,
    }));

    const body: Record<string, unknown> = {
      pid,
      vascularAccess: this.docInfo.vascularAccess || null,
      hemoperfuserType: this.docInfo.hemoperfuserType || null,
      monitoringRecords,
    };
    if (this.documentId) {
      body['id'] = this.documentId;
    }

    this.api.saveHp(body).subscribe({
      next: (res: { id?: string }) => {
        const newId = res?.id;
        this.documentId = newId ?? this.documentId;
        const oldIds = this.loadedDocIds.filter((x) => x && x !== newId);
        for (const oid of oldIds) {
          this.api.deleteHp(oid).subscribe({ error: () => undefined });
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
    this.recordForm.reset({ time: new Date(), status: '平稳', complications: '无' });
    this.recordForm.patchValue({
      vascularAccess: this.docInfo.vascularAccess,
      hemoperfuserType: this.docInfo.hemoperfuserType,
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

  editRecord(data: HpRow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue({
      ...data,
      vascularAccess: this.docInfo.vascularAccess,
      hemoperfuserType: this.docInfo.hemoperfuserType,
    });
    this.isModalVisible = true;
  }

  deleteRecord(data: HpRow): void {
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
      const { vascularAccess, hemoperfuserType, ...rowFv } = fv;
      this.docInfo = {
        vascularAccess: vascularAccess ?? '',
        hemoperfuserType: hemoperfuserType ?? '',
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
        const newRecord: HpRow = {
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

