package com.smartcare.backend.hljld;

/**
 * 小结文本片段，对应前端 SummaryTextToken。
 */
public class SummaryTextToken {
    private String text = "";
    private boolean strong;
    private boolean sep;

    public SummaryTextToken() {}

    public SummaryTextToken(String text) {
        this.text = text;
    }

    public SummaryTextToken(String text, boolean strong) {
        this.text = text;
        this.strong = strong;
    }

    public SummaryTextToken(String text, boolean strong, boolean sep) {
        this.text = text;
        this.strong = strong;
        this.sep = sep;
    }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public boolean isStrong() { return strong; }
    public void setStrong(boolean strong) { this.strong = strong; }
    public boolean isSep() { return sep; }
    public void setSep(boolean sep) { this.sep = sep; }
}
