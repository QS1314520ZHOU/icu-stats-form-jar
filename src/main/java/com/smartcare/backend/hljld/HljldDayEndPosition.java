package com.smartcare.backend.hljld;

/**
 * 护理日结束位置模型。
 * 记录每个护理日正文结束时的页面位置，用于动态定位备注区。
 */
public final class HljldDayEndPosition {

    private final int localPageNumber;
    private final float contentEndY;

    public HljldDayEndPosition(int localPageNumber, float contentEndY) {
        this.localPageNumber = localPageNumber;
        this.contentEndY = contentEndY;
    }

    public int getLocalPageNumber() {
        return localPageNumber;
    }

    public float getContentEndY() {
        return contentEndY;
    }

    @Override
    public String toString() {
        return "HljldDayEndPosition{localPage=" + localPageNumber
            + ", contentEndY=" + contentEndY + "}";
    }
}
