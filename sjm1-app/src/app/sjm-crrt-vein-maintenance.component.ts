/**
 * 深静脉维护记录单（三）·透析管 —— Angular 独立组件
 * 访问路径：/form/sjmCrrt
 *
 * 数据逻辑
 * ------------------------------------------------------------------
 * - 通过 HostPatientService（根单例）获取患者信息。
 * - 用 patient.id 查询 tubeExe：pid == patient.id 且 type == '透析管'。
 * - 表格行数据来自该 tubeExe.tubeRecordList 中 valid === true 的记录。
 * - 编辑字段持久化到 MongoDB。
 */

import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
	AfterViewInit,
	ChangeDetectorRef,
	Component,
	ElementRef,
	OnDestroy,
	OnInit,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';

/* ----------------------------- 数据模型 ----------------------------- */

interface TubeRecord {
	time?: string;
	insertLength?: string;
	dressing?: string;
	catheterCulture?: string;
	exposureLength?: string;
	bloodLevel?: string;
	waterWave?: string;
	infect?: string;
	h_situation?: string;
	other?: string;
	recordUserName?: string;
	valid?: boolean;
}

interface TubeExe {
	id?: string;
	_id?: string;
	pid?: string;
	type?: string;
	body?: string;
	tubeLocation?: string;
	startTime?: string;
	tubeRecordList?: TubeRecord[];
	valid?: boolean;
}

interface RenderPage {
	index: number;
	rows: TubeRecord[];
}

@Component({
	selector: 'app-sjm-crrt-vein-maintenance',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<!-- 顶部工具栏（打印时隐藏） -->
		<div class="toolbar no-print">
			<div class="toolbar-left"></div>
			<div class="toolbar-right">
				<label class="page-select">
					页码选择：
					<select [(ngModel)]="selectedPage">
						<option [ngValue]="null">全部</option>
						<option *ngFor="let p of pages" [ngValue]="p.index">
							第 {{p.index}} 页
						</option>
					</select>
				</label>
				<button type="button" class="btn" (click)="onPrint()">打印</button>
			</div>
		</div>

		<div class="loading no-print" *ngIf="loading">加载中…</div>

		<!-- 打印/展示区域：逐页渲染 -->
		<div class="print-root" *ngIf="!loading">
			<section
				class="sheet"
				*ngFor="let page of pages; let pi = index"
				[class.print-hidden]="selectedPage !== null && selectedPage !== page.index"
			>
				<!-- 单行标题 -->
				<header class="sheet-head">
					<div class="title-line">{{hospitalName}}深静脉维护记录单（三）</div>
				</header>

				<!-- 页眉基本信息 -->
				<div class="patient-info">
					<div class="info-row">
						<label class="cb"><input type="checkbox" [(ngModel)]="dialysisChecked" [disabled]="!hasData" />透析导管</label>
					</div>
					<div class="info-row">
						<span class="info-item"><b>科室：</b>{{patient?.dept || '—'}}</span>
						<span class="info-item"><b>姓名：</b>{{patient?.name || '—'}}</span>
						<span class="info-item"><b>床号：</b>{{patient?.hisBed || '—'}}</span>
						<span class="info-item"><b>住院号：</b>{{patient?.mrn || '—'}}</span>
						<span class="info-item"><b>年龄：</b>{{age ?? '—'}}</span>
						<span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
					</div>
					<div class="info-row">
						<span class="info-item wide"><b>诊断：</b>{{diagnosisDisplay}}</span>
					</div>
					<div class="info-row">
						<label class="cb"><input type="checkbox" [(ngModel)]="isInHospital" (ngModelChange)="onInHospitalChange()" [disabled]="!hasData" />院内置管</label>
						<span class="info-item"><b>置管时间：</b>{{fmtDateTime(tube?.startTime)}}</span>
						<label class="cb"><input type="checkbox" [(ngModel)]="isOutHospital" (ngModelChange)="onOutHospitalChange()" [disabled]="!hasData" />院外带入</label>
						<span class="info-item"><b>置入位置：</b>{{tube?.body || '—'}}</span>
					</div>
				</div>

				<!-- 记录表格 -->
				<table class="record-table">
					<colgroup>
						<col style="width:14%" />
						<col style="width:13%" />
						<col style="width:11%" />
						<col style="width:11%" />
						<col style="width:11%" />
						<col style="width:26%" />
						<col style="width:14%" />
					</colgroup>
					<thead>
						<tr>
							<th rowspan="2">日期/时间</th>
							<th colspan="5">内容</th>
							<th rowspan="2">签名</th>
						</tr>
						<tr>
							<th>换敷料</th>
							<th>渗血</th>
							<th>疼痛</th>
							<th>红肿</th>
							<th>其他</th>
						</tr>
					</thead>
					<tbody>
						<tr *ngFor="let r of pagePaddedRows(page)">
							<td>{{r ? fmtDateTime(r.time) : ''}}</td>
							<td>{{r ? (r.dressing || '') : ''}}</td>
							<td>{{r ? (r.bloodLevel || '') : ''}}</td>
							<td>{{r ? (r.waterWave || '') : ''}}</td>
							<td>{{r ? (r.infect || '') : ''}}</td>
							<td>{{r ? (r.other || '') : ''}}</td>
							<td>{{r ? (r.recordUserName || '') : ''}}</td>
						</tr>
					</tbody>
				</table>

				<!-- 备注 + 页码 -->
				<div class="sheet-remark">
					备注：1.执行相应操作后请在栏内打"√"；透明敷料无异常7天更换，纱布敷料2天更换。<br>
					2.维护情况标注"有/无"；每班评估管道情况，每天至少记录一次。不涉及项目标注"/"。
				</div>
				<div class="sheet-pageno">第 {{pi + 1}} 页 共 {{pages.length}} 页</div>
			</section>
		</div>
	`,
	styles: [`
		:host {
			display: block;
			background: #f0f2f5;
			--fz-h2: 29px;
			--fz-xs4: 16px;
			--font-hei: 'SimHei', '黑体', sans-serif;
			--font-fangsong: 'FangSong', '仿宋', 'STFangsong', serif;
			--font-song: 'SimSun', '宋体', serif;
		}

		.toolbar {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 10px 16px;
			background: #fff;
			border-bottom: 1px solid #eee;
		}
		.toolbar-right {
			display: flex;
			align-items: center;
			gap: 12px;
		}
		.page-select select {
			padding: 4px 8px;
		}
		.btn {
			padding: 5px 16px;
			border: 1px solid #1890ff;
			background: #1890ff;
			color: #fff;
			border-radius: 4px;
			cursor: pointer;
		}
		.loading { padding: 16px; }

		/* A4 横向 */
		.sheet {
			box-sizing: border-box;
			width: 297mm;
			min-height: 210mm;
			margin: 16px auto;
			padding: 12mm 10mm 10mm;
			background: #fff;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
			position: relative;
			color: #000;
		}

		.sheet-head {
			text-align: center;
			padding-bottom: 6px;
		}
		.title-line {
			font-family: var(--font-hei);
			font-weight: 700;
			font-size: var(--fz-h2);
			line-height: 1.4;
		}

		.patient-info {
			font-family: var(--font-song);
			font-size: var(--fz-xs4);
			margin: 8px 0 6px;
		}
		.info-row {
			display: flex;
			flex-wrap: wrap;
			gap: 6px 24px;
			padding: 3px 0;
		}
		.info-item { white-space: nowrap; }
		.info-item.wide { flex: 1 1 100%; }
		.info-item b { font-weight: 700; }
		.cb { margin-right: 16px; }
		input:disabled {
			cursor: not-allowed;
			opacity: .6;
		}

		.record-table {
			width: 100%;
			border-collapse: collapse;
			font-family: var(--font-song);
			font-size: 13px;
			table-layout: fixed;
		}
		.record-table th,
		.record-table td {
			border: 1px solid #000;
			text-align: center;
			padding: 4px 2px;
			word-break: break-all;
			height: 30px;
		}
		.record-table th {
			background: transparent;
			font-weight: 700;
		}

		.sheet-remark {
			margin-top: 6px;
			text-align: left;
			font-size: 12px;
			line-height: 1.6;
			font-family: var(--font-song);
		}
		.sheet-pageno {
			margin-top: 4px;
			text-align: center;
			font-size: var(--fz-xs4);
			font-family: var(--font-song);
		}

		@media screen {
			.sheet { zoom: var(--sheet-scale, 1); }
		}

		/* 打印样式 */
		@media print {
			.no-print { display: none !important; }
			.print-hidden { display: none !important; }
		}
	`],
})
export class SjmCrrtVeinMaintenanceComponent implements OnInit, AfterViewInit, OnDestroy {
	/* 配置项 */
	private readonly API_TUBEEXE = '/api/v1/icu/tube-exe/listByPid';
	private readonly API_HOSPITAL = '/api/v1/config/hospital';
	private readonly API_VEIN_EXTRA = '/api/v1/icu/vein-maintenance-extra';
	private readonly TUBE_TYPE = '透析管';

	/* 组件状态 */
	loading = true;
	patient: any = null;
	tube: TubeExe | null = null;
	validRecords: TubeRecord[] = [];
	pages: RenderPage[] = [];

	hospitalName = '重钢总医院';
	age: number | null = null;
	diagnosisDisplay = '';
	dialysisChecked = true;
	isInHospital = false;
	isOutHospital = false;

	selectedPage: number | null = null;
	private rowsPerPage = 18;
	private pid = '';
	private sub = new Subscription();
	private ro?: ResizeObserver;

	constructor(
		private http: HttpClient,
		private hostPatient: HostPatientService,
		private cdr: ChangeDetectorRef,
		private host: ElementRef,
	) {}

	ngOnInit(): void {
		this.loadHospitalName();
		this.sub.add(
			this.hostPatient.patient$.subscribe((p) => {
				if (!p) return;
				this.patient = p;
				this.age = this.calcAge(p.birthday);
				this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis);
				const pid = this.hostPatient.getPid();
				if (!pid) return;
				this.pid = pid;
				this.loadFromServer();
			})
		);
	}

	ngAfterViewInit(): void {
		setTimeout(() => this.recomputePagination(), 0);
		this.fitScale();
		this.ro = new ResizeObserver(() => this.fitScale());
		this.ro.observe(this.host.nativeElement);
	}

	ngOnDestroy(): void {
		this.sub.unsubscribe();
		this.ro?.disconnect();
	}

	private loadFromServer(): void {
		if (!this.pid) return;
		this.loadTube(this.pid);
	}

	private fitScale(): void {
		const SHEET_W = 297 * (96 / 25.4);
		const avail = this.host.nativeElement.clientWidth - 32;
		const scale = Math.min(1, avail / SHEET_W);
		this.host.nativeElement.style.setProperty('--sheet-scale', String(scale));
	}

	private loadHospitalName(): void {
		this.http.get<{ hospitalName: string }>(this.API_HOSPITAL).subscribe({
			next: (res) => { if (res?.hospitalName) this.hospitalName = res.hospitalName; },
			error: () => {},
		});
	}

	get hasData(): boolean {
		return !!this.tube;
	}

	private tubeId(): string {
		return this.tube?.id || this.tube?._id || '';
	}

	private loadTube(pid: string): void {
		this.loading = true;
		this.http
			.get<TubeExe | TubeExe[]>(this.API_TUBEEXE, {
				params: { pid, type: this.TUBE_TYPE },
			})
			.pipe(finalize(() => {
				this.loading = false;
				this.cdr.detectChanges();
			}))
			.subscribe({
				next: (res) => {
					const list = Array.isArray(res) ? res : res ? [res] : [];
					const tubes = list.filter((t) => t?.type === this.TUBE_TYPE);
					this.tube = tubes[0] || null;
					this.applyTube();
				},
				error: () => {},
			});
	}

	private applyTube(): void {
		const records = this.tube?.tubeRecordList || [];
		this.validRecords = records
			.filter((r) => r && r.valid === true)
			.sort((a, b) => this.ts(a.time) - this.ts(b.time));

		const loc = (this.tube?.tubeLocation || '').trim();
		if (!loc) {
			this.isInHospital = false;
			this.isOutHospital = false;
		} else if (loc === '外院') {
			this.isInHospital = false;
			this.isOutHospital = true;
		} else {
			this.isInHospital = true;
			this.isOutHospital = false;
		}
		this.loadExtra();
	}

	private loadExtra(): void {
		this.http.get<any>(this.API_VEIN_EXTRA, {
			params: { pid: this.pid, tubeId: this.tubeId(), type: '透析管' }
		}).pipe(finalize(() => {
			this.paginate();
			this.cdr.detectChanges();
		})).subscribe({
			next: (d) => {
				if (d) {
					if (d.cvcChecked != null) this.dialysisChecked = d.cvcChecked;
					if (d.isInHospital != null) this.isInHospital = d.isInHospital;
					if (d.isOutHospital != null) this.isOutHospital = d.isOutHospital;
				}
			},
			error: () => {},
		});
	}

	private saveExtra(): void {
		if (!this.hasData) return;
		const body = {
			pid: this.pid,
			tubeId: this.tubeId(),
			type: '透析管',
			cvcChecked: this.dialysisChecked,
			isInHospital: this.isInHospital,
			isOutHospital: this.isOutHospital,
			otherText: '',
		};
		this.http.post(this.API_VEIN_EXTRA, body).subscribe({
			next: () => {},
			error: () => {},
		});
	}

	onFieldChange(): void { this.saveExtra(); }

	onInHospitalChange(): void {
		if (this.isInHospital) this.isOutHospital = false;
		this.saveExtra();
	}

	onOutHospitalChange(): void {
		if (this.isOutHospital) this.isInHospital = false;
		this.saveExtra();
	}

	genderText(g?: string): string {
		if (g === 'Male' || g === 'M' || g === '男') return '男';
		if (g === 'Female' || g === 'F' || g === '女') return '女';
		return g || '';
	}

	private formatDiagnosis(diagnosis?: string): string {
		if (!diagnosis) return '';
		const semicolonIndex = diagnosis.indexOf(';');
		const semicolonIndex2 = diagnosis.indexOf('；');
		let index = -1;
		if (semicolonIndex >= 0 && semicolonIndex2 >= 0) {
			index = Math.min(semicolonIndex, semicolonIndex2);
		} else if (semicolonIndex >= 0) {
			index = semicolonIndex;
		} else if (semicolonIndex2 >= 0) {
			index = semicolonIndex2;
		}
		if (index >= 0) {
			return diagnosis.substring(0, index).trim() || '';
		}
		return diagnosis.trim() || '';
	}

	private paginate(): void {
		const per = Math.max(1, this.rowsPerPage);
		const pages: RenderPage[] = [];
		if (this.validRecords.length === 0) {
			pages.push({ index: 1, rows: [] });
		} else {
			for (let i = 0; i < this.validRecords.length; i += per) {
				pages.push({
					index: pages.length + 1,
					rows: this.validRecords.slice(i, i + per),
				});
			}
		}
		this.pages = pages;
		if (this.selectedPage !== null && this.selectedPage > pages.length) {
			this.selectedPage = null;
		}
	}

	private recomputePagination(): void {
		const PX_PER_MM = 96 / 25.4;
		const usableH = (210 - 22) * PX_PER_MM;
		const fixedH = 280;
		const tableHeaderH = 60;
		const rowH = 30;
		const rows = Math.floor((usableH - fixedH - tableHeaderH) / rowH);
		const next = Math.max(5, rows);
		if (next !== this.rowsPerPage) {
			this.rowsPerPage = next;
			this.paginate();
			this.cdr.detectChanges();
		}
	}

	pagePaddedRows(page: RenderPage): (TubeRecord | null)[] {
		const rows: (TubeRecord | null)[] = [...page.rows];
		while (rows.length < this.rowsPerPage) rows.push(null);
		return rows;
	}

	onPrint(): void {
		const sheets = this.host.nativeElement.querySelectorAll('.sheet');
		if (!sheets.length) return;
		let body = '';
		sheets.forEach((s: HTMLElement) => {
			const c = s.cloneNode(true) as HTMLElement;
			c.querySelectorAll('input[type=checkbox]').forEach(el => {
				const sp = document.createElement('span');
				sp.textContent = (el as HTMLInputElement).checked ? '☑' : '☐';
				el.replaceWith(sp);
			});
			c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
			c.style.zoom = '1';
			body += c.outerHTML;
		});
		const css = `
			@page { size: A4 landscape; margin: 0; }
			html,body{margin:0;padding:0;}
			body{color:#000;font-family:'SimSun','宋体',serif;}
			.sheet{box-sizing:border-box;width:297mm;height:210mm;padding:12mm 10mm 10mm;margin:0;overflow:hidden;position:relative;page-break-after:always;box-shadow:none;}
			.sheet:last-of-type{page-break-after:auto;}
			.sheet-head{text-align:center;}
			.title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:29px;line-height:1.4;}
			.patient-info{font-size:16px;margin:8px 0 6px;}
			.info-row{display:flex;flex-wrap:wrap;gap:6px 24px;padding:3px 0;}
			.record-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;}
			.record-table th,.record-table td{border:1px solid #000;text-align:center;padding:4px 2px;height:30px;word-break:break-all;}
			.record-table th{background:transparent;font-weight:700;}
			.sheet-remark{margin-top:6px;text-align:left;font-size:12px;line-height:1.6;}
			.sheet-pageno{margin-top:4px;text-align:center;font-size:16px;}
		`;
		const win = window.open('', '_blank', 'width=1200,height=800');
		if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
		win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title></title><style>${css}</style></head><body>${body}</body></html>`);
		win.document.close();
		win.focus();
		setTimeout(() => { win.print(); win.close(); }, 300);
	}

	private calcAge(birthday?: string): number | null {
		if (!birthday) return null;
		const b = new Date(birthday);
		if (isNaN(b.getTime())) return null;
		const now = new Date();
		let age = now.getFullYear() - b.getFullYear();
		const m = now.getMonth() - b.getMonth();
		if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
		return age >= 0 ? age : null;
	}

	fmtDateTime(v?: string): string {
		if (!v) return '';
		const d = new Date(v);
		if (isNaN(d.getTime())) return v;
		const p = (n: number) => `${n}`.padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	private ts(v?: string): number {
		const t = v ? new Date(v).getTime() : 0;
		return isNaN(t) ? 0 : t;
	}
}
