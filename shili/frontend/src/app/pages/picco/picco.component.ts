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

export interface PiccoRow {
  id: string;
  time: Date;
  bp: string;
  hr: number | null;
  map: number | null;
  cvp: number | null;
  ci: number | null;
  gedvi: number | null;
  evlwi: number | null;
  svri: number | null;
  dpmax: number | null;
  scvo2: number | null;
  vasoactiveDrugs: string;
  nurseSignature: string;
  nurseAccountId: string;
}

function encodePiccoNurseField(r: PiccoRow): string {
  return [
    r.nurseSignature || '',
    `BP:${r.bp ?? ''}`,
    `HR:${r.hr ?? ''}`,
    `CVP:${r.cvp ?? ''}`,
    `ScvO2:${r.scvo2 ?? ''}`,
    `药:${r.vasoactiveDrugs ?? ''}`,
  ].join('|');
}

function decodePiccoNurseField(s: string): Partial<PiccoRow> {
  const o: Partial<PiccoRow> = { nurseSignature: '', bp: '', hr: null, cvp: null, scvo2: null, vasoactiveDrugs: '' };
  if (!s) {
    return o;
  }
  const parts = s.split('|');
  o.nurseSignature = parts[0] || '';
  for (const p of parts.slice(1)) {
    if (p.startsWith('BP:')) {
      o.bp = p.slice(3);
    }
    if (p.startsWith('HR:')) {
      const v = p.slice(3);
      o.hr = v === '' ? null : Number(v);
    }
    if (p.startsWith('CVP:')) {
      const v = p.slice(4);
      o.cvp = v === '' ? null : Number(v);
    }
    if (p.startsWith('ScvO2:')) {
      const v = p.slice(6);
      o.scvo2 = v === '' ? null : Number(v);
    }
    if (p.startsWith('药:')) {
      o.vasoactiveDrugs = p.slice(2);
    }
  }
  return o;
}

@Component({
  selector: 'app-picco',
  templateUrl: './picco.component.html',
  styleUrls: ['./picco.component.scss'],
})
export class PiccoComponent implements OnInit, AfterViewInit, OnDestroy {
  currentDate = new Date();
  docInfo = {
    insertionSite: '右侧股动脉',
    catheterSize: '4F',
  };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: PiccoRow[] = [];
  pagedRecords: PiccoRow[][] = [[]];
  measureSample: PiccoRow[] = [];
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
      catheterSize: [this.docInfo.catheterSize],
      time: [new Date(), Validators.required],
      bp: [''],
      hr: [null],
      map: [null],
      cvp: [null],
      ci: [null],
      gedvi: [null],
      evlwi: [null],
      svri: [null],
      dpmax: [null],
      scvo2: [null],
      vasoactiveDrugs: [''],
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
        catheterSize: '4F',
      };
      return;
    }
    this.api.getPiccoByPid(pid).subscribe({
      next: (list) => {
        const docs = list || [];
        this.loadedDocIds = docs.map((d: { id?: string }) => d.id).filter(Boolean) as string[];
        const d0 = docs[0] as
          | { id?: string; insertionSite?: string; catheterSize?: string }
          | undefined;
        this.documentId = d0?.id ?? null;
        this.docInfo = {
          insertionSite: d0?.insertionSite ?? '右侧股动脉',
          catheterSize: d0?.catheterSize ?? '4F',
        };
        const rows: PiccoRow[] = [];
        for (const doc of docs) {
          for (const m of doc.hemodynamicRecords || []) {
            const ex = decodePiccoNurseField(m.nurseSignature || '');
            rows.push({
              id: this.newRowId(),
              time: parseBackendDateTime(m.time),
              bp: ex.bp ?? '',
              hr: ex.hr ?? null,
              map: m.map ?? null,
              cvp: ex.cvp ?? null,
              ci: m.ci ?? null,
              gedvi: m.gedvi ?? null,
              evlwi: m.evlwi ?? null,
              svri: m.svri ?? null,
              dpmax: m.dpdtMax ?? null,
              scvo2: ex.scvo2 ?? null,
              vasoactiveDrugs: ex.vasoactiveDrugs ?? '',
              nurseSignature: ex.nurseSignature ?? '',
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
    const hemodynamicRecords = this.records.map((r) => ({
      time: formatBackendDateTime(r.time),
      ci: r.ci,
      gedvi: r.gedvi,
      evlwi: r.evlwi,
      svri: r.svri,
      dpdtMax: r.dpmax,
      map: r.map,
      nurseSignature: encodePiccoNurseField(r),
      nurseAccountId: r.nurseAccountId || null,
    }));

    const body: Record<string, unknown> = {
      pid,
      insertionSite: this.docInfo.insertionSite || null,
      catheterSize: this.docInfo.catheterSize || null,
      hemodynamicRecords,
    };
    if (this.documentId) {
      body['id'] = this.documentId;
    }

    this.api.savePicco(body).subscribe({
      next: (res: { id?: string }) => {
        const newId = res?.id;
        this.documentId = newId ?? this.documentId;
        const oldIds = this.loadedDocIds.filter((x) => x && x !== newId);
        for (const oid of oldIds) {
          this.api.deletePicco(oid).subscribe({ error: () => undefined });
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
      catheterSize: this.docInfo.catheterSize,
      time: new Date(),
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

  editRecord(data: PiccoRow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue({
      ...data,
      insertionSite: this.docInfo.insertionSite,
      catheterSize: this.docInfo.catheterSize,
    });
    this.isModalVisible = true;
  }

  deleteRecord(data: PiccoRow): void {
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
      const { insertionSite, catheterSize, ...rowFields } = fv;
      this.docInfo = {
        insertionSite: insertionSite ?? '',
        catheterSize: catheterSize ?? '',
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
        const newRecord: PiccoRow = {
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

