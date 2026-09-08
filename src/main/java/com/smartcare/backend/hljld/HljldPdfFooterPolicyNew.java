package com.smartcare.backend.hljld;

import java.time.LocalDate;

/**
 * 页脚渲染策略 — 集中计算"备注"和"审核护士签名"在最终页的展示逻辑。
 * （/form/hljldFormPDFNew 专用）
 *
 * <p>不可变对象，由 {@link #of} 工厂方法创建。禁止在 Controller、Service
 * 和事件处理器中散布同一套条件判断。</p>
 *
 * <h3>展示矩阵</h3>
 * <pre>
 * ┌─────────────┬──────────────────────────────────────┬──────────────────────────────┐
 * │ 渲染目的     │ 备注（最终页）                        │ 审核护士签名（最终页）        │
 * ├─────────────┼──────────────────────────────────────┼──────────────────────────────┤
 * │ PREVIEW     │ current == discharge (已出科有效)     │ 同左                          │
 * │             │ 或 current == refDay (未出科当前日)   │                              │
 * │ PRINT_DAY   │ current == discharge (有效)           │ 始终显示                      │
 * │ PRINT_RANGE │ 范围结束日 == discharge (有效)         │ 结束日≠出科日且≠今天时显示    │
 * │ PRINT_ALL   │ 始终显示                               │ 始终显示                      │
 * └─────────────┴──────────────────────────────────────┴──────────────────────────────┘
 * </pre>
 */
public final class HljldPdfFooterPolicyNew {

    private final boolean showRemarkOnFinalPage;
    private final boolean showAuditSignatureOnFinalPage;

    private HljldPdfFooterPolicyNew(boolean showRemarkOnFinalPage,
                                    boolean showAuditSignatureOnFinalPage) {
        this.showRemarkOnFinalPage = showRemarkOnFinalPage;
        this.showAuditSignatureOnFinalPage = showAuditSignatureOnFinalPage;
    }

    /**
     * 创建页脚策略（PREVIEW / PRINT_DAY / PRINT_ALL）。
     *
     * @param purpose                      渲染目的
     * @param currentNursingDate           当前输出的护理日（或范围结束护理日）
     * @param effectiveDischargeNursingDate 有效出科护理日（患者未出科或 referenceTime 不满足时为 null）
     * @return 页脚策略
     */
    public static HljldPdfFooterPolicyNew of(HljldPdfRenderPurposeNew purpose,
                                             LocalDate currentNursingDate,
                                             LocalDate effectiveDischargeNursingDate) {
        return of(purpose, currentNursingDate, effectiveDischargeNursingDate, null, null);
    }

    /**
     * 创建页脚策略（含参考时间护理日，用于 PREVIEW 未出科场景）。
     *
     * @param purpose                      渲染目的
     * @param currentNursingDate           当前护理日
     * @param effectiveDischargeNursingDate 有效出科护理日（null = 未出科）
     * @param referenceTimeNursingDate     referenceTime 所属护理日（用于 PREVIEW 未出科判断）
     * @return 页脚策略
     */
    public static HljldPdfFooterPolicyNew of(HljldPdfRenderPurposeNew purpose,
                                             LocalDate currentNursingDate,
                                             LocalDate effectiveDischargeNursingDate,
                                             LocalDate referenceTimeNursingDate) {
        return of(purpose, currentNursingDate, effectiveDischargeNursingDate, referenceTimeNursingDate, null);
    }

    /**
     * 创建页脚策略（PRINT_RANGE 使用，需要范围结束护理日）。
     *
     * @param rangeEndNursingDate          范围结束护理日
     * @param effectiveDischargeNursingDate 有效出科护理日
     * @param referenceTimeNursingDate     referenceTime 所属护理日（用于判断是否是今天）
     * @return 页脚策略
     */
    public static HljldPdfFooterPolicyNew ofRange(LocalDate rangeEndNursingDate,
                                                  LocalDate effectiveDischargeNursingDate,
                                                  LocalDate referenceTimeNursingDate) {
        boolean isDischargeDay = rangeEndNursingDate != null
            && rangeEndNursingDate.equals(effectiveDischargeNursingDate);
        // 判断是否是今天（当前护理日）
        boolean isCurrentDay = rangeEndNursingDate != null
            && rangeEndNursingDate.equals(referenceTimeNursingDate);
        // 如果结束日期是出科日期或今天，最后一页已有签名，不需要再加
        boolean showSignature = !(isDischargeDay || isCurrentDay);
        org.slf4j.LoggerFactory.getLogger(HljldPdfFooterPolicyNew.class)
            .debug("[hljld-new] ofRange: rangeEnd={}, discharge={}, refDay={}, isDischargeDay={}, isCurrentDay={}, showSignature={}",
                rangeEndNursingDate, effectiveDischargeNursingDate, referenceTimeNursingDate,
                isDischargeDay, isCurrentDay, showSignature);
        return new HljldPdfFooterPolicyNew(isDischargeDay, showSignature);
    }

    /**
     * 创建页脚策略（完整参数版）。
     *
     * @param purpose                      渲染目的
     * @param currentNursingDate           当前护理日（PREVIEW/PRINT_DAY）或范围结束护理日
     * @param effectiveDischargeNursingDate 有效出科护理日（null 表示未出科）
     * @param referenceTimeNursingDate     referenceTime 所属护理日（仅 PREVIEW 未出科时使用）
     * @param rangeEndNursingDate          范围结束护理日（仅 PRINT_RANGE 使用，其他为 null）
     * @return 页脚策略
     */
    public static HljldPdfFooterPolicyNew of(HljldPdfRenderPurposeNew purpose,
                                             LocalDate currentNursingDate,
                                             LocalDate effectiveDischargeNursingDate,
                                             LocalDate referenceTimeNursingDate,
                                             LocalDate rangeEndNursingDate) {
        if (purpose == null) {
            purpose = HljldPdfRenderPurposeNew.PREVIEW;
        }

        switch (purpose) {
            case PREVIEW: {
                // 已出科：current == discharge
                boolean isDischargeDay = currentNursingDate != null
                    && currentNursingDate.equals(effectiveDischargeNursingDate);
                // 未出科：current == referenceTime 所属护理日（当前护理日）
                boolean isCurrentDay = effectiveDischargeNursingDate == null
                    && currentNursingDate != null
                    && currentNursingDate.equals(referenceTimeNursingDate);
                boolean show = isDischargeDay || isCurrentDay;
                return new HljldPdfFooterPolicyNew(show, show);
            }
            case PRINT_DAY: {
                boolean isDischargeDay = currentNursingDate != null
                    && currentNursingDate.equals(effectiveDischargeNursingDate);
                return new HljldPdfFooterPolicyNew(isDischargeDay, true);
            }
            case PRINT_RANGE: {
                LocalDate endDay = rangeEndNursingDate != null ? rangeEndNursingDate : currentNursingDate;
                boolean isDischargeDay = endDay != null
                    && endDay.equals(effectiveDischargeNursingDate);
                return new HljldPdfFooterPolicyNew(isDischargeDay, true);
            }
            case PRINT_ALL:
                return new HljldPdfFooterPolicyNew(true, true);
            default:
                return new HljldPdfFooterPolicyNew(false, false);
        }
    }

    public boolean isShowRemarkOnFinalPage() {
        return showRemarkOnFinalPage;
    }

    public boolean isShowAuditSignatureOnFinalPage() {
        return showAuditSignatureOnFinalPage;
    }

    @Override
    public String toString() {
        return "FooterPolicyNew{remark=" + showRemarkOnFinalPage
            + ", signature=" + showAuditSignatureOnFinalPage + "}";
    }
}
