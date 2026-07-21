/**
 * 深静脉维护记录单（CVC 维护记录）—— Angular 独立组件
 * 访问路径：/form/sjm1
 *
 * 数据逻辑
 * ------------------------------------------------------------------
 * - 通过 HostPatientService（根单例）获取患者信息。
 * - 用 patient.id 查询 tubeExe：pid == patient.id 且 type == '中心静脉导管'。
 * - 表格行数据来自该 tubeExe.tubeRecordList 中 valid === true 的记录。
 * - 编辑字段（CVC/院内置管/院外带入/其他）持久化到 MongoDB。
 *
 * 排版规范
 * ------------------------------------------------------------------
 * - 医院名称+标题：黑体加粗 二号(22pt≈29px)，单行居中。
 * - 页眉基本信息：标签 宋体加粗 小四(12pt≈16px)；内容 宋体 小四。
 * - 页脚：备注左下，页码居中。
 * - A4 横向：宽297mm，min-height 210mm。
 */

import { HttpClient } from '@angular/common/http';
import {
	AfterViewInit,
	ChangeDetectorRef,
	Component,
	ElementRef,
	OnDestroy,
	OnInit,
} from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { HostPatientService } from './services/host-patient.service';
import { measureRowCapacity } from './form-measure.util';

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
	standalone: false,
		selector: 'app-sjm1-vein-maintenance',
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

		<div class="loading no-print" *ngIf="loading">加载中,可以切换患者快速加载…</div>

		<!-- 打印/展示区域：逐页渲染 -->
		<div class="print-root" *ngIf="!loading">
			<section
				class="sheet"
				*ngFor="let page of pages"
				[class.print-hidden]="selectedPage !== null && selectedPage !== page.index"
				[class.sheet-hidden]="selectedPage !== null && selectedPage !== page.index"
			>
				<!-- 单行标题 -->
				<header class="sheet-head">
					<div class="title-line">{{hospitalName}}深静脉维护记录单（一）</div>
				</header>

				<!-- 页眉基本信息 -->
				<div class="patient-info">
					<div class="info-row">
						<span class="info-item"><b>病区：</b>{{patient?.dept || ''}}</span>
						<span class="info-item"><b>床号：</b>{{patient?.hisBed || ''}}</span>
						<span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
						<span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
						<span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
						<span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
						<span class="info-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
					</div>
					<div class="info-row">
						<span class="info-item">
							<label class="cb"><input type="checkbox" [(ngModel)]="cvcChecked" (ngModelChange)="onFieldChange()" [disabled]="!hasData" />CVC</label>
						</span>
						<span class="info-item">
							<b>其他：</b><input class="other-input" type="text" [(ngModel)]="otherText" (ngModelChange)="onFieldChange()" [disabled]="!hasData" />
						</span>
						<span class="info-item">
							<label class="cb"><input type="checkbox" [(ngModel)]="isInHospital" (ngModelChange)="onInHospitalChange()" [disabled]="!hasData" />院内置管</label>
							<label class="cb"><input type="checkbox" [(ngModel)]="isOutHospital" (ngModelChange)="onOutHospitalChange()" [disabled]="!hasData" />院外带入</label>
						</span>
					</div>
				</div>

				<!-- 记录表格 -->
				<table class="record-table">
					<thead>
						<tr>
							<th rowspan="2">日期时间</th>
							<th colspan="6">置管信息</th>
							<th colspan="6">维护信息</th>
						</tr>
						<tr>
							<th>置管时间</th>
							<th>置管长度</th>
							<th>置入位置</th>
							<th>换敷料</th>
							<th>更换输液接头</th>
							<th>外露长度(cm)</th>
							<th>渗血</th>
							<th>疼痛</th>
							<th>红肿感染</th>
							<th>回血</th>
							<th>其他</th>
							<th>签名</th>
						</tr>
					</thead>
					<tbody>
						<tr *ngFor="let r of pagePaddedRows(page)">
							<td>{{r ? fmtDateTime(r.time) : ''}}</td>
							<td>{{r ? fmtDateTime(tube?.startTime) : ''}}</td>
							<td>{{r ? (r.insertLength || '') : ''}}</td>
							<td>{{r ? (tube?.body || '') : ''}}</td>
							<td>{{r ? (r.dressing || '') : ''}}</td>
							<td>{{r ? (r.catheterCulture || '') : ''}}</td>
							<td>{{r ? (r.exposureLength || '') : ''}}</td>
							<td>{{r ? (r.bloodLevel || '') : ''}}</td>
							<td>{{r ? (r.waterWave || '') : ''}}</td>
							<td>{{r ? (r.infect || '') : ''}}</td>
							<td>{{r ? (r.h_situation || '') : ''}}</td>
							<td>{{r ? (r.other || '') : ''}}</td>
							<td>{{r ? (r.recordUserName || '') : ''}}</td>
						</tr>
					</tbody>
				</table>

				<!-- 备注 + 页码 -->
				<div class="sheet-remark">
					备注：1.执行相应操作后请在栏内打"√"；透明敷料无异常7天更换，纱布敷料2天更换。<br>
					2.置入长度根据实际情况记录。3.维护情况标注"有/无"；每班评估管道情况，每天至少记录一次。不涉及项目标注"/"。
				</div>
				<div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
			</section>
		</div>
	`,
	styles: [`
		:host {
			display: block;
			background: #f0f2f5;
		}

		.toolbar {
			position: sticky;
			top: 0;
			z-index: 50;
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

		.sheet {
			box-sizing: border-box;
			width: 297mm;
			min-height: 210mm;
			margin: 16px auto;
			padding: 15mm 10mm 10mm 10mm;
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
			font-family: 'SimHei', '黑体', sans-serif;
			font-weight: 700;
			font-size: 24pt;
			line-height: 1.4;
		}

		.patient-info {
			font-family: 'SimSun', '宋体', serif;
			font-size: 13pt;
			font-weight: 400;
			margin: 2px 0;
			color: #000;
		}
		.info-row {
			display: flex;
			flex-wrap: wrap;
			gap: 6px 24px;
			padding: 3px 0;
		}
		.info-item { white-space: nowrap; }
		.info-item b, .info-item strong { font-family: inherit; font-size: inherit; font-style: inherit; line-height: inherit; color: inherit; font-weight: 700; }
		.info-item b { font-weight: 700; }
		.cb { margin-right: 16px; }
		.other-input {
			border: none;
			font-size: 12pt;
			min-width: 160px;
		}
		input:disabled, select:disabled {
			cursor: not-allowed;
			opacity: .6;
		}

		.record-table {
			width: 100%;
			border-collapse: collapse;
			font-family: 'SimSun', '宋体', serif;
			font-size: 9pt;
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
			margin-bottom: 10mm;
			text-align: left;
			font-size: 9.5pt;
			line-height: 1.3;
			font-family: 'SimSun', '宋体', serif;
		}
		.sheet-pageno { position: absolute; left: 12mm; right: 12mm; bottom: 6mm; margin: 0; text-align: center; font-family: 'SimSun', '宋体', serif; font-size: 13pt; font-weight: 400; line-height: 1; color: #000; white-space: nowrap; }

		.sheet-hidden { display: none; }

		@media screen {
			.sheet { zoom: var(--sheet-scale, 1); }
		}

		/* 打印样式 */
		@media print {
			.no-print { display: none !important; }
			.print-hidden { display: none !important; }
			.sheet-hidden { display: none !important; }
		}
	`],
})
export class Sjm1VeinMaintenanceComponent implements OnInit, AfterViewInit, OnDestroy {
	/* 配置项 */
	private readonly API_TUBEEXE = '/api/v1/icu/tube-exe/listByPid';
	private readonly API_HOSPITAL = '/api/v1/config/hospital';
	private readonly API_VEIN_EXTRA = '/api/v1/icu/vein-maintenance-extra';

	/* 组件状态 */
	loading = true;
	patient: any = null;
	tube: TubeExe | null = null;
	validRecords: TubeRecord[] = [];
	pages: RenderPage[] = [];

	hospitalName = '重钢总医院';
	age: number | null = null;
	diagnosisDisplay = '';
	cvcChecked = true;
	otherText = '';
	isInHospital = false;
	isOutHospital = false;

	selectedPage: number | null = null;
	private maxRowsPerPage = 18; // fallback, will be auto-calculated
	private pid = '';
	private destroy$ = new Subject<void>();
	private ro?: ResizeObserver;

	private __lastPid: string | null = null;

	constructor(
		private http: HttpClient,
		private hostPatient: HostPatientService,
		private cdr: ChangeDetectorRef,
		private host: ElementRef,
	) {}

	ngOnInit(): void {
		this.loadHospitalName();
		// 响应式订阅：pid 变化自动重载，switchMap 取消旧请求，distinctUntilChanged 去重
		this.hostPatient.patient$.pipe(
			filter(p => !!p),
			map(p => ({ p, pid: String(p.id || '').trim() })),
			filter(({ pid }) => !!pid),
			// ⑤ 去重丢弃诊断
			tap(({ pid }) => {
				if (pid && pid === this.__lastPid) { (window as any).__scLog?.('SKIP duplicate pid=' + (window as any).__scShortPid(pid)); }
				else { this.__lastPid = pid; }
			}),
			distinctUntilChanged((a, b) => a.pid === b.pid),
			tap(({ p, pid }) => {
				this.patient = p;
				this.pid = pid;
				this.age = this.calcAge(p.birthday);
				this.diagnosisDisplay = this.formatDiagnosis(p.clinicalDiagnosis);
			}),
			switchMap(({ pid }) => this.loadFromServer(pid)),
			takeUntil(this.destroy$),
		).subscribe();
	}

	ngAfterViewInit(): void {
		setTimeout(() => this.recomputePagination(), 0);
		this.fitScale();
		this.ro = new ResizeObserver(() => this.fitScale());
		this.ro.observe(this.host.nativeElement);
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
		this.ro?.disconnect();
	}

	/* 从服务器加载数据（返回 Observable，供 switchMap 自动取消） */
	private loadFromServer(pid: string) {
		(window as any).__scLog?.('LOAD start pid=' + (window as any).__scShortPid(pid));
		this.loading = true;
		return this.http
			.get<TubeExe | TubeExe[]>(this.API_TUBEEXE, {
				params: { pid, type: '中心静脉导管' },
			})
			.pipe(
				tap((res) => {
					(window as any).__scLog?.('LOAD done pid=' + (window as any).__scShortPid(pid) + ' count=' + (Array.isArray(res) ? res.length : (res ? 1 : 0)));
					const list = Array.isArray(res) ? res : res ? [res] : [];
					const tubes = list.filter((t) => t?.type === '中心静脉导管');
					this.tube = tubes[0] || null;
					this.applyTube();
				}),
				finalize(() => {
					(window as any).__scLog?.('sjm1: loadFromServer DONE', { pid });
					this.loading = false;
					this.cdr.detectChanges();
				}),
			);
	}

	/* 屏幕预览缩放 */
	private fitScale(): void {
		const SHEET_W = 297 * (96 / 25.4);
		const avail = this.host.nativeElement.clientWidth - 32;
		const scale = Math.min(1, avail / SHEET_W);
		this.host.nativeElement.style.setProperty('--sheet-scale', String(scale));
	}

	/* 加载医院名称 */
	private loadHospitalName(): void {
		this.http.get<{ hospitalName: string }>(this.API_HOSPITAL).subscribe({
			next: (res) => { if (res?.hospitalName) this.hospitalName = res.hospitalName; },
			error: () => {},
		});
	}

	/* 是否有置管数据 */
	get hasData(): boolean {
		return !!this.tube;
	}

	/* 获取 tubeId */
	private tubeId(): string {
		return this.tube?.id || this.tube?._id || '';
	}

	/* 基于 tube 计算派生状态 */
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

	/* 从 MongoDB 加载编辑字段 */
	private loadExtra(): void {
		this.http.get<any>(this.API_VEIN_EXTRA, {
			params: { pid: this.pid, tubeId: this.tubeId(), type: '中心静脉导管' }
		}).pipe(finalize(() => {
			this.autoPaginate();
		})).subscribe({
			next: (d) => {
				if (d) {
					if (d.cvcChecked != null) this.cvcChecked = d.cvcChecked;
					if (d.isInHospital != null) this.isInHospital = d.isInHospital;
					if (d.isOutHospital != null) this.isOutHospital = d.isOutHospital;
					if (d.otherText != null) this.otherText = d.otherText;
				}
			},
			error: () => {},
		});
	}

	/* 保存编辑字段到 MongoDB */
	private saveExtra(): void {
		if (!this.hasData) return;
		const body = {
			pid: this.pid,
			tubeId: this.tubeId(),
			type: '中心静脉导管',
			cvcChecked: this.cvcChecked,
			isInHospital: this.isInHospital,
			isOutHospital: this.isOutHospital,
			otherText: this.otherText,
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

	/* 性别显示转换 */
	genderText(g?: string): string {
		if (g === 'Male' || g === 'M' || g === '男') return '男';
		if (g === 'Female' || g === 'F' || g === '女') return '女';
		return g || '';
	}

	/* 诊断字段处理：分隔符截断 */
	private formatDiagnosis(diagnosis?: string): string {
		if (!diagnosis) return '';
		let index = -1;
		const seps = [';', '；', ',', '，'];
		for (const s of seps) {
			const i = diagnosis.indexOf(s);
			if (i >= 0 && (index < 0 || i < index)) index = i;
		}
		if (index >= 0) return diagnosis.substring(0, index).trim();
		return diagnosis.trim();
	}

	/* 自动分页：通过实际 DOM 测量计算每页行数 */
	private async autoPaginate(): Promise<void> {
		try {
			const fixedHtml = '<div class="sheet-head"><div class="title-line">' + this.hospitalName + '深静脉维护记录单（一）</div></div>' +
				'<div class="patient-info"><div class="info-row"><span class="info-item"><b>病区：</b>' + (this.patient?.dept || '') + '</span></div></div>' +
				'<table class="record-table"><thead><tr><th rowspan="2">日期时间</th><th colspan="6">置管信息</th><th colspan="6">维护信息</th></tr>' +
				'<tr><th>置管时间</th><th>置管长度</th><th>置入位置</th><th>换敷料</th><th>更换输液接头</th><th>外露长度(cm)</th>' +
				'<th>渗血</th><th>疼痛</th><th>红肿感染</th><th>回血</th><th>其他</th><th>签名</th></tr></thead></table>' +
				'<div class="sheet-remark">备注：1.执行相应操作后请在栏内打"√"</div>';
			const rowHtml = '<table class="record-table"><tr><td>2026-01-01 12:00</td><td>2026-01-01 12:00</td>' +
				'<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>';
			const capacity = await measureRowCapacity(fixedHtml, rowHtml, { safetyMargin: 12 });
			this.maxRowsPerPage = Math.max(5, Math.min(18, capacity));
		} catch(e) {
			// keep fallback 18
		}
		this.paginate();
		this.cdr.detectChanges();
	}

	/* 分页 */
	private paginate(): void {
		const per = Math.max(1, this.maxRowsPerPage);
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
		const usableH = (210 - 25) * PX_PER_MM;
		const fixedH = 280;
		const tableHeaderH = 60;
		const rowH = 30;
		const rows = Math.floor((usableH - fixedH - tableHeaderH) / rowH);
		const next = Math.max(5, rows);
		if (next !== this.maxRowsPerPage) {
			this.maxRowsPerPage = next;
			this.paginate();
			this.cdr.detectChanges();
		}
	}

	pagePaddedRows(page: RenderPage): (TubeRecord | null)[] {
		const rows: (TubeRecord | null)[] = [...page.rows];
		while (rows.length < this.maxRowsPerPage) rows.push(null);
		return rows;
	}

		/* 打印：独立窗口 + 横向 + 去页眉页脚 */
		onPrint(): void {
			const allSheets = Array.from(this.host.nativeElement.querySelectorAll('.sheet')) as HTMLElement[];
			if (!allSheets.length) return;
			const selectedPageNumber = this.selectedPage === null || this.selectedPage === undefined ? null : Number(this.selectedPage);
			if (selectedPageNumber !== null && (!Number.isInteger(selectedPageNumber) || selectedPageNumber < 1 || selectedPageNumber > this.pages.length)) {
				alert('选择的打印页码无效'); return;
			}
			let body = '';
			allSheets.forEach((s: HTMLElement, idx: number) => {
				const pageIndex = idx + 1;
				if (selectedPageNumber !== null && pageIndex !== selectedPageNumber) return;
				const c = s.cloneNode(true) as HTMLElement;
				c.classList.remove('sheet-hidden');
				c.querySelectorAll('input[type=checkbox]').forEach(el => {
						const sp = document.createElement('span');
						sp.textContent = (el as HTMLInputElement).checked ? '☑' : '☐';
						el.replaceWith(sp);
				});
				c.querySelectorAll('input[type=text]').forEach(el => {
						const sp = document.createElement('span');
						sp.textContent = (el as HTMLInputElement).value || '';
						sp.style.cssText = 'display:inline-block;min-width:160px;';
						el.replaceWith(sp);
				});
				c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
				c.style.zoom = '1';
				body += '<div class="print-page" data-page-index="' + pageIndex + '">' + c.outerHTML + '</div>';
			});
			const css = `

				@page { size: A4 landscape; margin:0; }
				html,body{margin:0;padding:0;background:#fff;}
				body{color:#000;font-family:'SimSun','宋体',serif;}
				.print-page{box-sizing:border-box;width:297mm;height:210mm;margin:0;padding:0;overflow:hidden;break-after:page;page-break-after:always;background:#fff;}
				.print-page:last-child{break-after:auto;page-break-after:auto;}
				.sheet{box-sizing:border-box;position:relative;width:297mm;height:210mm;margin:0;padding:4mm 10mm 12mm;overflow:hidden;box-shadow:none;background:#fff;color:#000;transform:none !important;zoom:1 !important;filter:none !important;text-shadow:none !important;}
				.sheet-head{text-align:center;padding-bottom:2px;}
				.title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:22pt;line-height:1.35;}
				.patient-info{font-family:'SimSun','宋体',serif;font-size:12pt;margin:2px 0;}
				.info-row{display:flex;flex-wrap:wrap;gap:6px 24px;padding:3px 0;}
				.record-table{width:100%;border-collapse:collapse;font-family:'SimSun','宋体',serif;font-size:9pt;table-layout:fixed;}
				.record-table th,.record-table td{border:1px solid #000;text-align:center;padding:4px 2px;height:30px;word-break:break-all;}
				.record-table th{background:transparent;font-weight:700;}
				.sheet-remark{margin-top:2px;margin-bottom:10mm;text-align:left;font-family:'SimSun','宋体',serif;font-size:8pt;line-height:1.3;}
				.sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:4mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
				.dt-date,.dt-time{display:block;white-space:nowrap;line-height:1.2;}

			`;
			const win = window.open('', '_blank', 'width=1400,height=900');
			if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
			win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + body + '</body></html>');
			win.document.close();
			const doPrint = () => { win.focus(); win.print(); };
			const ready = () => {
				const doc = win.document as any;
				if (doc.fonts?.ready) {
						doc.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); });
				} else { requestAnimationFrame(() => requestAnimationFrame(doPrint)); }
			};
			win.addEventListener('afterprint', () => { try { win.close(); } catch(e) {} });
			if ((win.document as any).readyState === 'complete') { ready(); }
			else { win.addEventListener('load', ready); }
		}

		/* 工具方法 */
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
		if (Number.isNaN(d.getTime())) return v;
		const p = (n: number) => `${n}`.padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
	}

	private ts(v?: string): number {
		const t = v ? new Date(v).getTime() : 0;
		return isNaN(t) ? 0 : t;
	}
}
