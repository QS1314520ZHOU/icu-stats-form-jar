package com.smartcare.backend.hljld;

/**
 * PDF 渲染目的枚举。
 *
 * <p>用于区分不同使用场景下页脚（备注、审核护士签名）的展示策略。</p>
 */
public enum HljldPdfRenderPurpose {

    /** 普通 PDF 预览（浏览器 iframe 加载） */
    PREVIEW,

    /** 打印当日（单护理日打印） */
    PRINT_DAY,

    /** 打印时间范围（指定起止护理日） */
    PRINT_RANGE,

    /** 一键打印全部（全住院期） */
    PRINT_ALL
}
