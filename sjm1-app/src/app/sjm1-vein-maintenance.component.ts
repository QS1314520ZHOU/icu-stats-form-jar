/**
 * 深静脉维护记录单（CVC 维护记录）—— Angular 独立组件
 * 访问路径：/form/sjm1
 *
 * 说明
 * ------------------------------------------------------------------
 * - 本文件是一个自包含的 Angular standalone 组件（内联模板 + 内联样式），
 *   可直接拷贝进现有 Angular 源码工程，并在路由中登记：
 *   { path: 'sjm1', component: Sjm1VeinMaintenanceComponent }
 * - 该应用最终以 <base href="/form/"> 部署，构建产物输出到后端 static/form/，
 *   因此静态资源（如 hospitalLog.png）请放到构建 assets 或 static/form/ 根下，
 *   使其可通过 /form/hospitalLog.png 访问。
 * - 数据接口地址（API_TUBEEXE / API_PATIENT）需按你后端实际接口调整（见 TODO）。
 *   接口请使用以 '/' 开头的绝对路径，避免 base href=/form/ 把请求拼成 /form/xxx。
 *
 * 数据逻辑
 * ------------------------------------------------------------------
 * - 用 patient.id 查询 tubeExe：pid == patient.id 且 type == '中心静脉导管'。
 * - 表格行数据来自该 tubeExe.tubeRecordList 中 valid === true 的记录。
 * - 置管时间/置入位置来自 tubeExe 层级；其余列来自每条 tubeRecordList。
 *
 * 排版规范
 * ------------------------------------------------------------------
 * - 医院名称：黑体加粗 二号(22pt≈29px)；副标题：仿宋加粗 二号。
 * - 页眉基本信息：标签 宋体加粗 小四(12pt≈16px)；内容 宋体 小四。
 * - 页脚“第 X 页 共 Y 页”：居中 宋体 小四。
 * - 页边距：上15mm 左10mm 右10mm 下10mm（见 @media print @page）。
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
	time?: string; // 日期时间
	insertLength?: string; // 置管长度
	dressing?: string; // 换敷料
	catheterCulture?: string; // 更换输液接头
	exposureLength?: string; // 外露长度(cm)
	bloodLevel?: string; // 渗血
	waterWave?: string; // 疼痛
	infect?: string; // 红肿感染
	h_situation?: string; // 回血
	other?: string; // 其他
	recordUserName?: string; // 签名
	valid?: boolean;
}

interface TubeExe {
	pid?: string;
	type?: string; // 期望为“中心静脉导管”
	body?: string; // 置入位置
	tubeLocation?: string; // 置管来源判断依据
	startTime?: string; // 置管时间
	tubeRecordList?: TubeRecord[];
	valid?: boolean;
}

interface Patient {
	id?: string;
	dept?: string; // 病区
	hisBed?: string; // 床号
	name?: string; // 姓名
	gender?: string; // 性别
	birthday?: string; // 生日（用于计算年龄）
	mrn?: string; // 住院号
	clinicalDiagnosis?: string; // 诊断
}

/** 单页渲染模型：一页的数据行 + 页码 */
interface RenderPage {
	index: number; // 从 1 开始
	rows: TubeRecord[];
}

@Component({
	selector: 'app-sjm1-vein-maintenance',
	standalone: true,
	imports: [CommonModule, FormsModule],
	template: `
		<!-- 顶部工具栏（打印时隐藏） -->
		<div class="toolbar no-print">
			<div class="toolbar-left">
				<!-- 按批注：删除“历史记录/添加记录”按钮 -->
			</div>
			<div class="toolbar-right">
				<!-- 批注：把“规范与帮助”改为页码下拉选择器；留空=全部 -->
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
				<!-- 信头：logo + 医院名称 + 副标题 -->
				<header class="sheet-head">
					<img class="hospital-logo" src="hospitalLog.png" alt="logo" />
					<div class="title-wrap">
						<div class="hospital-name">{{hospitalName}}</div>
						<div class="form-subtitle">深静脉维护记录单（一）</div>
					</div>
				</header>

				<!-- 页眉基本信息 -->
				<div class="patient-info">
					<div class="info-row">
						<span class="info-item"><b>病区：</b>{{patient?.dept || '—'}}</span>
						<span class="info-item"><b>姓名：</b>{{patient?.name || '—'}}</span>
						<span class="info-item"><b>性别：</b>{{patient?.gender || '—'}}</span>
						<span class="info-item"><b>年龄：</b>{{age ?? '—'}}</span>
					</div>
					<div class="info-row">
						<span class="info-item"><b>床号：</b>{{patient?.hisBed || '—'}}</span>
						<span class="info-item"><b>住院号：</b>{{patient?.mrn || '—'}}</span>
						<span class="info-item wide"><b>诊断：</b>{{patient?.clinicalDiagnosis || '—'}}</span>
					</div>
					<div class="info-row">
						<span class="info-item">
							<label class="cb"><input type="checkbox" [(ngModel)]="cvcChecked" />CVC</label>
						</span>
						<span class="info-item">
							<label class="cb"><input type="checkbox" [checked]="isInHospital" disabled />院内置管</label>
							<label class="cb"><input type="checkbox" [checked]="isOutHospital" disabled />院外带入</label>
						</span>
						<span class="info-item wide">
							<b>其他：</b><input class="other-input" type="text" [(ngModel)]="otherText" />
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
	styles: [
		`
			:host {
				display: block;
				background: #f0f2f5;
				/* 字号：二号≈29px，小四≈16px */
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

			/* 单页纸张（A4 纵向） */
			.sheet {
				box-sizing: border-box;
				width: 210mm;
				min-height: 297mm;
				margin: 16px auto;
				padding: 15mm 10mm 10mm 10mm; /* 上 右/左 下 */
				background: #fff;
				box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
				position: relative;
				color: #000;
			}

			.sheet-head {
				position: relative;
				text-align: center;
				padding-bottom: 6px;
			}
			.hospital-logo {
				position: absolute;
				left: 0;
				top: 0;
				height: 56px;
				object-fit: contain;
			}
			.hospital-name {
				font-family: var(--font-hei);
				font-weight: 700;
				font-size: var(--fz-h2);
				line-height: 1.4;
			}
			.form-subtitle {
				font-family: var(--font-fangsong);
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

			/* ---------------- 打印样式 ---------------- */
			@media print {
				@page {
					size: A4 portrait;
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
		`,
	],
})
export class Sjm1VeinMaintenanceComponent implements OnInit, AfterViewInit {
	/* ------------------------- 可配置项 / TODO ------------------------- */
	// 按后端实际接口调整（务必以 '/' 开头，绝对路径）
	private readonly API_TUBEEXE = '/api/v1/icu/tube-exe/listByPid'; // GET ?pid=&type=中心静脉导管
	private readonly API_PATIENT = '/api/v1/icu/patients'; // GET ?id=
	readonly hospitalName = '医疗机构名称'; // TODO: 替换为真实医院名称或从接口取

	/* ------------------------- 组件状态 ------------------------- */
	loading = true;
	errorMsg = '';
	patient: Patient | null = null;
	tube: TubeExe | null = null;
	validRecords: TubeRecord[] = [];
	pages: RenderPage[] = [];

	age: number | null = null;
	cvcChecked = true; // CVC 默认勾选，可修改
	otherText = '';
	isInHospital = false; // 院内置管
	isOutHospital = false; // 院外带入

	selectedPage: number | null = null; // 页码下拉：null=全部

	// 每页最多行数（自动计算，见 recomputePagination）
	private rowsPerPage = 18;

	constructor(
		private http: HttpClient,
		private route: ActivatedRoute,
		private cdr: ChangeDetectorRef,
	) {}

	ngOnInit(): void {
		// TODO: 确认现有界面如何传递患者ID；此处默认从 URL query 读取 ?pid= 或 ?patientId=
		const pid =
			this.route.snapshot.queryParamMap.get('pid') ||
			this.route.snapshot.queryParamMap.get('patientId') ||
			'';
		if (!pid) {
			this.loading = false;
			this.errorMsg = '缺少患者ID（pid）参数';
			return;
		}
		this.loadData(pid);
	}

	ngAfterViewInit(): void {
		setTimeout(() => this.recomputePagination(), 0);
	}

	/* ------------------------- 数据加载 ------------------------- */
	private loadData(pid: string): void {
		this.loading = true;
		this.http
			.get<Patient>(this.API_PATIENT, { params: { id: pid } })
			.subscribe({
				next: (p) => {
					this.patient = p || null;
					this.age = this.calcAge(p?.birthday);
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
					// TODO(核实): 若规则为“取有效置管”，改为 tubes.filter(t => t.valid)
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

	/** 基于 tube 计算派生状态：有效记录、置管来源、分页 */
	private applyTube(): void {
		const records = this.tube?.tubeRecordList || [];
		this.validRecords = records
			.filter((r) => r && r.valid === true)
			.sort((a, b) => this.ts(a.time) - this.ts(b.time));

		// 置管来源：tubeLocation 为空 -> 都不判断；非空且不等于“外院”->院内；等于“外院”->院外
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
		this.paginate();
	}

	/* ------------------------- 分页 ------------------------- */
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
	 * 自动计算每页最多放多少行：
	 * A4 可用高度 - (信头/页眉/表头/页脚) 后，除以行高。96dpi 下 1mm≈3.78px。
	 */
	private recomputePagination(): void {
		const PX_PER_MM = 96 / 25.4;
		const pageH = 297 * PX_PER_MM;
		const usableH = pageH - (15 + 10) * PX_PER_MM; // 减上下边距
		const fixedH = 210; // 信头+页眉信息+页脚等固定区块估算(px)
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

	/** 每页补足空行，保持表格版式整齐 */
	pagePaddedRows(page: RenderPage): (TubeRecord | null)[] {
		const rows: (TubeRecord | null)[] = [...page.rows];
		while (rows.length < this.rowsPerPage) rows.push(null);
		return rows;
	}

	/* ------------------------- 打印 ------------------------- */
	onPrint(): void {
		// selectedPage=null 打印全部；否则模板通过 .print-hidden 只保留该页
		window.print();
	}

	/* ------------------------- 工具方法 ------------------------- */
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
