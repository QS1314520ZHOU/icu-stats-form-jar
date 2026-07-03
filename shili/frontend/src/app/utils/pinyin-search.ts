import PinyinMatch from 'pinyin-match';

/**
 * 通用的 nz-select 拼音检索过滤函数
 * @param input 用户输入的搜索词
 * @param option nz-option 对应的选项对象
 */
export function pinyinFilterOption(input: string, option: any): boolean {
  if (!input) {
    return true;
  }
  const label = option?.nzLabel;
  if (!label) {
    return false;
  }
  // PinyinMatch.match 返回一个数组（匹配的起始和结束索引）或 false
  return !!PinyinMatch.match(label, input);
}
