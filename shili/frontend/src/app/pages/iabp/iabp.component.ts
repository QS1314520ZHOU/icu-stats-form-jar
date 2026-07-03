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

export interface IabpRow {
  id: string;
  time: Date;
  hr: number | null;
  sysBp: number | null;
  diaBp: number | null;
  augPressure: number | null;
  endDiaPressure: number | null;
  triggerMode: string;
  ratio: string;
  balloonStatus: string;
  punctureSite: string;
  pedalPulse: string;
  skinTemp: string;
  nurseSignature: string;
  nurseAccountId: string;
}

function encodeIabpBalloon(r: IabpRow): string {
  return [r.balloonStatus || '', `触发:${r.triggerMode}`, `比:${r.ratio}`, `皮温:${r.skinTemp}`].join('|');
}

function decodeIabpBalloon(s: string): { balloonStatus: string; triggerMode: string; ratio: string; skinTemp: string } {
  const o = { balloonStatus: '', triggerMode: 'ECG', ratio: '1:1', skinTemp: '' };
  if (!s) {
    return o;
  }
  const parts = s.split('|');
  o.balloonStatus = parts[0] || '';
  for (const p of parts.slice(1)) {
    if (p.startsWith('触发:')) {
      o.triggerMode = p.slice(3);
    }
    if (p.startsWith('比:')) {
      o.ratio = p.slice(2);
    }
    if (p.startsWith('皮温:')) {
      o.skinTemp = p.slice(3);
    }
  }
  return o;
}

function encodeIabpNurse(r: IabpRow): string {
  return [r.nurseSignature || '', `HR:${r.hr ?? ''}`].join('|');
}

function decodeIabpNurse(s: string): { nurseSignature: string; hr: number | null } {
  const parts = s.split('|');
  const o = { nurseSignature: parts[0] || '', hr: null as number | null };
  for (const p of parts.slice(1)) {
    if (p.startsWith('HR:')) {
      const v = p.slice(3);
      o.hr = v === '' ? null : Number(v);
    }
  }
  return o;
}

@Component({
  selector: 'app-iabp',
  templateUrl: './iabp.component.html',
  styleUrls: ['./iabp.component.scss'],
})
export class IabpComponent implements OnInit, AfterViewInit, OnDestroy {
  currentDate = new Date();
  docInfo = {
    insertionSite: '右侧股动脉',
    balloonVolume: '40cc',
  };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: IabpRow[] = [];
  pagedRecords: IabpRow[][] = [[]];
  measureSample: IabpRow[] = [];
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
      insertionSite: [this.docInfo.insertionSite],
      balloonVolume: [this.docInfo.balloonVolume],
      time: [new Date(), Validators.required],
      hr: [null],
      sysBp: [null],
      diaBp: [null],
      augPressure: [null],
      endDiaPressure: [null],
      triggerMode: ['ECG'],
      ratio: ['1:1'],
      balloonStatus: ['正常充放'],
      punctureSite: ['干燥'],
      pedalPulse: ['有力'],
      skinTemp: ['正常'],
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
        insertionSite: '右侧股动脉',
        balloonVolume: '40cc',
      };
      return;
    }
    this.api.getIabpByPid(pid).subscribe({
      next: (list) => {
        const docs = list || [];
        this.loadedDocIds = docs.map((d: { id?: string }) => d.id).filter(Boolean) as string[];
        const d0 = docs[0] as
          | { id?: string; insertionSite?: string; balloonVolume?: string }
          | undefined;
        this.documentId = d0?.id ?? null;
        this.docInfo = {
          insertionSite: d0?.insertionSite ?? '右侧股动脉',
          balloonVolume: d0?.balloonVolume ?? '40cc',
        };
        const rows: IabpRow[] = [];
        for (const doc of docs) {
          for (const m of doc.monitoringRecords || []) {
            const b = decodeIabpBalloon(m.balloonStatus || '');
            const n = decodeIabpNurse(m.nurseSignature || '');
            rows.push({
              id: this.newRowId(),
              time: parseBackendDateTime(m.time),
              hr: n.hr,
              sysBp: m.systolicPressure ?? null,
              diaBp: m.diastolicPressure ?? null,
              augPressure: m.augmentedPressure ?? null,
              endDiaPressure: m.endDiastolicPressure ?? null,
              triggerMode: b.triggerMode,
              ratio: b.ratio,
              balloonStatus: b.balloonStatus,
              punctureSite: m.punctureSiteStatus ?? '',
              pedalPulse: m.pedalPulse ?? '',
              skinTemp: b.skinTemp,
              nurseSignature: n.nurseSignature,
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
      systolicPressure: r.sysBp,
      diastolicPressure: r.diaBp,
      augmentedPressure: r.augPressure,
      endDiastolicPressure: r.endDiaPressure,
      balloonStatus: encodeIabpBalloon(r),
      punctureSiteStatus: r.punctureSite,
      pedalPulse: r.pedalPulse,
      nurseSignature: encodeIabpNurse(r),
      nurseAccountId: r.nurseAccountId || null,
    }));

    const body: Record<string, unknown> = {
      pid,
      insertionSite: this.docInfo.insertionSite || null,
      balloonVolume: this.docInfo.balloonVolume || null,
      monitoringRecords,
    };
    if (this.documentId) {
      body['id'] = this.documentId;
    }

    this.api.saveIabp(body).subscribe({
      next: (res: { id?: string }) => {
        const newId = res?.id;
        this.documentId = newId ?? this.documentId;
        const oldIds = this.loadedDocIds.filter((x) => x && x !== newId);
        for (const oid of oldIds) {
          this.api.deleteIabp(oid).subscribe({ error: () => undefined });
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
      insertionSite: this.docInfo.insertionSite,
      balloonVolume: this.docInfo.balloonVolume,
      time: new Date(),
      triggerMode: 'ECG',
      ratio: '1:1',
      balloonStatus: '正常充放',
      punctureSite: '干燥',
      pedalPulse: '有力',
      skinTemp: '正常',
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

  editRecord(data: IabpRow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue({
      ...data,
      insertionSite: this.docInfo.insertionSite,
      balloonVolume: this.docInfo.balloonVolume,
    });
    this.isModalVisible = true;
  }

  deleteRecord(data: IabpRow): void {
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
      const { insertionSite, balloonVolume, ...rowFields } = fv;
      this.docInfo = {
        insertionSite: insertionSite ?? '',
        balloonVolume: balloonVolume ?? '',
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
        const newRecord: IabpRow = {
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

