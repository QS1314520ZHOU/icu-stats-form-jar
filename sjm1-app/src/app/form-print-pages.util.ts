/**
 * 多选打印页码共享工具函数。
 * 约定：selectedPrintPages = [] 表示"全部"，非空数组表示只打印指定页码。
 */

/** 清理选择：去重、过滤有效范围、升序排列 */
export function normalizePrintPages(
  selectedPages: readonly number[] | null | undefined,
  totalPages: number
): number[] {
  const maximum = Math.max(0, Math.floor(totalPages));
  return Array.from(
    new Set(
      (selectedPages ?? [])
        .map(value => Number(value))
        .filter(value =>
          Number.isInteger(value) &&
          value >= 1 &&
          value <= maximum
        )
    )
  ).sort((a, b) => a - b);
}

/** 判断某页是否应打印（空数组 = 全部） */
export function shouldPrintPage(
  pageNumber: number,
  selectedPages: readonly number[] | null | undefined,
  totalPages: number
): boolean {
  const normalized = normalizePrintPages(selectedPages, totalPages);
  return normalized.length === 0 || normalized.includes(pageNumber);
}

/** 返回选中页数（空数组 = 全部 → 返回 totalPages） */
export function selectedPrintPageCount(
  selectedPages: readonly number[] | null | undefined,
  totalPages: number
): number {
  const normalized = normalizePrintPages(selectedPages, totalPages);
  return normalized.length === 0 ? Math.max(0, totalPages) : normalized.length;
}

/** 生成下拉按钮显示文字 */
export function printPageSelectionLabel(
  selectedPages: readonly number[] | null | undefined,
  totalPages: number
): string {
  const normalized = normalizePrintPages(selectedPages, totalPages);
  if (normalized.length === 0) return '全部';
  if (normalized.length <= 3) return normalized.map(page => `第${page}页`).join('、');
  return `已选 ${normalized.length} 页`;
}
