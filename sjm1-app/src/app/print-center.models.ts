import { Type } from '@angular/core';

export type PrintOrientation = 'landscape' | 'portrait';
export type PrintGroupKey = 'tube' | 'risk' | 'therapy' | 'nursing';

/** 可打印表单定义 */
export interface PrintFormDef {
  /** 唯一键，与后端 availability 的 key 一致 */
  key: string;
  /** 显示名称 */
  title: string;
  /** /form/<route> */
  route: string;
  group: PrintGroupKey;
  /** 纸张方向，必须与组件自身 @page 一致 */
  orientation: PrintOrientation;
  /** 组件类，用于离屏渲染 */
  component: Type<unknown>;
  /** 降级探测配置；缺省表示只能靠聚合接口或本地存储 */
  probe?: ProbeDef;
  /** 渲染前对实例做的额外设置（如 hljld 需要日期） */
  applyContext?: (instance: any) => void;
}

export type ProbeDef =
  | { kind: 'score'; scoreType: string }
  | { kind: 'bedside'; codes: string[] }
  | { kind: 'tube'; tubeType: string }
  | { kind: 'url'; url: string; params?: Record<string, string>; pick?: (body: any) => number }
  | { kind: 'local'; storageKeyPrefix: string };

/** 单张表单的数据可用性 */
export interface FormAvailability {
  key: string;
  hasData: boolean;
  count: number;
  latestTime?: string;
  estimatedPages?: number;
}

export type RowState = 'idle' | 'rendering' | 'ready' | 'failed';

/** 界面上的一行 */
export interface PrintRow {
  def: PrintFormDef;
  selected: boolean;
  hasData: boolean;
  count: number;
  latestTime?: string;
  estimatedPages: number;
  /** 预检后拿到的真实页数 */
  renderedPages: number;
  /** [] = 全部 */
  selectedPages: number[];
  /** 采集到的 sheet HTML（预检产物） */
  sheets: string[];
  state: RowState;
  errorText: string;
}

export interface PrintGroupView {
  key: PrintGroupKey;
  name: string;
  rows: PrintRow[];
}
