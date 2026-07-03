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

export interface RmRow {
  id: string;
  time: Date;
  stage: string;
  method: string;
  peep: number | null;
  pip: number | null;
  spo2: number | null;
  hr: number | null;
  bp: string;
  vt: number | null;
  cdyn: number | null;
  complications: string;
  doctorSignature: string;
  doctorAccountId: string;
}

function buildRmExtra(r: RmRow): string {
  return [`stage:${r.stage ?? ''}`, `bp:${r.bp ?? ''}`, `HR:${r.hr ?? ''}`, `VT:${r.vt ?? ''}`, `Cdyn:${r.cdyn ?? ''}`, r.complications ?? ''].filter(Boolean).join(';');
}

function parseRmExtra(s: string): Partial<RmRow> {
  const o: Partial<RmRow> = { complications: '' };
  if (!s) {
    return o;
  }
  const rest: string[] = [];
  for (const seg of s.split(';')) {
    if (seg.startsWith('stage:')) {
      o.stage = seg.slice(6);
    } else if (seg.startsWith('bp:')) {
      o.bp = seg.slice(3);
    } else if (seg.startsWith('HR:')) {
      const v = seg.slice(3);
      o.hr = v === '' ? null : Number(v);
    } else if (seg.startsWith('VT:')) {
      const v = seg.slice(3);
      o.vt = v === '' ? null : Number(v);
    } else if (seg.startsWith('Cdyn:')) {
      const v = seg.slice(5);
      o.cdyn = v === '' ? null : Number(v);
    } else if (seg.trim()) {
      rest.push(seg);
    }
  }
  o.complications = rest.join(';');
  return o;
}

@Component({
  selector: 'app-rm',
  templateUrl: './rm.component.html',
  styleUrls: ['./rm.component.scss'],
})
export class RmComponent implements OnInit, AfterViewInit, OnDestroy {
  /**
   * 主表列宽（与表头顺序一致，总宽约 624px，与 A4 可印宽度匹配）。
   * 阶段列增加 10px，压力设置（PEEP/PIP）各减少 5px（共 10px）。
   */
  readonly rmWidthConfig: readonly string[] = [
    '42px', // 时间
    '66px', // 阶段（原 56px + 10px）
    '60px', // 操作方法
    '41px', // PEEP（原 46px - 5px）
    '41px', // PIP（原 46px - 5px）
    '46px', // SpO2
    '46px', // HR
    '46px', // BP
    '46px', // VT
    '60px', // Cdyn
    '72px', // 并发症
    '58px', // 医生签名
  ];

  currentDate = new Date();
  docInfo = { method: 'CPAP法' };
  isModalVisible = false;
  isGuidelinesVisible = false;
  isHistoryVisible = false;
  isEdit = false;
  recordForm!: FormGroup;
  editingId: string | null = null;

  records: RmRow[] = [];
  pagedRecords: RmRow[][] = [[]];
  measureSample: RmRow[] = [];
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
      time: [new Date(), Validators.required],
      stage: ['操作前', Validators.required],
      method: ['CPAP法', Validators.required],
      peep: [null],
      pip: [null],
      spo2: [null],
      hr: [null],
      bp: [''],
      vt: [null],
      cdyn: [null],
      complications: ['无'],
      doctorAccountId: ['', Validators.required],
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

  private loadFromServer(): void {
    const pid = this.hostPatient.getPid();
    if (!pid) {
      this.records = [];
      this.measureSample = [];
      this.pagedRecords = [[]];
      this.docInfo = { method: 'CPAP法' };
      return;
    }
    this.api.getRmByPid(pid).subscribe({
      next: (list) => {
        this.records = (list || []).map((d: Record<string, unknown>) => {
          const ex = parseRmExtra(String(d['complications'] ?? ''));
          return {
            id: String(d['id'] ?? ''),
            time: parseBackendDateTime(d['operationTime']),
            stage: ex.stage ?? '操作前',
            method: String(d['method'] ?? ''),
            peep: (d['peepInitial'] as number) ?? null,
            pip: (d['pressureControl'] as number) ?? null,
            spo2:
              d['spo2Before'] != null && d['spo2Before'] !== ''
                ? Number(d['spo2Before'])
                : null,
            hr: ex.hr ?? null,
            bp: ex.bp ?? '',
            vt: ex.vt ?? null,
            cdyn: ex.cdyn ?? null,
            complications: ex.complications ?? '无',
            doctorSignature: String(d['doctorSignature'] ?? ''),
            doctorAccountId: String(d['doctorAccountId'] ?? ''),
          } as RmRow;
        });
        this.docInfo.method = this.records[0]?.method ?? 'CPAP法';
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
      stage: '操作中',
      method: this.docInfo.method,
      complications: '无',
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

  editRecord(data: RmRow): void {
    this.isEdit = true;
    this.editingId = data.id;
    this.recordForm.patchValue(data);
    this.isModalVisible = true;
  }

  deleteRecord(data: RmRow): void {
    const pid = this.hostPatient.getPid();
    if (!pid) {
      this.message.warning('请先选择病人');
      return;
    }
    if (!data.id || data.id.startsWith('r-')) {
      this.records = this.records.filter((r) => r.id !== data.id);
      this.measureSample = this.records.length ? [this.records[0]] : [];
      this.pagedRecords = this.records.length ? [this.records.slice()] : [[]];
      this.schedulePaginate();
      return;
    }
    this.api.deleteRm(data.id).subscribe({
      next: () => {
        this.message.success('删除成功');
        this.loadFromServer();
      },
      error: (err) => {
        console.error(err);
        this.message.error('删除失败');
      },
    });
  }

  handleOk(): void {
    const pid = this.hostPatient.getPid();
    if (!pid) {
      this.message.warning('请先选择病人（宿主需传入 patient.id）');
      return;
    }
    if (!this.recordForm.valid) {
      Object.values(this.recordForm.controls).forEach((control) => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }
    const fv = this.recordForm.value;
    this.docInfo.method = fv.method ?? 'CPAP法';
    const doctorSignature = this.hostPatient.resolveAccountName(fv.doctorAccountId);
    const v = { ...fv, doctorSignature };
    const body: Record<string, unknown> = {
      pid,
      operationTime: formatBackendDateTime(v.time),
      method: v.method,
      peepInitial: v.peep,
      pressureControl: v.pip,
      spo2Before: v.spo2 != null ? String(v.spo2) : undefined,
      complications: buildRmExtra({
        id: '',
        time: new Date(),
        stage: v.stage,
        method: v.method,
        peep: v.peep,
        pip: v.pip,
        spo2: v.spo2,
        hr: v.hr,
        bp: v.bp,
        vt: v.vt,
        cdyn: v.cdyn,
        complications: v.complications,
        doctorSignature: v.doctorSignature,
      } as RmRow),
      doctorSignature: v.doctorSignature,
      doctorAccountId: v.doctorAccountId,
    };
    if (this.isEdit && this.editingId && !this.editingId.startsWith('r-')) {
      body['id'] = this.editingId;
    }

    this.api.saveRm(body).subscribe({
      next: () => {
        this.message.success('保存成功');
        this.isModalVisible = false;
        this.loadFromServer();
      },
      error: (err) => {
        console.error(err);
        this.message.error(err?.error?.message || '保存失败');
      },
    });
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
