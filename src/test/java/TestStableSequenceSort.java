import java.util.*;

/**
 * 回归测试：验证 PrintableItem 稳定排序在 row-99 → row-100 边界不会错乱。
 *
 * 旧逻辑（字符串 stableId）：row-100 < row-97（字典序），导致跨页顺序错乱。
 * 新逻辑（数字 stableSequence）：97 < 98 < 99 < 100 < 101 < 102，顺序保持不变。
 */
public class TestStableSequenceSort {

    // 模拟 PrintableItem 的排序字段
    static class SortableItem {
        long sortTime;
        int sortPriority;
        String stableId;      // 旧字段，仅用于对比
        long stableSequence;  // 新字段
        String label;         // 可读标签

        SortableItem(long sortTime, int sortPriority, long stableSequence, String stableId, String label) {
            this.sortTime = sortTime;
            this.sortPriority = sortPriority;
            this.stableSequence = stableSequence;
            this.stableId = stableId;
            this.label = label;
        }
    }

    public static void main(String[] args) {
        long baseTime = 1756438800000L; // 2026-08-29 09:00:00 CST
        int passed = 0;
        int failed = 0;

        // ═══ 测试 1：99→100 边界，同一时间点 6 条记录 ═══
        System.out.println("=== 测试1: 99→100 边界 (同一时间点6条记录) ===");
        List<SortableItem> items1 = new ArrayList<>();
        String[] names = {"依诺肝素", "0.9%氯化钠", "甲硫酸新斯的明", "美罗培南", "盐酸洛贝林", "吸入用盐酸氨溴索"};
        // 从 seq=97 开始，模拟前面已有 97 条记录
        for (int i = 0; i < 6; i++) {
            long seq = 97 + i;
            String sid = String.format("%04d-row-%d", 5, seq);
            items1.add(new SortableItem(baseTime, 20, seq, sid, names[i]));
        }

        // 旧排序（字符串 stableId）
        List<SortableItem> oldSorted1 = new ArrayList<>(items1);
        oldSorted1.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparing((SortableItem p) -> p.stableId));

        // 新排序（数字 stableSequence）
        List<SortableItem> newSorted1 = new ArrayList<>(items1);
        newSorted1.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparingLong((SortableItem p) -> p.stableSequence));

        System.out.println("  原始顺序: " + formatLabels(items1));
        System.out.println("  旧排序结果: " + formatLabels(oldSorted1));
        System.out.println("  新排序结果: " + formatLabels(newSorted1));

        boolean oldCorrect1 = isOriginalOrder(oldSorted1, names);
        boolean newCorrect1 = isOriginalOrder(newSorted1, names);
        System.out.println("  旧排序正确: " + oldCorrect1 + (oldCorrect1 ? "" : " ← BUG: 字符串排序跨位数边界错乱!"));
        System.out.println("  新排序正确: " + newCorrect1);
        if (!oldCorrect1 && newCorrect1) { passed++; } else { failed++; System.out.println("  FAIL"); }

        // ═══ 测试 2：199→200 边界 ═══
        System.out.println("\n=== 测试2: 199→200 边界 ===");
        List<SortableItem> items2 = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            long seq = 197 + i;
            String sid = String.format("%04d-row-%d", 10, seq);
            items2.add(new SortableItem(baseTime, 20, seq, sid, "drug-" + seq));
        }
        List<SortableItem> oldSorted2 = new ArrayList<>(items2);
        oldSorted2.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparing((SortableItem p) -> p.stableId));
        List<SortableItem> newSorted2 = new ArrayList<>(items2);
        newSorted2.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparingLong((SortableItem p) -> p.stableSequence));

        boolean oldCorrect2 = isSequential(oldSorted2);
        boolean newCorrect2 = isSequential(newSorted2);
        System.out.println("  旧排序正确: " + oldCorrect2 + (oldCorrect2 ? " (此边界字符串排序恰好正确)" : " ← BUG"));
        System.out.println("  新排序正确: " + newCorrect2);
        if (newCorrect2) { passed++; } else { failed++; System.out.println("  FAIL"); }

        // ═══ 测试 3：跨时间组，不同 sortTime 不受影响 ═══
        System.out.println("\n=== 测试3: 不同时间组 (sortTime不同) ===");
        List<SortableItem> items3 = new ArrayList<>();
        items3.add(new SortableItem(baseTime - 1800000, 20, 0, "0000-row-0", "08:30-药物A"));
        items3.add(new SortableItem(baseTime, 20, 1, "0001-row-1", "09:00-药物B"));
        items3.add(new SortableItem(baseTime, 20, 2, "0001-row-2", "09:00-药物C"));
        List<SortableItem> sorted3 = new ArrayList<>(items3);
        sorted3.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparingLong((SortableItem p) -> p.stableSequence));
        boolean correct3 = sorted3.get(0).label.equals("08:30-药物A")
            && sorted3.get(1).label.equals("09:00-药物B")
            && sorted3.get(2).label.equals("09:00-药物C");
        System.out.println("  排序结果: " + formatLabels(sorted3));
        System.out.println("  正确: " + correct3);
        if (correct3) { passed++; } else { failed++; System.out.println("  FAIL"); }

        // ═══ 测试 4：sortPriority 不同时顺序正确 ═══
        System.out.println("\n=== 测试4: 不同sortPriority (小结行插入) ===");
        List<SortableItem> items4 = new ArrayList<>();
        items4.add(new SortableItem(baseTime, 20, 0, "0000-row-0", "普通行"));
        items4.add(new SortableItem(baseTime, 25, 1, "0000-settlement-1", "小结行"));
        items4.add(new SortableItem(baseTime, 30, 2, "0000-summary-DAY_SUMMARY", "日间小结"));
        List<SortableItem> sorted4 = new ArrayList<>(items4);
        sorted4.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparingLong((SortableItem p) -> p.stableSequence));
        boolean correct4 = sorted4.get(0).label.equals("普通行")
            && sorted4.get(1).label.equals("小结行")
            && sorted4.get(2).label.equals("日间小结");
        System.out.println("  排序结果: " + formatLabels(sorted4));
        System.out.println("  正确: " + correct4);
        if (correct4) { passed++; } else { failed++; System.out.println("  FAIL"); }

        // ═══ 测试 5：999→1000 边界 ═══
        System.out.println("\n=== 测试5: 999→1000 边界 ===");
        List<SortableItem> items5 = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            long seq = 997 + i;
            String sid = String.format("%04d-row-%d", 50, seq);
            items5.add(new SortableItem(baseTime, 20, seq, sid, "drug-" + seq));
        }
        List<SortableItem> oldSorted5 = new ArrayList<>(items5);
        oldSorted5.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparing((SortableItem p) -> p.stableId));
        List<SortableItem> newSorted5 = new ArrayList<>(items5);
        newSorted5.sort(Comparator
            .comparingLong((SortableItem p) -> p.sortTime)
            .thenComparingInt((SortableItem p) -> p.sortPriority)
            .thenComparingLong((SortableItem p) -> p.stableSequence));

        boolean oldCorrect5 = isSequential(oldSorted5);
        boolean newCorrect5 = isSequential(newSorted5);
        System.out.println("  旧排序正确: " + oldCorrect5 + (oldCorrect5 ? "" : " ← BUG"));
        System.out.println("  新排序正确: " + newCorrect5);
        if (newCorrect5) { passed++; } else { failed++; System.out.println("  FAIL"); }

        // ═══ 总结 ═══
        System.out.println("\n══════════════════════════════════════");
        System.out.println("结果: " + passed + " passed, " + failed + " failed");
        if (failed == 0) {
            System.out.println("✓ 所有测试通过 - stableSequence 修复验证成功");
        } else {
            System.out.println("✗ 有测试失败");
            System.exit(1);
        }
    }

    /** 检查是否保持原始顺序 */
    private static boolean isOriginalOrder(List<SortableItem> sorted, String[] expectedNames) {
        for (int i = 0; i < sorted.size(); i++) {
            if (!sorted.get(i).label.equals(expectedNames[i])) return false;
        }
        return true;
    }

    /** 检查 stableSequence 是否递增 */
    private static boolean isSequential(List<SortableItem> sorted) {
        for (int i = 1; i < sorted.size(); i++) {
            if (sorted.get(i).stableSequence <= sorted.get(i - 1).stableSequence) return false;
        }
        return true;
    }

    private static String formatLabels(List<SortableItem> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(items.get(i).label);
        }
        sb.append("]");
        return sb.toString();
    }
}
