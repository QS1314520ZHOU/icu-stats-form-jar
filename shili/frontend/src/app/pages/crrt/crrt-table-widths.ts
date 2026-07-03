/**
 * CRRT 主表列宽（共 15 列）：供 nz-table 的 nzWidthConfig 使用。
 * ng-zorro 会为每列生成 <col style="width:…">，随 outerHTML 进入 Electron 打印。
 *
 * 注意：可写区域宽约 186mm（210mm 纸 − 左右各 12mm padding），折算约 700px；
 * 各列 px 之和不宜明显超过 ~700，否则表格会横向超出 A4 区域。
 */
export const CRRT_TABLE_WIDTH_CONFIG: readonly string[] = [
  '44px', // 时间（过窄时「居中」看不出效果）
  '70px', // 生命体征
  '54px', // 模式
  '37px',
  '37px',
  '37px',
  '37px', // 机器压力 PA–PBF
  '37px',
  '37px',
  '37px',
  '37px', // 流速
  '52px', // 抗凝剂
  '48px', // 超滤率
  '74px', // 报警及处理（与时间列加宽对调，总宽不变）
  '56px', // 签名
];
