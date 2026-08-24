/**
 * hljld-sheet.styles.ts
 *
 * ICU 护理记录单 A4 纸张样式。
 * 屏幕与打印共用同一份 CSS，保证一致性。
 */

export const HLJLD_SHEET_CSS = `
@page {
  size: A4 landscape;
  margin: 0;
}

html, body {
  margin: 0;
  padding: 0;
  background: #fff;
}

body {
  color: #000;
  font-family: "SimSun", "宋体", serif;
}

.print-root {
  margin: 0;
  padding: 0;
}

.print-page {
  box-sizing: border-box;
  width: 297mm;
  height: 210mm;
  margin: 0;
  padding: 0;
  break-after: page;
  page-break-after: always;
  overflow: hidden;
  background: #fff;
}

.print-page:last-child {
  break-after: auto;
  page-break-after: auto;
}

.sheet {
  position: relative;
  box-sizing: border-box;
  width: 297mm;
  height: 210mm;
  padding: 4mm 7mm 58px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

.sheet-head {
  display: block;
  text-align: initial;
  color: #000;
}

.title-line {
  text-align: center;
  font-family: "SimHei", "黑体", "Microsoft YaHei", sans-serif;
  font-size: 22pt;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 1px;
  margin: 0 0 2mm 0;
}

.patient-info-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 1mm 6mm;
  text-align: left;
  white-space: normal;
  font-family: "SimSun", "宋体", serif;
  font-size: 12pt;
  font-weight: 400;
  line-height: 1.4;
  color: #000;
  margin: 0 0 1.5mm 0;
}

.info-item,
.diagnosis-item {
  text-align: left;
  white-space: nowrap;
  color: #000;
}

.diagnosis-item {
  flex: 1 1 auto;
  min-width: 0;
}

.info-item strong,
.diagnosis-item strong {
  font-weight: 700;
}

.print-table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.print-record-table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
  border: 1px solid #000;
  color: #000;
  background: #fff;
  font-family: "SimSun", "宋体", serif;
  font-size: 7.2pt;
  line-height: 1.25;
}

.print-record-table col.col-time { width: 7%; }
.print-record-table col.col-med-name { width: 7.5%; }
.print-record-table col.col-enteral-name { width: 6.5%; }
.print-record-table col.col-med-amount,
.print-record-table col.col-enteral-amount { width: 4%; }
.print-record-table col.col-med-route,
.print-record-table col.col-enteral-route { width: 3.5%; }
.print-record-table col.col-urine { width: 3.5%; }
.print-record-table col.col-ultrafiltration { width: 3.5%; }
.print-record-table col.col-output-name,
.print-record-table col.col-drain-name { width: 5%; }
.print-record-table col.col-output-amount,
.print-record-table col.col-drain-amount { width: 3.5%; }
.print-record-table col.col-check,
.print-record-table col.col-treatment,
.print-record-table col.col-basic-care,
.print-record-table col.col-health { width: 4%; }
.print-record-table col.col-nursing { width: 17%; }
.print-record-table col.col-sign { width: 5.5%; }

.print-record-table th,
.print-record-table td {
  border: 1px solid #000;
  padding: 0.6mm 0.8mm;
  text-align: center;
  vertical-align: middle;
  color: #000;
  box-sizing: border-box;
  overflow: visible;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.print-record-table thead th {
  background: #fff;
  font-weight: 700;
  line-height: 1.2;
}

.print-record-table thead tr:first-child th {
  padding-top: 0.8mm;
  padding-bottom: 0.8mm;
}

.print-record-table tbody td.nursing-cell {
  text-align: left;
  vertical-align: top;
}

.print-record-table tbody td.sign-cell {
  white-space: nowrap;
}

.print-record-table tbody tr.continuation-row td.time-cell {
  color: transparent;
}

.print-summary-row td {
  padding: 0 !important;
  text-align: left !important;
}

.print-summary-panel {
  width: 100%;
  box-sizing: border-box;
  padding: 1mm 1.5mm;
  text-align: left !important;
  color: #000;
}

.print-summary-day .print-summary-panel {
  background: #f7f3df;
}

.print-summary-shift .print-summary-panel {
  background: #f4f1e3;
}

.print-summary-24h .print-summary-panel {
  background: #edf6ee;
}

.print-summary-discharge .print-summary-panel {
  background: #e8f0fe;
}

.print-summary-title-row {
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 2mm;
  margin-bottom: 0.6mm;
  text-align: left !important;
}

.print-summary-title {
  font-weight: 700;
  font-size: 8pt;
}

.print-summary-period {
  font-size: 7pt;
}

.print-summary-line {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  line-height: 1.35;
  font-size: 7pt;
  text-align: left !important;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.print-summary-line + .print-summary-line {
  margin-top: 1.2mm;
}

.print-summary-strong {
  font-weight: 700;
  margin: 0 0.6mm;
}

.print-summary-sep {
  margin-right: 3mm;
}

.print-filler-row td {
  padding: 0 !important;
  line-height: 0;
  font-size: 0;
  vertical-align: top;
  background: #fff;
}

.print-record-table tfoot th,
.print-record-table tfoot td {
  font-size: 6.8pt;
  line-height: 1.25;
  text-align: left;
  vertical-align: top;
  padding: 0.8mm 1mm;
}

.print-record-table tfoot th {
  width: 8%;
  text-align: center;
  font-weight: 700;
}

.print-remark-lines {
  display: block;
}

.print-remark-line + .print-remark-line {
  margin-top: 0.3mm;
}

.sheet-pageno {
  box-sizing: border-box;
  position: absolute;
  right: 0;
  bottom: 35px;
  left: 0;
  width: auto;
  margin: 0;
  padding: 0;
  text-align: center;
  font-family: "SimSun", "宋体", serif;
  font-size: 12pt;
  line-height: 1;
  color: #000;
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
}
`;

/**
 * 屏幕装饰样式（仅屏幕生效）。
 * 页间距、阴影、圆角、灰底。
 */
export const HLJLD_SCREEN_DECORATION_CSS = `
.hljld-pages-viewport {
  width: 100%;
  overflow: auto;
  background: #f3f5f7;
  padding: 20px 0;
}

.hljld-sheet-scaler {
  transform-origin: top center;
  margin: 0 auto;
}

.print-page {
  margin: 0 auto 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.print-page:last-child {
  margin-bottom: 0;
}

@media print {
  .hljld-pages-viewport {
    background: none;
    padding: 0;
    overflow: visible;
  }

  .hljld-sheet-scaler {
    transform: none !important;
  }

  .print-page {
    margin: 0;
    box-shadow: none;
    border-radius: 0;
    break-after: page;
    page-break-after: always;
  }

  .print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
`;
