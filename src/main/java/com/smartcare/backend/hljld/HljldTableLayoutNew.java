package com.smartcare.backend.hljld;

import org.bson.Document;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 护理记录单表格布局变体（/form/hljldFormPDFNew 专用）。
 *
 * <p>按患者出科时间 {@code icuDischargeTime} 切换：</p>
 * <ul>
 *   <li>出科时间早于 {@link #LAYOUT_SWITCH_TIME}（2026-10-08 17:00:00，Asia/Shanghai）
 *       → {@link #LEGACY}：维持原 19 列布局与 4 行备注</li>
 *   <li>出科时间不早于该时刻，或患者尚无出科时间 → {@link #SLIM}：
 *       表格去掉“检查”列（28pt 并入“护理记录”列），备注去掉“检查”行，
 *       治疗行只保留「A：机械辅助排痰 B：气压治疗」</li>
 * </ul>
 *
 * <p>不可变对象；同一次 PDF 渲染（预渲染 + 正式渲染）必须共用同一实例，
 * 保证页数与版式一致。</p>
 */
public final class HljldTableLayoutNew {

    /** 布局切换时间点：早于该时刻出科的患者保持旧版布局 */
    public static final Instant LAYOUT_SWITCH_TIME =
        LocalDateTime.of(2026, 10, 8, 17, 0, 0)
            .atZone(ZoneId.of("Asia/Shanghai"))
            .toInstant();

    /** 旧版布局：19 列 + 4 行备注 */
    public static final HljldTableLayoutNew LEGACY = new HljldTableLayoutNew(
        HljldPdfLayoutConstantsNew.COL_WIDTHS_PT,
        HljldPdfLayoutConstantsNew.DATA_KEYS,
        HljldPdfLayoutConstantsNew.REMARK_LINES,
        HljldPdfLayoutConstantsNew.NURSING_RECORD_COLUMN_INDEX,
        true
    );

    /** 精简版布局：18 列（无检查列）+ 3 行备注 */
    public static final HljldTableLayoutNew SLIM = new HljldTableLayoutNew(
        HljldPdfLayoutConstantsNew.COL_WIDTHS_PT_SLIM,
        HljldPdfLayoutConstantsNew.DATA_KEYS_SLIM,
        HljldPdfLayoutConstantsNew.REMARK_LINES_SLIM,
        HljldPdfLayoutConstantsNew.NURSING_RECORD_COLUMN_INDEX_SLIM,
        false
    );

    private final float[] colWidths;
    private final String[] dataKeys;
    private final String[] remarkLines;
    private final int nursingRecordIndex;
    private final boolean legacy;

    private HljldTableLayoutNew(float[] colWidths, String[] dataKeys,
                                String[] remarkLines, int nursingRecordIndex,
                                boolean legacy) {
        this.colWidths = colWidths;
        this.dataKeys = dataKeys;
        this.remarkLines = remarkLines;
        this.nursingRecordIndex = nursingRecordIndex;
        this.legacy = legacy;
    }

    /**
     * 按患者出科时间解析布局。
     *
     * @param patient 患者 Document（可为 null，视为未出科）
     * @return 出科时间早于切换时间点时为 {@link #LEGACY}，否则为 {@link #SLIM}
     */
    public static HljldTableLayoutNew resolve(Document patient) {
        Instant dischargeTime = patient == null
            ? null
            : HljldPatientTimeResolverNew.resolveDischargeTime(patient);
        return resolve(dischargeTime);
    }

    /**
     * 按出科时间解析布局。
     *
     * @param dischargeTime 出科时间（null = 尚未出科）
     * @return 出科时间早于切换时间点时为 {@link #LEGACY}，否则为 {@link #SLIM}
     */
    public static HljldTableLayoutNew resolve(Instant dischargeTime) {
        if (dischargeTime != null && dischargeTime.isBefore(LAYOUT_SWITCH_TIME)) {
            return LEGACY;
        }
        return SLIM;
    }

    /** 数据字段键名 */
    public String[] getDataKeys() {
        return dataKeys;
    }

    /** 列宽 */
    public float[] getColWidths() {
        return colWidths;
    }

    /** 备注图例行（行数即备注区行数） */
    public String[] getRemarkLines() {
        return remarkLines;
    }

    /** 备注区行数 */
    public int getRemarkRowCount() {
        return remarkLines.length;
    }

    /** 护理记录列索引 */
    public int getNursingRecordIndex() {
        return nursingRecordIndex;
    }

    /** 列数（表头 colspan 合计、数据行列数、小结容器行 colspan） */
    public int getColumnCount() {
        return colWidths.length;
    }

    /** 是否为旧版（含“检查”列 / 4 行备注） */
    public boolean isLegacy() {
        return legacy;
    }

    @Override
    public String toString() {
        return "TableLayoutNew{" + (legacy ? "LEGACY" : "SLIM")
            + ", columns=" + getColumnCount()
            + ", remarkRows=" + getRemarkRowCount() + "}";
    }
}
