package com.smartcare.backend.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.font.PdfFontFactory.EmbeddingStrategy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

/**
 * 字体包：管理主字体和回退字体，为每个 PdfDocument 创建独立的字体实例。
 *
 * <p>iText 的 PdfFont 对象可能绑定到特定的 PdfDocument 的间接对象，
 * 因此不能跨文档缓存 PdfFont 实例。本类缓存字体路径和原始字节，
 * 每次调用 {@link #createForDocument()} 时创建新的 PdfFont 实例。</p>
 */
public class HljldPdfFontBundle {

    private static final Logger log = LoggerFactory.getLogger(HljldPdfFontBundle.class);

    /** 主字体 classpath 资源路径（宋体） */
    private static final String PRIMARY_FONT_RESOURCE = "/fonts/simsun.ttc";
    private static final int PRIMARY_TTC_INDEX = 0;

    /** 回退字体 classpath 资源路径（支持 Unicode 下标/上标） */
    private static final String FALLBACK_FONT_RESOURCE = "/fonts/DejaVuSansMono.ttf";

    /** 缓存字体原始字节，避免重复磁盘 IO */
    private static volatile byte[] primaryFontBytes;
    private static volatile byte[] fallbackFontBytes;
    private static volatile String primaryFontName;
    private static volatile String fallbackFontName;

    /** 缓存临时字体文件路径，避免重复创建临时文件 */
    private static volatile String cachedPrimaryTempPath;
    private static volatile boolean primaryTempPathResolved = false;

    /** Unicode 下标映射表 (U+2080 ~ U+2089) */
    private static final Map<Integer, Integer> SUBSCRIPT_MAP = new HashMap<>();
    /** Unicode 上标映射表 (U+2070, U+00B9, U+00B2, U+00B3, U+2074~U+2079) */
    private static final Map<Integer, Integer> SUPERSCRIPT_MAP = new HashMap<>();
    /** Unicode 上下标正负号映射 */
    private static final Map<Integer, Integer> SIGN_MAP = new HashMap<>();

    static {
        // 下标数字 → 普通数字
        for (int i = 0; i <= 9; i++) {
            SUBSCRIPT_MAP.put(0x2080 + i, (int)('0' + i));  // ₀₁₂₃₄₅₆₇₈₉ → 0123456789
        }
        // 上标数字 → 普通数字/符号
        SUPERSCRIPT_MAP.put(0x2070, (int)'0');   // ⁰
        SUPERSCRIPT_MAP.put(0x00B9, (int)'1');   // ¹
        SUPERSCRIPT_MAP.put(0x00B2, (int)'2');   // ²
        SUPERSCRIPT_MAP.put(0x00B3, (int)'3');   // ³
        for (int i = 4; i <= 9; i++) {
            SUPERSCRIPT_MAP.put(0x2070 + i, (int)('0' + i));  // ⁴⁵⁶⁷⁸⁹ → 456789
        }
        // 上下标正负号
        SIGN_MAP.put(0x208A, (int)'+');  // ₊
        SIGN_MAP.put(0x208B, (int)'-');  // ₋
        SIGN_MAP.put(0x207A, (int)'+');  // ⁺
        SIGN_MAP.put(0x207B, (int)'-');  // ⁻
    }

    private final PdfFont primaryFont;
    private final PdfFont fallbackFont;

    /**
     * 创建字体包（必须在 PdfDocument 打开状态下创建）。
     *
     * @param primaryPath   主字体路径，如果为 null 则使用默认路径
     * @param fallbackPath  回退字体路径，如果为 null 则使用默认路径
     */
    private HljldPdfFontBundle(PdfFont primaryFont, PdfFont fallbackFont) {
        this.primaryFont = primaryFont;
        this.fallbackFont = fallbackFont;
    }

    /**
     * 为当前 PdfDocument 创建新的字体包实例。
     *
     * @return 字体包实例
     */
    public static HljldPdfFontBundle createForDocument() {
        return createForDocument(PRIMARY_FONT_RESOURCE, FALLBACK_FONT_RESOURCE);
    }

    /**
     * 为当前 PdfDocument 创建新的字体包实例。
     *
     * @param primaryResource  主字体 classpath 资源路径
     * @param fallbackResource 回退字体 classpath 资源路径
     * @return 字体包实例
     */
    public static HljldPdfFontBundle createForDocument(String primaryResource, String fallbackResource) {
        PdfFont primary = null;
        PdfFont fallback = null;

        // 加载主字体（TTC 字体）
        try {
            byte[] primaryBytes = loadFontBytesFromClasspath(primaryResource);
            if (primaryBytes != null) {
                // TTC 字体需要写入临时文件才能指定 collection index
                // 使用缓存的临时文件路径，避免重复创建
                String tempPath = getOrCreatePrimaryTempFile(primaryBytes);

                primary = PdfFontFactory.createFont(
                    tempPath + ",0",
                    PdfEncodings.IDENTITY_H
                );
                primaryFontName = primary.getFontProgram().getFontNames().getFontName();
                log.debug("主字体加载成功: {} ({} bytes)", primaryFontName, primaryBytes.length);
            } else {
                log.error("主字体资源不存在: {}", primaryResource);
            }
        } catch (IOException e) {
            log.error("主字体加载失败: {}", primaryResource, e);
        }

        // 加载回退字体（TTF 字体使用字节方式加载，确保嵌入）
        try {
            byte[] fallbackBytes = loadFontBytesFromClasspath(fallbackResource);
            if (fallbackBytes != null) {
                fallback = PdfFontFactory.createFont(
                    fallbackBytes,
                    PdfEncodings.IDENTITY_H
                );
                fallbackFontName = fallback.getFontProgram().getFontNames().getFontName();
                log.info("回退字体加载成功: {} ({} bytes)", fallbackFontName, fallbackBytes.length);
            } else {
                log.error("回退字体资源不存在: {}", fallbackResource);
            }
        } catch (IOException e) {
            log.error("回退字体加载失败: {}", fallbackResource, e);
        }

        if (primary == null) {
            log.error("主字体加载失败，PDF 中文显示将异常！请检查字体资源: {}", primaryResource);
        }
        if (fallback == null) {
            log.warn("回退字体加载失败，Unicode 下标/上标可能无法显示: {}", fallbackResource);
        }

        return new HljldPdfFontBundle(primary, fallback);
    }

    /**
     * 为指定 code point 解析最佳字体。
     *
     * @param codePoint Unicode code point
     * @return 最佳字体，如果都不可用则返回 primary（可能无法显示字形）
     */
    public PdfFont resolve(int codePoint) {
        // 优先检查主字体
        if (primaryFont != null && primaryFont.containsGlyph(codePoint)) {
            return primaryFont;
        }

        // 回退到 fallback 字体
        if (fallbackFont != null && fallbackFont.containsGlyph(codePoint)) {
            return fallbackFont;
        }

        // 两个字体都没有字形，返回 primary（后续会用 ASCII 兜底）
        return primaryFont != null ? primaryFont : fallbackFont;
    }

    /**
     * 检查给定 code point 是否在任何字体中有字形。
     */
    public boolean hasGlyph(int codePoint) {
        if (primaryFont != null && primaryFont.containsGlyph(codePoint)) {
            return true;
        }
        if (fallbackFont != null && fallbackFont.containsGlyph(codePoint)) {
            return true;
        }
        return false;
    }

    /**
     * 判断 code point 是否为 Unicode 下标字符。
     */
    public static boolean isSubscript(int codePoint) {
        return SUBSCRIPT_MAP.containsKey(codePoint);
    }

    /**
     * 判断 code point 是否为 Unicode 上标字符。
     */
    public static boolean isSuperscript(int codePoint) {
        return SUPERSCRIPT_MAP.containsKey(codePoint);
    }

    /**
     * 判断 code point 是否为上下标正负号。
     */
    public static boolean isSign(int codePoint) {
        return SIGN_MAP.containsKey(codePoint);
    }

    /**
     * 获取下标字符对应的普通 ASCII 字符。
     */
    public static int getSubscriptFallback(int codePoint) {
        return SUBSCRIPT_MAP.getOrDefault(codePoint, codePoint);
    }

    /**
     * 获取上标字符对应的普通 ASCII 字符。
     */
    public static int getSuperscriptFallback(int codePoint) {
        return SUPERSCRIPT_MAP.getOrDefault(codePoint, codePoint);
    }

    /**
     * 获取正负号字符对应的普通 ASCII 字符。
     */
    public static int getSignFallback(int codePoint) {
        return SIGN_MAP.getOrDefault(codePoint, codePoint);
    }

    /**
     * 获取主字体。
     */
    public PdfFont getPrimaryFont() {
        return primaryFont;
    }

    /**
     * 获取回退字体。
     */
    public PdfFont getFallbackFont() {
        return fallbackFont;
    }

    /**
     * 获取主字体名称。
     */
    public static String getPrimaryFontName() {
        return primaryFontName;
    }

    /**
     * 获取回退字体名称。
     */
    public static String getFallbackFontName() {
        return fallbackFontName;
    }

    // ══════════════════════════════════════════════════════════
    //  私有辅助方法
    // ══════════════════════════════════════════════════════════

    /**
     * 从 classpath 加载字体文件字节。
     *
     * @param resourcePath classpath 资源路径（如 /fonts/simsun.ttc）
     * @return 字体文件字节，如果资源不存在返回 null
     */
    private static byte[] loadFontBytesFromClasspath(String resourcePath) throws IOException {
        org.springframework.core.io.Resource resource =
            new org.springframework.core.io.ClassPathResource(resourcePath);
        if (resource.exists()) {
            return resource.getInputStream().readAllBytes();
        }
        log.warn("classpath 字体资源不存在: {}", resourcePath);
        return null;
    }

    /**
     * 获取或创建主字体临时文件（缓存路径，避免重复创建）
     */
    private static synchronized String getOrCreatePrimaryTempFile(byte[] fontBytes) throws IOException {
        if (primaryTempPathResolved && cachedPrimaryTempPath != null) {
            // 检查临时文件是否还存在
            java.io.File tempFile = new java.io.File(cachedPrimaryTempPath);
            if (tempFile.exists()) {
                return cachedPrimaryTempPath;
            }
        }

        // 创建新的临时文件
        java.io.File tempFont = java.io.File.createTempFile("hljld_primary_", ".ttc");
        tempFont.deleteOnExit();
        java.nio.file.Files.write(tempFont.toPath(), fontBytes);

        cachedPrimaryTempPath = tempFont.getAbsolutePath();
        primaryTempPathResolved = true;
        log.info("主字体临时文件创建: {} ({} bytes)", cachedPrimaryTempPath, fontBytes.length);

        return cachedPrimaryTempPath;
    }
}
