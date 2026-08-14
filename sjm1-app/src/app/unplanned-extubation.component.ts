/**
 * 非计划拔管风险评估及护理措施记录单 —— Angular 组件
 * 访问路径：/form/unPlannedCGZYYForm
 *
 * A4 横向；每组最多 6 条评估记录，生成 2 张物理页（评分页+护理措施页）
 * 参照 ToleranceScoreComponent 的数据加载、患者切换、账号签名回填、分页、缩放和打印逻辑
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
import { databaseTimeValue, formatShanghaiDate, formatShanghaiTime } from './form-date.util';

/* ============================= 配置区 ============================= */

const SCORE_TYPE = 'unPlannedCGZYYScore';

/** 未实施镇静或不适宜用 RASS 评分患者选项 */
const NO_RASS_OPTIONS = [
  { label: '昏迷', score: 0 },
  { label: '躁动', score: 3 },
  { label: '焦虑', score: 3 },
  { label: '嗜睡或昏睡或痴呆', score: 2 },
  { label: '定向力障碍', score: 3 },
  { label: '谵妄', score: 3 },
];

/** 舒适度评分 */
const SSD_OPTIONS = [
  { label: '安静舒适', score: 0 },
  { label: '轻微烦躁', score: 1 },
  { label: '烦躁', score: 2 },
  { label: '非常烦躁', score: 3 },
];

/** 沟通合作评分 */
const GTHZ_OPTIONS = [
  { label: '理解并配合', score: 0 },
  { label: '基本理解，偶尔不配合', score: 1 },
  { label: '不理解，完全不配合', score: 3 },
];

/** 行为合作评分 */
const XWHZ_OPTIONS = [
  { label: '行为配合', score: 0 },
  { label: '偶尔不配合', score: 1 },
  { label: '完全不配合', score: 2 },
];

/** 导管数量评分 */
const DGSL_OPTIONS = [
  { label: '1根', score: 1 },
  { label: '≥2根', score: 2 },
];

/** 导管固定评分 */
const DGGD_OPTIONS = [
  { label: '使用胶布或贴膜固定或系带固定', score: 3 },
  { label: '缝线固定', score: 2 },
  { label: '高举平台法固定', score: 1 },
];

/** 护理措施 19 条 */
const NURSE_MEASURES = [
  // 妥善固定 (0-4)
  { group: '妥善固定', label: '1. 妥善固定导管，标识清晰' },
  { group: '妥善固定', label: '2. 导管固定规范，无扭曲、折叠、受压' },
  { group: '妥善固定', label: '3. 导管连接紧密，无漏气、漏液' },
  { group: '妥善固定', label: '4. 引流袋/瓶固定牢固，低于引流口' },
  { group: '妥善固定', label: '5. 更换敷料时观察穿刺点情况' },
  // 患者管理 (5-7)
  { group: '患者管理', label: '6. 评估患者意识状态及配合程度' },
  { group: '患者管理', label: '7. 向患者/家属解释导管重要性' },
  { group: '患者管理', label: '8. 指导患者活动时保护导管' },
  // 镇静镇痛管理 (8-10)
  { group: '镇静镇痛管理', label: '9. 遵医嘱使用镇静镇痛药物' },
  { group: '镇静镇痛管理', label: '10. 评估镇静深度（RASS评分）' },
  { group: '镇静镇痛管理', label: '11. 观察镇静药物不良反应' },
  // 谵妄管理 (11-12)
  { group: '谵妄管理', label: '12. 评估患者谵妄状态（CAM-ICU）' },
  { group: '谵妄管理', label: '13. 谵妄患者采取非药物干预措施' },
  // 身体约束管理 (13-17)
  { group: '身体约束管理', label: '14. 遵医嘱实施身体约束' },
  { group: '身体约束管理', label: '15. 约束部位循环良好，无损伤' },
  { group: '身体约束管理', label: '16. 每2小时松解约束，活动肢体' },
  { group: '身体约束管理', label: '17. 约束期间加强巡视' },
  { group: '身体约束管理', label: '18. 记录约束使用情况' },
  // 尽早拔管 (18)
  { group: '尽早拔管', label: '19. 评估导管留置必要性，尽早拔管' },
];

/** 备注文本 */
const FOOTNOTE = '备注：\n' +
  '1. 评分范围 0-20 分，≥10 分为高危，5-9 分为中危，<5 分为低危。\n' +
  '2. 高危患者每班评估 1 次，中危患者每天评估 1 次，低危患者每周评估 1 次。\n' +
  '3. 病情变化时随时评估。\n' +
  '4. 护理措施：根据评估结果选择相应措施，在对应栏内打"√"。';

/* ============================= 数据模型 ============================= */

interface NurseMeasure { code?: string; value?: boolean; }

interface UnPlannedScore {
  rass?: number;
  noRass?: number;
  noRassIndexList?: number[];
  ssd?: number;
  gthz?: number;
  xwhz?: number;
  dgsl?: number;
  dggd?: number;
}

interface ScoreRecord {
  _id?: string;
  pid?: string;
  time?: string;
  scoreType?: string;
  total?: number;
  conclusion?: string;
  valid?: boolean;
  inputUserId?: string;
  inputUser?: string;
  nurseMeasureList?: NurseMeasure[];
  unPlannedCGZYYScore?: UnPlannedScore;
}

/** 单条评估记录（用于表格列） */
interface EvalColumn {
  time: string;
  rass: number | null;
  noRass: number | null;
  noRassIndexList: number[];
  ssd: number | null;
  gthz: number | null;
  xwhz: number | null;
  dgsl: number | null;
  dggd: number | null;
  total: number | null;
  conclusion: string;
  measures: boolean[];
  signUserId?: string;
  signName?: string;
}

/** 物理页 */
interface RenderPage {
  index: number;
  cols: EvalColumn[];
  isSecondPage: boolean; // true=护理措施页，false=评分页
}

/* ============================= 组件 ============================= */

@Component({
  standalone: false,
  selector: 'app-unplanned-extubation',
  template: `
    <div class="toolbar no-print">
      <div class="toolbar-right">
        <span class="page-select">页码选择：
          <select [(ngModel)]="selectedPage">
            <option [ngValue]="null">全部</option>
            <option *ngFor="let p of pages" [ngValue]="p.index">第 {{p.index}} 页</option>
          </select>
        </span>
        <button class="btn" (click)="onPrint()">打印</button>
      </div>
    </div>

    <div class="loading" *ngIf="loading">加载中…</div>

    <!-- 第一页：评分页 -->
    <ng-container *ngFor="let page of pages">
      <div class="sheet" *ngIf="!page.isSecondPage"
           [class.sheet-hidden]="selectedPage !== null && selectedPage !== page.index">
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}非计划拔管风险评估及护理措施记录单</div>
        </div>

        <div class="patient-info-row">
          <span class="info-item"><b>科室：</b>{{patient?.dept || ''}}</span>
          <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
          <span class="info-item"><b>床号：</b>{{patient?.hisBed ? (patient.hisBed.endsWith('床') ? patient.hisBed : patient.hisBed + '床') : ''}}</span>
          <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
          <span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
          <span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
          <span class="info-item diagnosis-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
        </div>

        <table class="record-table">
          <colgroup>
            <col class="item-col">
            <col class="sub-item-col">
            <col class="desc-col">
            <col class="score-col">
            <col class="data-col" *ngFor="let c of pagePaddedCols(page)">
          </colgroup>
          <thead>
            <tr>
              <th class="item-col">项目</th>
              <th class="sub-item-col">具体评估细则</th>
              <th class="desc-col">评估内容</th>
              <th class="score-col">分值</th>
              <th class="data-col" *ngFor="let c of pagePaddedCols(page)">
                <div class="dt-date">{{ c ? fmtDate(c.time) : '' }}</div>
                <div class="dt-time">{{ c ? fmtTime(c.time) : '' }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- 神志意识及精神状态 - 实施镇静剂 -->
            <tr>
              <td class="item-cell" rowspan="10">神志意识及<br>精神状态</td>
              <td class="sub-item-cell" rowspan="4">实施镇静剂<br>的患者</td>
              <td class="desc-cell">RASS -5~-3</td>
              <td class="score-cell">0</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkRass(c, 0) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">RASS -2~0</td>
              <td class="score-cell">1</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkRass(c, 1) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">RASS 1~2</td>
              <td class="score-cell">2</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkRass(c, 2) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">RASS 3~4</td>
              <td class="score-cell">3</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkRass(c, 3) }}</td>
            </tr>
            <!-- 神志意识及精神状态 - 未实施镇静 -->
            <tr>
              <td class="sub-item-cell" rowspan="6">未实施镇静或<br>不适宜用 RASS<br>评分患者</td>
              <td class="desc-cell">{{noRassOptions[0].label}}</td>
              <td class="score-cell">{{noRassOptions[0].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkNoRass(c, 0) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[1].label}}</td>
              <td class="score-cell">{{noRassOptions[1].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkNoRass(c, 1) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[2].label}}</td>
              <td class="score-cell">{{noRassOptions[2].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkNoRass(c, 2) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[3].label}}</td>
              <td class="score-cell">{{noRassOptions[3].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkNoRass(c, 3) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[4].label}}</td>
              <td class="score-cell">{{noRassOptions[4].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkNoRass(c, 4) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[5].label}}</td>
              <td class="score-cell">{{noRassOptions[5].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkNoRass(c, 5) }}</td>
            </tr>
            <!-- 舒适度 -->
            <tr>
              <td class="item-cell" rowspan="4">舒适度</td>
              <td class="sub-item-cell" rowspan="4"></td>
              <td class="desc-cell">{{ssdOptions[0].label}}</td>
              <td class="score-cell">{{ssdOptions[0].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'ssd', ssdOptions[0].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{ssdOptions[1].label}}</td>
              <td class="score-cell">{{ssdOptions[1].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'ssd', ssdOptions[1].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{ssdOptions[2].label}}</td>
              <td class="score-cell">{{ssdOptions[2].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'ssd', ssdOptions[2].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{ssdOptions[3].label}}</td>
              <td class="score-cell">{{ssdOptions[3].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'ssd', ssdOptions[3].score) }}</td>
            </tr>
            <!-- 沟通合作 -->
            <tr>
              <td class="item-cell" rowspan="3">沟通合作</td>
              <td class="sub-item-cell" rowspan="3"></td>
              <td class="desc-cell">{{gthzOptions[0].label}}</td>
              <td class="score-cell">{{gthzOptions[0].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'gthz', gthzOptions[0].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{gthzOptions[1].label}}</td>
              <td class="score-cell">{{gthzOptions[1].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'gthz', gthzOptions[1].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{gthzOptions[2].label}}</td>
              <td class="score-cell">{{gthzOptions[2].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'gthz', gthzOptions[2].score) }}</td>
            </tr>
            <!-- 行为合作 -->
            <tr>
              <td class="item-cell" rowspan="3">行为合作</td>
              <td class="sub-item-cell" rowspan="3"></td>
              <td class="desc-cell">{{xwhzOptions[0].label}}</td>
              <td class="score-cell">{{xwhzOptions[0].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'xwhz', xwhzOptions[0].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{xwhzOptions[1].label}}</td>
              <td class="score-cell">{{xwhzOptions[1].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'xwhz', xwhzOptions[1].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{xwhzOptions[2].label}}</td>
              <td class="score-cell">{{xwhzOptions[2].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'xwhz', xwhzOptions[2].score) }}</td>
            </tr>
            <!-- 导管数量 -->
            <tr>
              <td class="item-cell" rowspan="2">导管数量</td>
              <td class="sub-item-cell" rowspan="2"></td>
              <td class="desc-cell">{{dgslOptions[0].label}}</td>
              <td class="score-cell">{{dgslOptions[0].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'dgsl', dgslOptions[0].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{dgslOptions[1].label}}</td>
              <td class="score-cell">{{dgslOptions[1].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'dgsl', dgslOptions[1].score) }}</td>
            </tr>
            <!-- 导管固定 - 第一页只显示 3 分行 -->
            <tr>
              <td class="item-cell" rowspan="3">导管固定</td>
              <td class="sub-item-cell" rowspan="3"></td>
              <td class="desc-cell">{{dggdOptions[0].label}}</td>
              <td class="score-cell">{{dggdOptions[0].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'dggd', dggdOptions[0].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell" style="border-bottom:none;height:0;overflow:hidden;">{{dggdOptions[1].label}}</td>
              <td class="score-cell" style="border-bottom:none;height:0;overflow:hidden;">{{dggdOptions[1].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)" style="border-bottom:none;height:0;overflow:hidden;"></td>
            </tr>
            <tr>
              <td class="desc-cell" style="border-bottom:none;height:0;overflow:hidden;">{{dggdOptions[2].label}}</td>
              <td class="score-cell" style="border-bottom:none;height:0;overflow:hidden;">{{dggdOptions[2].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)" style="border-bottom:none;height:0;overflow:hidden;"></td>
            </tr>
          </tbody>
        </table>

        <div class="footnote">
          <div class="fn" *ngFor="let line of footnoteLines">{{line}}</div>
        </div>

        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>

      <!-- 第二页：护理措施页 -->
      <div class="sheet" *ngIf="page.isSecondPage"
           [class.sheet-hidden]="selectedPage !== null && selectedPage !== page.index">
        <div class="sheet-head">
          <div class="title-line">{{hospitalName}}非计划拔管风险评估及护理措施记录单</div>
        </div>

        <div class="patient-info-row">
          <span class="info-item"><b>科室：</b>{{patient?.dept || ''}}</span>
          <span class="info-item"><b>姓名：</b>{{patient?.name || ''}}</span>
          <span class="info-item"><b>床号：</b>{{patient?.hisBed ? (patient.hisBed.endsWith('床') ? patient.hisBed : patient.hisBed + '床') : ''}}</span>
          <span class="info-item"><b>住院号：</b>{{patient?.mrn || ''}}</span>
          <span class="info-item"><b>性别：</b>{{genderText(patient?.gender)}}</span>
          <span class="info-item"><b>年龄：</b>{{age ?? ''}}</span>
          <span class="info-item diagnosis-item"><b>诊断：</b>{{diagnosisDisplay}}</span>
        </div>

        <table class="record-table">
          <colgroup>
            <col class="item-col">
            <col class="sub-item-col">
            <col class="desc-col">
            <col class="score-col">
            <col class="data-col" *ngFor="let c of pagePaddedCols(page)">
          </colgroup>
          <thead>
            <tr>
              <th class="item-col">项目</th>
              <th class="sub-item-col">具体评估细则</th>
              <th class="desc-col">评估内容</th>
              <th class="score-col">分值</th>
              <th class="data-col" *ngFor="let c of pagePaddedCols(page)">
                <div class="dt-date">{{ c ? fmtDate(c.time) : '' }}</div>
                <div class="dt-time">{{ c ? fmtTime(c.time) : '' }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- 导管固定续项 -->
            <tr>
              <td class="item-cell" rowspan="2">导管固定<br>（续）</td>
              <td class="sub-item-cell" rowspan="2"></td>
              <td class="desc-cell">{{dggdOptions[1].label}}</td>
              <td class="score-cell">{{dggdOptions[1].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'dggd', dggdOptions[1].score) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{dggdOptions[2].label}}</td>
              <td class="score-cell">{{dggdOptions[2].score}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkField(c, 'dggd', dggdOptions[2].score) }}</td>
            </tr>
            <!-- 总分 -->
            <tr>
              <td class="sum-label" colspan="4">评估总分</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ c && c.total !== null ? c.total : '' }}</td>
            </tr>
            <!-- 危险程度 -->
            <tr>
              <td class="sum-label" colspan="4">危险程度</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ c ? c.conclusion : '' }}</td>
            </tr>
            <!-- 护理措施 -->
            <tr *ngFor="let m of nurseMeasures; let i = index">
              <td class="measure-label" [attr.rowspan]="m.rowspan" *ngIf="m.rowspan > 0">{{m.group}}</td>
              <td class="measure-item" colspan="2">{{m.label}}</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ checkMeasure(c, i) }}</td>
            </tr>
            <!-- 护士签名 -->
            <tr>
              <td class="sum-label" colspan="4">护士签名</td>
              <td class="data-col" *ngFor="let c of pagePaddedCols(page)">{{ c ? (c.signName || '') : '' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="footnote">
          <div class="fn" *ngFor="let line of footnoteLines">{{line}}</div>
        </div>

        <div class="sheet-pageno">第 {{page.index}} 页 共 {{pages.length}} 页</div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display:block; background:#f0f2f5; height:100vh; overflow:auto; }
    .toolbar { display:flex; justify-content:flex-end; align-items:center; padding:10px 16px; background:#fff; border-bottom:1px solid #eee; position:sticky; top:0; z-index:50; }
    .toolbar-right { display:flex; align-items:center; gap:12px; }
    .page-select select { padding:4px 8px; }
    .btn { padding:5px 16px; border:1px solid #1890ff; background:#1890ff; color:#fff; border-radius:4px; cursor:pointer; }
    .loading { padding:16px; font-family:'SimSun', '宋体', serif; }
    .sheet-hidden { display:none; }

    .sheet { box-sizing:border-box; width:297mm; min-height:210mm; margin:16px auto; padding:10mm 12mm; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.15); position:relative; color:#000; }
    .sheet-head { text-align:center; padding-bottom:6px; }
    .title-line { font-family:'SimHei', '黑体', sans-serif; font-weight:700; font-size:24pt; line-height:1.35; }

    .patient-info-row { display:flex; align-items:center; width:100%; gap:18px; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; white-space:nowrap; margin:2px 0; color:#000; }
    .info-item { flex:0 0 auto; white-space:nowrap; }
    .info-item b { font-weight:700; }
    .diagnosis-item { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }

    .record-table { width:100%; border-collapse:collapse; font-family:'SimSun', '宋体', serif; font-size:9pt; table-layout:fixed; }
    .record-table th,.record-table td { border:1px solid #000; text-align:center; padding:4px 3px; word-break:break-all; height:28px; }
    .record-table th { background:transparent; font-weight:700; color:#000; }
    .record-table td { font-weight:400; color:#000; }

    .item-col { width:80px; }
    .sub-item-col { width:90px; }
    .desc-col { width:180px; }
    .score-col { width:40px; }
    .data-col { width:80px; min-width:80px; max-width:80px; }

    .item-cell { font-weight:700; vertical-align:middle; }
    .sub-item-cell { font-weight:700; vertical-align:middle; }
    .desc-cell { text-align:left; padding-left:6px; }
    .score-cell { font-weight:700; }
    .sum-label { text-align:left; padding-left:6px; font-weight:700; }
    .measure-label { font-weight:700; vertical-align:middle; text-align:center; }
    .measure-item { text-align:left; padding-left:6px; }

    .dt-date,.dt-time { display:block; white-space:nowrap; text-align:center; line-height:1.2; }

    .footnote { margin-top:8px; font-family:'SimSun', '宋体', serif; font-size:8pt; line-height:1.3; color:#000; }
    .footnote .fn { padding-left:3em; text-indent:-3em; }

    .sheet-pageno { position:absolute; left:12mm; right:12mm; bottom:6mm; margin:0; text-align:center; font-family:'SimSun', '宋体', serif; font-size:13pt; font-weight:400; line-height:1; color:#000; white-space:nowrap; }
    @media screen { .sheet { zoom:var(--sheet-scale,1); } }
    @media print { .no-print { display:none !important; } .sheet-hidden { display:none !important; } }
  `],
})
export class UnplannedExtubationComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  // 配置数据
  readonly noRassOptions = NO_RASS_OPTIONS;
  readonly ssdOptions = SSD_OPTIONS;
  readonly gthzOptions = GTHZ_OPTIONS;
  readonly xwhzOptions = XWHZ_OPTIONS;
  readonly dgslOptions = DGSL_OPTIONS;
  readonly dggdOptions = DGGD_OPTIONS;
  readonly nurseMeasures = NURSE_MEASURES.map((m, i) => {
    // 计算分组 rowspan
    const groupStart = NURSE_MEASURES.findIndex(x => x.group === m.group);
    return { ...m, rowspan: i === groupStart ? NURSE_MEASURES.filter(x => x.group === m.group).length : 0 };
  });
  readonly footnoteLines = FOOTNOTE.split('\n');

  loading = true;
  patient: any = null;
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';
  age: number | null = null;

  records: ScoreRecord[] = [];
  columns: EvalColumn[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  readonly colsPerPage = 6;
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
    this.hostPatient.patient$.pipe(
      filter(p => !!p),
      map(p => ({ p, pid: String(p.id || '').trim() })),
      filter(({ pid }) => !!pid),
      tap(({ pid }) => { if (pid !== this.__lastPid) this.__lastPid = pid; }),
      distinctUntilChanged((a, b) => a.pid === b.pid),
      tap(({ p, pid }) => {
        this.resetForm();
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
    this.fitScale();
    this.ro = new ResizeObserver(() => this.fitScale());
    this.ro.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.ro?.disconnect();
  }

  private resetForm(): void {
    this.records = [];
    this.columns = [];
    this.pages = [];
    this.selectedPage = null;
    this.age = null;
    this.diagnosisDisplay = '';
    this.cdr.detectChanges();
  }

  private loadFromServer(pid: string) {
    this.loading = true;
    return this.http
      .get<ScoreRecord[]>(this.API_SCORE, { params: { pid, scoreType: SCORE_TYPE } })
      .pipe(
        tap((res) => {
          const list = Array.isArray(res) ? res : res ? [res as any] : [];
          this.records = list.filter(r => r && r.valid === true && r.scoreType === SCORE_TYPE && !!r.time);
          this.buildColumns();
        }),
        finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
      );
  }

  private buildColumns(): void {
    const cols: EvalColumn[] = this.records
      .map(r => {
        const score = r.unPlannedCGZYYScore || {};
        return {
          time: r.time!,
          rass: this.num(score.rass),
          noRass: this.num(score.noRass),
          noRassIndexList: Array.isArray(score.noRassIndexList) ? score.noRassIndexList : [],
          ssd: this.num(score.ssd),
          gthz: this.num(score.gthz),
          xwhz: this.num(score.xwhz),
          dgsl: this.num(score.dgsl),
          dggd: this.num(score.dggd),
          total: this.num(r.total),
          conclusion: r.conclusion || '',
          measures: this.parseMeasures(r.nurseMeasureList),
          signUserId: r.inputUserId,
          signName: r.inputUser || '',
        };
      })
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));
    this.columns = cols;

    // 回填签名
    const userIds = [...new Set(cols.map(c => c.signUserId).filter(Boolean) as string[])];
    if (userIds.length) {
      this.http.get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } }).subscribe({
        next: (accounts) => {
          const nameMap = new Map<string, string>();
          if (Array.isArray(accounts)) {
            for (const a of accounts) {
              const aid = a?._id || a?.id;
              if (aid) nameMap.set(String(aid), a?.trueName || '');
            }
          }
          for (const col of this.columns) {
            if (col.signUserId && nameMap.has(col.signUserId)) {
              col.signName = nameMap.get(col.signUserId) || col.signName;
            }
          }
          this.paginate();
          this.cdr.detectChanges();
        },
        error: () => { this.paginate(); this.cdr.detectChanges(); },
      });
    } else {
      this.paginate();
    }
  }

  /** 解析护理措施：19 条，按数组顺序 */
  private parseMeasures(list?: NurseMeasure[]): boolean[] {
    const result = new Array<boolean>(19).fill(false);
    if (!Array.isArray(list)) return result;
    for (let i = 0; i < Math.min(list.length, 19); i++) {
      if (list[i] && list[i].value === true) {
        result[i] = true;
      }
    }
    return result;
  }

  /** RASS 评分打√ */
  checkRass(col: EvalColumn | null, score: number): string {
    if (!col) return '';
    return col.rass === score ? '√' : '';
  }

  /** 未实施镇静打√：优先用 noRassIndexList，回退用 noRass 分值 */
  checkNoRass(col: EvalColumn | null, index: number): string {
    if (!col) return '';
    if (col.noRassIndexList.length > 0) {
      return col.noRassIndexList.includes(index) ? '√' : '';
    }
    // 回退：用 noRass 分值匹配，同分值只勾选第一条
    const targetScore = NO_RASS_OPTIONS[index].score;
    if (col.noRass === targetScore) {
      const firstMatchIndex = NO_RASS_OPTIONS.findIndex(o => o.score === targetScore);
      return index === firstMatchIndex ? '√' : '';
    }
    return '';
  }

  /** 通用字段打√ */
  checkField(col: EvalColumn | null, field: string, score: number): string {
    if (!col) return '';
    return (col as any)[field] === score ? '√' : '';
  }

  /** 护理措施打√ */
  checkMeasure(col: EvalColumn | null, index: number): string {
    if (!col) return '';
    return col.measures[index] ? '√' : '';
  }

  private paginate(): void {
    const per = this.colsPerPage;
    const pages: RenderPage[] = [];
    if (!this.columns.length) {
      // 无数据时渲染一组两页空表
      pages.push({ index: 1, cols: [], isSecondPage: false });
      pages.push({ index: 2, cols: [], isSecondPage: true });
    } else {
      for (let i = 0; i < this.columns.length; i += per) {
        const cols = this.columns.slice(i, i + per);
        const baseIndex = pages.length + 1;
        pages.push({ index: baseIndex, cols, isSecondPage: false });
        pages.push({ index: baseIndex + 1, cols, isSecondPage: true });
      }
    }
    this.pages = pages;
    if (this.selectedPage !== null && this.selectedPage > pages.length) {
      this.selectedPage = null;
    }
  }

  pagePaddedCols(page: RenderPage): (EvalColumn | null)[] {
    const result: (EvalColumn | null)[] = page.cols.slice(0, this.colsPerPage);
    while (result.length < this.colsPerPage) result.push(null);
    return result;
  }

  private fitScale(): void {
    const SHEET_W = 297 * (96 / 25.4);
    const avail = this.host.nativeElement.clientWidth - 32;
    const scale = Math.min(1, avail / SHEET_W);
    this.host.nativeElement.style.setProperty('--sheet-scale', String(scale));
  }

  private loadHospitalName(): void {
    this.http.get<{ hospitalName: string }>(this.API_HOSPITAL).subscribe({
      next: (res) => { if (res?.hospitalName) { this.hospitalName = res.hospitalName; this.cdr.detectChanges(); } },
      error: () => {},
    });
  }

  genderText(g?: string): string {
    if (g === 'Male' || g === 'M' || g === '男') return '男';
    if (g === 'Female' || g === 'F' || g === '女') return '女';
    return g || '';
  }

  private calcAge(birthday?: string): number | null {
    if (!birthday) return null;
    const b = new Date(birthday);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
    return age >= 0 ? age : null;
  }

  private formatDiagnosis(diagnosis?: string): string {
    if (!diagnosis) return '';
    let index = -1;
    const seps = [';', '；', ',', '，'];
    for (const s of seps) {
      const i = diagnosis.indexOf(s);
      if (i >= 0 && (index < 0 || i < index)) index = i;
    }
    return index >= 0 ? diagnosis.substring(0, index).trim() : diagnosis.trim();
  }

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
      c.querySelectorAll('.no-print,.toolbar').forEach(el => el.remove());
      c.style.zoom = '1'; c.style.transform = 'none';
      body += '<div class="print-page" data-page-index="' + pageIndex + '">' + c.outerHTML + '</div>';
    });
    const css = `
      @page { size: A4 landscape; margin:0; }
      html,body{margin:0;padding:0;}
      body{color:#000;font-family:'SimSun','宋体',serif;}
      .print-page{box-sizing:border-box;width:297mm;height:210mm;margin:0;overflow:hidden;page-break-after:always;background:#fff;}
      .print-page:last-of-type{page-break-after:auto;}
      .sheet{box-sizing:border-box;position:relative;width:297mm;max-width:297mm;height:210mm;max-height:210mm;margin:0;padding:4mm 10mm 12mm;overflow:hidden;box-shadow:none;background:#fff;color:#000;transform:none!important;zoom:1!important;filter:none!important;text-shadow:none!important;}
      .sheet-head{text-align:center;padding-bottom:6px;}
      .title-line{font-family:'SimHei','黑体',sans-serif;font-weight:700;font-size:22pt;line-height:1.35;}
      .patient-info-row{display:flex;align-items:center;width:100%;gap:18px;font-size:12pt;font-weight:400;white-space:nowrap;margin:2px 0;color:#000;}
      .info-item{flex:0 0 auto;white-space:nowrap;}
      .diagnosis-item{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}
      .record-table{width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed;}
      .record-table th,.record-table td{border:1px solid #000;text-align:center;padding:4px 3px;height:28px;word-break:break-all;}
      .record-table th{background:transparent;font-weight:700;color:#000;}
      .record-table td{font-weight:400;color:#000;}
      .item-col{width:80px;} .sub-item-col{width:90px;} .desc-col{width:180px;} .score-col{width:40px;} .data-col{width:80px;min-width:80px;max-width:80px;}
      .item-cell{font-weight:700;vertical-align:middle;} .sub-item-cell{font-weight:700;vertical-align:middle;}
      .desc-cell{text-align:left;padding-left:6px;} .score-cell{font-weight:700;}
      .sum-label{text-align:left;padding-left:6px;font-weight:700;}
      .measure-label{font-weight:700;vertical-align:middle;text-align:center;}
      .measure-item{text-align:left;padding-left:6px;}
      .dt-date,.dt-time{display:block;white-space:nowrap;text-align:center;line-height:1.2;}
      .footnote{margin-top:8px;font-size:8pt;line-height:1.3;color:#000;}
      .footnote .fn{padding-left:3em;text-indent:-3em;}
      .sheet-pageno{position:absolute;left:10mm;right:10mm;bottom:4mm;margin:0;text-align:center;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap;}
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();
    const doPrint = () => {
      const sheets = win.document.querySelectorAll<HTMLElement>('.sheet');
      for (const sheet of Array.from(sheets)) {
        const pn = sheet.querySelector<HTMLElement>('.sheet-pageno');
        if (!pn) { console.error('页码缺失'); }
        if (sheet.scrollWidth > sheet.clientWidth + 1) { console.warn('横向溢出: ' + (sheet.scrollWidth - sheet.clientWidth) + 'px'); }
        if (sheet.scrollHeight > sheet.clientHeight + 1) { console.warn('纵向溢出: ' + (sheet.scrollHeight - sheet.clientHeight) + 'px'); }
      }
      win.focus(); win.print();
    };
    const ready = () => { const doc = win.document as any; if (doc.fonts?.ready) { doc.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); }); } else { requestAnimationFrame(() => requestAnimationFrame(doPrint)); } };
    win.addEventListener('afterprint', () => { try { win.close(); } catch(e) {} });
    if ((win.document as any).readyState === 'complete') { ready(); } else { win.addEventListener('load', ready); }
  }

  fmtDate(v?: string): string { return formatShanghaiDate(v) || ''; }
  fmtTime(v?: string): string { return formatShanghaiTime(v) || ''; }

  private num(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  private ts(v?: string): number { return databaseTimeValue(v); }
}
