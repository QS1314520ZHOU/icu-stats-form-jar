/**
 * 深静脉维护记录单（CVC 维护记录）—— Angular 独立组件
 * 访问路径：/form/sjm1
 *
 * 说明
 * ------------------------------------------------------------------
 * - 本文件是一个自包含的 Angular standalone 组件（内联模板 + 内联样式），
 *   可直接拷贝进现有 Angular 源码工程，并在路由中登记：
 *   { path: 'sjm1', component: Sjm1VeinMaintenanceComponent }
 * - 该应用最终以 <base href="/form/"> 部署，构建产物输出到后端 static/form/。
 * - 数据接口地址使用以 '/' 开头的绝对路径。
 *
 * 数据逻辑
 * ------------------------------------------------------------------
 * - 用 patient.id 查询 tubeExe：pid == patient.id 且 type == '中心静脉导管'。
 * - 表格行数据来自该 tubeExe.tubeRecordList 中 valid === true 的记录。
 * - 置管时间/置入位置来自 tubeExe 层级；其余列来自每条 tubeRecordList。
 *
 * 排版规范
 * ------------------------------------------------------------------
 * - 医院名称+标题：黑体加粗 二号(22pt≈29px)，单行居中。
 * - 页眉基本信息：标签 宋体加粗 小四(12pt≈16px)；内容 宋体 小四。
 * - 页脚"第 X 页 共 Y 页"：居中 宋体 小四。
 * - 页边距：上15mm 左10mm 右10mm 下10mm（见 @media print @page）。
 * - A4 横向：宽297mm，min-height 210mm。
 */

import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
	AfterViewInit,
	ChangeDetectorRef,
	Component,
	OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

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

interface Patient {
	id?: string;
	dept?: string;
	hisBed?: string;
	name?: string;
	gender?: string;
	birthday?: string;
	mrn?: string;
	clinicalDiagnosis?: string;
}

interface RenderPage {
	index: number;
	rows: TubeRecord[];
}

@Component({
	selector: 'app-sjm1-vein-maintenance',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<!-- 顶部工具栏（打印时隐藏） -->
		<div class="toolbar no-print">
			<div class="toolbar-left"></div>
			<div class="toolbar-right">
				<label class="page-select">
					页码：
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
		<div class="error no-print" *ngIf="errorMsg">{{errorMsg}}</div>

		<!-- 打印/展示区域：逐页渲染 -->
		<div class="print-root" *ngIf="!loading">
			<section
				class="sheet"
				*ngFor="let page of pages"
				[class.print-hidden]="selectedPage !== null && selectedPage !== page.index"
			>
				<!-- 单行标题：{医院名称}深静脉维护记录单（一） -->
				<header class="sheet-head">
					<div class="title-line">{{hospitalName}}深静脉维护记录单（一）</div>
				</header>

				<!-- 页眉基本信息 -->
				<div class="patient-info">
					<div class="info-row">
						<span class="info-item"><b>病区：</b>{{patient?.dept || '—'}}</span>
						<span class="info-item"><b>床号：</b>{{patient?.hisBed || '—'}}</span>
						<span class="info-item"><b>姓名：</b>{{patient?.name || '—'}}</span>
						<span class="info-item"><b>性别：</b>{{patient?.gender || '—'}}</span>
						<span class="info-item"><b>年龄：</b>{{age ?? '—'}}</span>
						<span class="info-item"><b>住院号：</b>{{patient?.mrn || '—'}}</span>
						<span class="info-item wide"><b>诊断：</b>{{diagnosisDisplay}}</span>
					</div>
					<div class="info-row">
						<span class="info-item">
							<label class="cb"><input type="checkbox" [(ngModel)]="cvcChecked" (ngModelChange)="onFieldChange()" />CVC</label>
						</span>
						<span class="info-item wide">
							<b>其他：</b><input class="other-input" type="text" [(ngModel)]="otherText" (ngModelChange)="onFieldChange()" />
						</span>
						<span class="info-item">
							<label class="cb"><input type="checkbox" [(ngModel)]="isInHospital" (ngModelChange)="onInHospitalChange()" />院内置管</label>
							<label class="cb"><input type="checkbox" [(ngModel)]="isOutHospital" (ngModelChange)="onOutHospitalChange()" />院外带入</label>
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

				<!-- 页脚 -->
				<footer class="sheet-foot">第 {{page.index}} 页 共 {{pages.length}} 页</footer>
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
		.loading,
		.error {
			padding: 16px;
		}
		.error {
			color: #d4380d;
		}

		/* A4 横向 */
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
		.info-item {
			white-space: nowrap;
		}
		.info-item.wide {
			flex: 1 1 100%;
			white-space: normal;
		}
		.info-item b {
			font-weight: 700;
		}
		.cb {
			margin-right: 16px;
		}
		.other-input {
			border: none;
			border-bottom: 1px solid #000;
			font-size: var(--fz-xs4);
			min-width: 160px;
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
			background: #f5f5f5;
			font-weight: 700;
		}

		.sheet-foot {
			position: absolute;
			left: 0;
			right: 0;
			bottom: 6mm;
			text-align: center;
			font-family: var(--font-song);
			font-size: var(--fz-xs4);
		}

		/* 打印样式 */
		@media print {
			@page {
				size: A4 landscape;
				margin: 15mm 10mm 10mm 10mm;
			}
			:host {
				background: #fff;
			}
			.no-print {
				display: none !important;
			}
			.sheet {
				width: auto;
				min-height: auto;
				margin: 0;
				padding: 0;
				box-shadow: none;
				page-break-after: always;
			}
			.sheet:last-of-type {
				page-break-after: auto;
			}
			.print-hidden {
				display: none !important;
			}
		}
	`],
})
export class Sjm1VeinMaintenanceComponent implements OnInit, AfterViewInit {
	/* 配置项 */
	private readonly API_TUBEEXE = '/api/v1/icu/tube-exe/listByPid';
	private readonly API_PATIENT = '/api/v1/icu/patients';
	private readonly API_HOSPITAL = '/api/v1/config/hospital';

	/* 组件状态 */
	loading = true;
	errorMsg = '';
	patient: Patient | null = null;
	tube: TubeExe | null = null;
	validRecords: TubeRecord[] = [];
	pages: RenderPage[] = [];

	hospitalName = '重钢总医院'; // 兜底默认值
	age: number | null = null;
	diagnosisDisplay = ''; // 处理后的诊断显示
	cvcChecked = true;
	otherText = '';
	isInHospital = false;
	isOutHospital = false;

	selectedPage: number | null = null;
	private rowsPerPage = 18;
	private pid = '';

	constructor(
		private http: HttpClient,
		private route: ActivatedRoute,
		private cdr: ChangeDetectorRef,
	) {}

	ngOnInit(): void {
		this.pid =
			this.route.snapshot.queryParamMap.get('pid') ||
			this.route.snapshot.queryParamMap.get('patientId') ||
			'';
		if (!this.pid) {
			this.loading = false;
			this.errorMsg = '缺少患者ID（pid）参数';
			return;
		}
		this.loadHospitalName();
		this.loadData(this.pid);
	}

	ngAfterViewInit(): void {
		setTimeout(() => this.recomputePagination(), 0);
	}

	/* 加载医院名称 */
	private loadHospitalName(): void {
		this.http.get<{ hospitalName: string }>(this.API_HOSPITAL).subscribe({
			next: (res) => {
				if (res?.hospitalName) {
					this.hospitalName = res.hospitalName;
				}
			},
			error: () => {
				// 使用兜底默认值
			},
		});
	}

	/* 数据加载 */
	private loadData(pid: string): void {
		this.loading = true;
		this.http
			.get<Patient>(this.API_PATIENT, { params: { id: pid } })
			.subscribe({
				next: (p) => {
					this.patient = p || null;
					this.age = this.calcAge(p?.birthday);
					this.diagnosisDisplay = this.formatDiagnosis(p?.clinicalDiagnosis);
					this.loadTube(pid);
				},
				error: () => {
					this.loadTube(pid);
				},
			});
	}

	private loadTube(pid: string): void {
		this.http
			.get<TubeExe | TubeExe[]>(this.API_TUBEEXE, {
				params: { pid, type: '中心静脉导管' },
			})
			.subscribe({
				next: (res) => {
					const list = Array.isArray(res) ? res : res ? [res] : [];
					const tubes = list.filter((t) => t?.type === '中心静脉导管');
					this.tube = tubes[0] || null;
					this.applyTube();
					this.loading = false;
					this.recomputePagination();
				},
				error: () => {
					this.loading = false;
					this.errorMsg = '置管数据加载失败';
				},
			});
	}

	/* 基于 tube 计算派生状态 */
	private applyTube(): void {
		const records = this.tube?.tubeRecordList || [];
		this.validRecords = records
			.filter((r) => r && r.valid === true)
			.sort((a, b) => this.ts(a.time) - this.ts(b.time));

		// 置管来源默认值
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

		// 从 localStorage 恢复持久化值
		this.loadFromLocalStorage();
		this.paginate();
	}

	/* localStorage 持久化 */
	private getStorageKey(): string {
		const tubeId = this.tube?.id || this.tube?._id || this.pid;
		return `sjm1:${this.pid}:${tubeId}`;
	}

	private loadFromLocalStorage(): void {
		try {
			const key = this.getStorageKey();
			const saved = localStorage.getItem(key);
			if (saved) {
				const data = JSON.parse(saved);
				if (data.cvcChecked !== undefined) this.cvcChecked = data.cvcChecked;
				if (data.isInHospital !== undefined) this.isInHospital = data.isInHospital;
				if (data.isOutHospital !== undefined) this.isOutHospital = data.isOutHospital;
				if (data.otherText !== undefined) this.otherText = data.otherText;
			}
		} catch (e) {
			// 忽略解析错误
		}
	}

	private saveToLocalStorage(): void {
		try {
			const key = this.getStorageKey();
			const data = {
				cvcChecked: this.cvcChecked,
				isInHospital: this.isInHospital,
				isOutHospital: this.isOutHospital,
				otherText: this.otherText,
			};
			localStorage.setItem(key, JSON.stringify(data));
		} catch (e) {
			// 忽略存储错误
		}
	}

	onFieldChange(): void {
		this.saveToLocalStorage();
	}

	onInHospitalChange(): void {
		if (this.isInHospital) {
			this.isOutHospital = false;
		}
		this.saveToLocalStorage();
	}

	onOutHospitalChange(): void {
		if (this.isOutHospital) {
			this.isInHospital = false;
		}
		this.saveToLocalStorage();
	}

	/* 诊断字段处理：取第一个分号前的内容 */
	private formatDiagnosis(diagnosis?: string): string {
		if (!diagnosis) return '—';
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
			return diagnosis.substring(0, index).trim() || '—';
		}
		return diagnosis.trim() || '—';
	}

	/* 分页 */
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

	/**
	 * A4 横向自动计算每页行数：
	 * 297mm 宽、210mm 高；可用高度 = 210 - 上15 - 下10 = 185mm
	 * 固定高度：标题约40px + 页眉信息约80px + 表头约60px + 页脚约30px = 210px ≈ 55mm
	 * 可用行高 = 185 - 55 = 130mm；行高30px ≈ 8mm；每页约 130/8 ≈ 16 行
	 */
	private recomputePagination(): void {
		const PX_PER_MM = 96 / 25.4;
		const pageH = 210 * PX_PER_MM; // A4 横向高度
		const usableH = pageH - (15 + 10) * PX_PER_MM; // 减上下边距
		const fixedH = 210; // 标题+页眉+表头+页脚固定区块(px)
		const tableHeaderH = 60; // 两行表头
		const rowH = 30; // 与 .record-table td height 一致
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

	/* 打印 */
	onPrint(): void {
		window.print();
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
		if (isNaN(d.getTime())) return v;
		const p = (n: number) => `${n}`.padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
			d.getHours(),
		)}:${p(d.getMinutes())}`;
	}

	private ts(v?: string): number {
		const t = v ? new Date(v).getTime() : 0;
		return isNaN(t) ? 0 : t;
	}
}
