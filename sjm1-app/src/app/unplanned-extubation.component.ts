/**
 * 非计划拔管风险评估及护理措施记录单 —— Angular 组件
 * 访问路径：/form/unPlannedCGZYYForm
 *
 * A4 横向；每组最多 5 条评估记录，生成 2 张物理页（评分页+护理措施页）
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
const FOOTNOTE =
  '备注：评估总分：≥9分高危，6-8分中危，≤5分低危；首次评估后：＜9分者每周评估1次；≥9分者每天评估1次，每班交接，直至导管拔出；当评估内容发生变化随时评估更新。RASS：Richmond躁动-镇静量表；NRS：疼痛数字评定量表；CPOT：重症监护疼痛观察工具。*如果按照低风险为1分，并根据等级分值逐渐累加，结合组合权重的分值，将组合权重×50后可初步得出相应的分值，考虑到部分情况无拔管风险，故将组合权重×50-1，得到无风险的分值为0分，低风险为1分，如此累加。';

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
  isSecondPage: boolean;
}

type ScoreField = 'ssd' | 'gthz' | 'xwhz' | 'dgsl' | 'dggd';

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

        <table class="record-table assessment-table">
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
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkRass(c, 0) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">RASS -2~0</td>
              <td class="score-cell">1</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkRass(c, 1) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">RASS 1~2</td>
              <td class="score-cell">2</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkRass(c, 2) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">RASS 3~4</td>
              <td class="score-cell">3</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkRass(c, 3) }}</td>
            </tr>
            <!-- 神志意识及精神状态 - 未实施镇静 -->
            <tr>
              <td class="sub-item-cell" rowspan="6">未实施镇静或<br>不适宜用 RASS<br>评分患者</td>
              <td class="desc-cell">{{noRassOptions[0].label}}</td>
              <td class="score-cell">{{noRassOptions[0].score}}</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkNoRass(c, 0) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[1].label}}</td>
              <td class="score-cell">{{noRassOptions[1].score}}</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkNoRass(c, 1) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[2].label}}</td>
              <td class="score-cell">{{noRassOptions[2].score}}</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkNoRass(c, 2) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[3].label}}</td>
              <td class="score-cell">{{noRassOptions[3].score}}</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkNoRass(c, 3) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[4].label}}</td>
              <td class="score-cell">{{noRassOptions[4].score}}</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkNoRass(c, 4) }}</td>
            </tr>
            <tr>
              <td class="desc-cell">{{noRassOptions[5].label}}</td>
              <td class="score-cell">{{noRassOptions[5].score}}</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkNoRass(c, 5) }}</td>
            </tr>
            <!-- 舒适度：合并具体评估细则和评估内容 -->
            <ng-container *ngFor="let option of ssdOptions; let index = index">
              <tr>
                <td *ngIf="index === 0" [attr.rowspan]="ssdOptions.length" class="item-cell">舒适度</td>
                <td colspan="2" class="desc-cell merged-detail-cell">{{ option.label }}</td>
                <td class="score-cell">{{ option.score }}</td>
                <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkField(c, 'ssd', option.score) }}</td>
              </tr>
            </ng-container>
            <!-- 沟通合作：合并具体评估细则和评估内容 -->
            <ng-container *ngFor="let option of gthzOptions; let index = index">
              <tr>
                <td *ngIf="index === 0" [attr.rowspan]="gthzOptions.length" class="item-cell">沟通合作</td>
                <td colspan="2" class="desc-cell merged-detail-cell">{{ option.label }}</td>
                <td class="score-cell">{{ option.score }}</td>
                <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkField(c, 'gthz', option.score) }}</td>
              </tr>
            </ng-container>
            <!-- 行为合作：合并具体评估细则和评估内容 -->
            <ng-container *ngFor="let option of xwhzOptions; let index = index">
              <tr>
                <td *ngIf="index === 0" [attr.rowspan]="xwhzOptions.length" class="item-cell">行为合作</td>
                <td colspan="2" class="desc-cell merged-detail-cell">{{ option.label }}</td>
                <td class="score-cell">{{ option.score }}</td>
                <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkField(c, 'xwhz', option.score) }}</td>
              </tr>
            </ng-container>
          </tbody>
        </table>

        <div class="footnote">
          {{ footnote }}
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

        <table class="record-table second-page-table">
          <colgroup>
            <col class="item-col" />
            <col class="sub-item-col" />
            <col class="desc-col" />
            <col class="score-col" />
            <col *ngFor="let c of pagePaddedCols(page)" class="data-col" />
          </colgroup>

          <tbody>
            <!-- 导管数量：移到第二页 -->
            <ng-container *ngFor="let option of dgslOptions; let index = index">
              <tr>
                <td *ngIf="index === 0" [attr.rowspan]="dgslOptions.length" class="item-cell">导管数量</td>
                <td colspan="2" class="desc-cell merged-detail-cell">{{ option.label }}</td>
                <td class="score-cell">{{ option.score }}</td>
                <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkField(c, 'dgsl', option.score) }}</td>
              </tr>
            </ng-container>
            <!-- 导管固定：全部移到第二页 -->
            <ng-container *ngFor="let option of dggdOptions; let index = index">
              <tr>
                <td *ngIf="index === 0" [attr.rowspan]="dggdOptions.length" class="item-cell">导管固定</td>
                <td colspan="2" class="desc-cell merged-detail-cell">{{ option.label }}</td>
                <td class="score-cell">{{ option.score }}</td>
                <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ checkField(c, 'dggd', option.score) }}</td>
              </tr>
            </ng-container>

            <!-- 评估总分 -->
            <tr>
              <td colspan="4" class="sum-label">评估总分</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ c && c.total !== null ? c.total : '' }}</td>
            </tr>

            <!-- 危险程度 -->
            <tr>
              <td colspan="4" class="sum-label">危险程度</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell">{{ c ? c.conclusion : '' }}</td>
            </tr>

            <!-- 护理措施 -->
            <tr *ngFor="let measure of nurseMeasures; let measureIndex = index">
              <td *ngIf="measureIndex === 0" [attr.rowspan]="nurseMeasures.length" class="measure-main-label">
                <span class="vertical-text">护理措施</span>
              </td>
              <td *ngIf="measure.rowspan > 0" [attr.rowspan]="measure.rowspan" class="measure-label">{{ measure.group }}</td>
              <td colspan="2" class="measure-item">{{ measure.label }}</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell measure-check-cell">{{ checkMeasure(c, measureIndex) }}</td>
            </tr>

            <!-- 护士签名 -->
            <tr>
              <td colspan="4" class="sum-label">护士签名</td>
              <td *ngFor="let c of pagePaddedCols(page)" class="data-cell sign-cell">{{ c ? (c.signName || '') : '' }}</td>
            </tr>
          </tbody>
        </table>

        <div class="footnote">
          {{ footnote }}
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

    .sheet {
      box-sizing: border-box;
      position: relative;
      width: 297mm;
      height: 210mm;
      min-height: 210mm;
      margin: 16px auto;
      padding: 4mm 7mm 9mm;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      color: #000;
      font-family: 'SimSun', '宋体', serif;
    }

    .sheet-head {
      padding-bottom: 3px;
      text-align: center;
    }

    .title-line {
      font-family: 'SimHei', '黑体', sans-serif;
      font-size: 20pt;
      font-weight: 700;
      line-height: 1.18;
    }

    .patient-info-row {
      display: flex;
      align-items: center;
      width: 100%;
      gap: 12px;
      margin: 1px 0 3px;
      color: #000;
      font-family: 'SimSun', '宋体', serif;
      font-size: 10.5pt;
      font-weight: 400;
      line-height: 1.15;
      white-space: nowrap;
    }

    .info-item {
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .info-item b {
      font-weight: 700;
    }

    .diagnosis-item {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .record-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      color: #000;
      font-family: 'SimSun', '宋体', serif;
      font-size: 10pt;
      line-height: 1.2;
    }

    .record-table th,
    .record-table td {
      box-sizing: border-box;
      height: 29px;
      padding: 4px 4px;
      border: 1px solid #000;
      text-align: center;
      vertical-align: middle;
      overflow-wrap: break-word;
      word-break: normal;
    }

    .record-table th {
      background: transparent;
      color: #000;
      font-weight: 700;
    }

    .record-table td {
      color: #000;
      font-weight: 400;
    }

    /* 第一页评分表 */
    .assessment-table th,
    .assessment-table td {
      height: 29px;
      padding-top: 4px;
      padding-bottom: 4px;
    }

    /* 第二页内容更多，需要进一步压缩 */
    .second-page-table th,
    .second-page-table td {
      height: 25px;
      padding: 2px 4px;
      line-height: 1.1;
    }

    .item-col { width: 90px; }
    .sub-item-col { width: 105px; }
    .desc-col { width: 210px; }
    .score-col { width: 48px; }
    .data-col { width: 105px; min-width: 105px; max-width: 105px; }

    .item-cell { font-weight: 700; vertical-align: middle; }
    .sub-item-cell { font-weight: 700; vertical-align: middle; }
    .desc-cell { padding-right: 3px; padding-left: 3px; text-align: left; overflow-wrap: break-word; word-break: normal; }
    .score-cell { font-weight: 700; }
    .sum-label { padding-left: 4px; text-align: center; font-weight: 700; }
    .merged-detail-cell { padding-right: 3px; padding-left: 3px; text-align: center; overflow-wrap: break-word; word-break: normal; }

    .measure-main-label { width: 90px; padding: 0; text-align: center; vertical-align: middle; font-weight: 700; }
    .vertical-text { display: inline-block; writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 1px; line-height: 1.1; }
    .measure-label { width: 105px; padding: 1px; text-align: center; vertical-align: middle; font-size: 9pt; font-weight: 400; line-height: 1.1; }
    .measure-item { padding: 1px 3px; text-align: left; vertical-align: middle; font-size: 9pt; line-height: 1.1; overflow-wrap: break-word; word-break: normal; }

    .data-cell { width: 105px; min-width: 105px; max-width: 105px; padding: 1px; text-align: center; vertical-align: middle; font-size: 11pt; }
    .measure-check-cell { font-size: 12pt; font-weight: 700; line-height: 1; }
    .sign-cell { font-size: 9pt; white-space: normal; word-break: break-all; }

    .dt-date, .dt-time { display: block; text-align: center; white-space: nowrap; line-height: 1.25; font-size: 9.5pt; }

    .footnote {
      box-sizing: border-box;
      width: 100%;
      margin-top: 3px;
      padding: 0;
      color: #000;
      font-family: 'SimSun', '宋体', serif;
      font-size: 7.5pt;
      font-weight: 400;
      line-height: 1.1;
      text-align: left;
      white-space: normal;
      word-break: normal;
      overflow-wrap: break-word;
    }

    .sheet-pageno {
      position: absolute;
      right: 7mm;
      bottom: 40px;
      left: 7mm;
      margin: 0;
      color: #000;
      font-family: 'SimSun', '宋体', serif;
      font-size: 10pt;
      font-weight: 400;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
    }

    @media screen {
      .sheet { zoom: var(--sheet-scale, 1); }
    }

    @media print {
      :host { height: auto; overflow: visible; background: #fff; }
      .no-print { display: none !important; }
      .sheet-hidden { display: none !important; }
      .sheet { margin: 0; box-shadow: none; transform: none !important; zoom: 1 !important; }
    }
  `],
})
export class UnplannedExtubationComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly API_SCORE = '/api/v1/icu/score/listByPid';
  private readonly API_HOSPITAL = '/api/v1/config/hospital';
  private readonly API_ACCOUNT = '/api/v1/icu/accounts/listByIds';

  readonly noRassOptions = NO_RASS_OPTIONS;
  readonly ssdOptions = SSD_OPTIONS;
  readonly gthzOptions = GTHZ_OPTIONS;
  readonly xwhzOptions = XWHZ_OPTIONS;
  readonly dgslOptions = DGSL_OPTIONS;
  readonly dggdOptions = DGGD_OPTIONS;
  readonly nurseMeasures = NURSE_MEASURES.map((m, i) => {
    const groupStart = NURSE_MEASURES.findIndex(x => x.group === m.group);
    return { ...m, rowspan: i === groupStart ? NURSE_MEASURES.filter(x => x.group === m.group).length : 0 };
  });
  readonly footnote = FOOTNOTE;

  loading = true;
  patient: any = null;
  hospitalName = '重钢总医院';
  diagnosisDisplay = '';
  age: number | null = null;

  records: ScoreRecord[] = [];
  columns: EvalColumn[] = [];
  pages: RenderPage[] = [];
  selectedPage: number | null = null;

  readonly colsPerPage = 5;
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
      .filter(record => !!record.time)
      .map(record => {
        const score = record.unPlannedCGZYYScore || {};
        return {
          time: record.time!,
          rass: this.num(score.rass),
          noRass: this.num(score.noRass),
          noRassIndexList: Array.isArray(score.noRassIndexList)
            ? score.noRassIndexList.map(value => Number(value)).filter(value => Number.isInteger(value))
            : [],
          ssd: this.num(score.ssd),
          gthz: this.num(score.gthz),
          xwhz: this.num(score.xwhz),
          dgsl: this.num(score.dgsl),
          dggd: this.num(score.dggd),
          total: this.num(record.total),
          conclusion: record.conclusion || '',
          measures: this.parseMeasures(record.nurseMeasureList),
          signUserId: record.inputUserId,
          signName: record.inputUser || '',
        };
      })
      .sort((a, b) => this.ts(a.time) - this.ts(b.time));

    this.columns = cols;

    const userIds = [
      ...new Set(cols.map(column => column.signUserId).filter(Boolean) as string[]),
    ];

    if (!userIds.length) {
      this.paginate();
      this.cdr.detectChanges();
      return;
    }

    this.http
      .get<any[]>(this.API_ACCOUNT, { params: { ids: userIds.join(',') } })
      .subscribe({
        next: accounts => {
          const nameMap = new Map<string, string>();
          if (Array.isArray(accounts)) {
            for (const account of accounts) {
              const accountId = account?._id || account?.id;
              if (accountId) {
                nameMap.set(String(accountId), account?.trueName || account?.accountName || '');
              }
            }
          }
          for (const column of this.columns) {
            if (column.signUserId && nameMap.has(column.signUserId)) {
              column.signName = nameMap.get(column.signUserId) || column.signName;
            }
          }
          this.paginate();
          this.cdr.detectChanges();
        },
        error: () => {
          this.paginate();
          this.cdr.detectChanges();
        },
      });
  }

  private parseMeasures(list?: NurseMeasure[]): boolean[] {
    const result = new Array<boolean>(19).fill(false);
    if (!Array.isArray(list)) return result;
    for (let index = 0; index < Math.min(list.length, result.length); index++) {
      result[index] = list[index]?.value === true;
    }
    return result;
  }

  checkRass(col: EvalColumn | null, score: number): string {
    if (!col) return '';
    return col.rass === score ? '√' : '';
  }

  checkNoRass(col: EvalColumn | null, index: number): string {
    if (!col) return '';
    const indexes = Array.isArray(col.noRassIndexList) ? col.noRassIndexList : [];
    if (indexes.length > 0) {
      return indexes.includes(index) ? '√' : '';
    }
    const option = NO_RASS_OPTIONS[index];
    if (!option || col.noRass !== option.score) return '';
    const firstMatchIndex = NO_RASS_OPTIONS.findIndex(item => item.score === option.score);
    return index === firstMatchIndex ? '√' : '';
  }

  checkField(col: EvalColumn | null, field: ScoreField, score: number): string {
    if (!col) return '';
    return col[field] === score ? '√' : '';
  }

  checkMeasure(col: EvalColumn | null, index: number): string {
    if (!col) return '';
    return col.measures[index] === true ? '√' : '';
  }

  private paginate(): void {
    const per = this.colsPerPage;
    const pages: RenderPage[] = [];
    if (!this.columns.length) {
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
      body += `
        <div class="print-page">
          ${c.outerHTML}
        </div>
      `;
    });
    const css = `
      @page {
        size: A4 landscape;
        margin: 0;
      }

      html,
      body {
        width: 297mm;
        margin: 0;
        padding: 0;
        background: #fff;
      }

      body {
        color: #000;
        font-family: 'SimSun', '宋体', serif;
      }

      .print-page {
        box-sizing: border-box;
        position: relative;
        width: 297mm;
        height: 210mm;
        margin: 0;
        padding: 0;
        overflow: hidden;
        break-after: page;
        page-break-after: always;
        background: #fff;
      }

      .print-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      .sheet {
        box-sizing: border-box;
        position: relative;
        width: 297mm !important;
        max-width: 297mm !important;
        height: 210mm !important;
        min-height: 210mm !important;
        max-height: 210mm !important;
        margin: 0 !important;
        padding: 4mm 7mm 9mm !important;
        overflow: hidden !important;
        background: #fff;
        box-shadow: none !important;
        color: #000;
        transform: none !important;
        zoom: 1 !important;
        filter: none !important;
        text-shadow: none !important;
      }

      .sheet-head {
        padding-bottom: 3px;
        text-align: center;
      }

      .title-line {
        font-family: 'SimHei', '黑体', sans-serif;
        font-size: 20pt;
        font-weight: 700;
        line-height: 1.18;
      }

      .patient-info-row {
        display: flex;
        align-items: center;
        width: 100%;
        gap: 12px;
        margin: 1px 0 3px;
        color: #000;
        font-size: 10.5pt;
        font-weight: 400;
        line-height: 1.15;
        white-space: nowrap;
      }

      .info-item {
        flex: 0 0 auto;
        white-space: nowrap;
      }

      .diagnosis-item {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .record-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        color: #000;
        font-size: 9.5pt;
        line-height: 1.15;
      }

      .record-table th,
      .record-table td {
        box-sizing: border-box;
        height: 27px;
        padding: 3px 3px;
        border: 1px solid #000;
        color: #000;
        text-align: center;
        vertical-align: middle;
        overflow-wrap: break-word;
        word-break: normal;
      }

      .record-table th {
        background: transparent;
        font-weight: 700;
      }

      .record-table td {
        font-weight: 400;
      }

      .assessment-table th,
      .assessment-table td {
        height: 27px;
      }

      .second-page-table th,
      .second-page-table td {
        height: 23px;
        padding: 2px 3px;
        line-height: 1.08;
      }

      .item-col { width: 90px; }
      .sub-item-col { width: 105px; }
      .desc-col { width: 210px; }
      .score-col { width: 48px; }
      .data-col { width: 105px; min-width: 105px; max-width: 105px; }

      .item-cell { font-weight: 700; vertical-align: middle; }
      .sub-item-cell { font-weight: 700; vertical-align: middle; }
      .desc-cell { padding-right: 3px; padding-left: 3px; text-align: left; overflow-wrap: break-word; word-break: normal; }
      .score-cell { font-weight: 700; }
      .sum-label { padding-left: 3px; text-align: center; font-weight: 700; }
      .merged-detail-cell { padding-right: 3px; padding-left: 3px; text-align: center; overflow-wrap: break-word; word-break: normal; }

      .measure-main-label { width: 90px; padding: 0; text-align: center; vertical-align: middle; font-weight: 700; }
      .vertical-text { display: inline-block; writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 1px; line-height: 1; }
      .measure-label { width: 105px; padding: 1px; text-align: center; vertical-align: middle; font-size: 8.5pt; line-height: 1; }
      .measure-item { padding: 1px 3px; text-align: left; vertical-align: middle; font-size: 8.5pt; line-height: 1.05; overflow-wrap: break-word; word-break: normal; }

      .data-cell { width: 105px; min-width: 105px; max-width: 105px; padding: 1px; text-align: center; vertical-align: middle; font-size: 11pt; }
      .measure-check-cell { font-size: 12pt; font-weight: 700; line-height: 1; }
      .sign-cell { font-size: 9pt; white-space: normal; word-break: break-all; }

      .dt-date,
      .dt-time { display: block; text-align: center; white-space: nowrap; line-height: 1.25; font-size: 9.5pt; }

      .footnote {
        box-sizing: border-box;
        width: 100%;
        margin-top: 2px;
        padding: 0;
        color: #000;
        font-size: 7pt;
        font-weight: 400;
        line-height: 1.08;
        text-align: left;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
      }

      .sheet-pageno {
        position: absolute;
        right: 6mm;
        bottom: 40px;
        left: 6mm;
        margin: 0;
        color: #000;
        font-size: 10pt;
        font-weight: 400;
        line-height: 1;
        text-align: center;
        white-space: nowrap;
      }

      .no-print,
      .sheet-hidden {
        display: none !important;
      }
    `;
    const win = window.open('', '_blank', 'width=1400,height=900');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>非计划拔管风险评估及护理措施记录单</title><style>${css}</style></head><body>${body}</body></html>`);
    win.document.close();
    const doPrint = () => {
      const sheets = win.document.querySelectorAll<HTMLElement>('.sheet');
      for (const sheet of Array.from(sheets)) {
        if (sheet.scrollWidth > sheet.clientWidth + 1) { console.warn('横向溢出: ' + (sheet.scrollWidth - sheet.clientWidth) + 'px'); }
        if (sheet.scrollHeight > sheet.clientHeight + 1) { console.warn('纵向溢出: ' + (sheet.scrollHeight - sheet.clientHeight) + 'px'); }
      }
      win.focus(); win.print();
    };
    const ready = () => {
      const docWithFonts = win.document as Document & { fonts?: { ready: Promise<unknown> } };
      if (docWithFonts.fonts?.ready) {
        docWithFonts.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); });
      } else {
        requestAnimationFrame(() => requestAnimationFrame(doPrint));
      }
    };
    win.addEventListener('afterprint', () => { try { win.close(); } catch (e) {} });
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
