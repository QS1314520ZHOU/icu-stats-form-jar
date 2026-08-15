import { Injectable, ComponentRef, ViewContainerRef } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { shouldPrintPage } from './form-print-pages.util';
import {
  FormAvailability, PrintFormDef, PrintOrientation, PrintRow, ProbeDef,
} from './print-center.models';

const READY_TIMEOUT_MS = 12000;
const READY_POLL_MS = 120;
const PRINT_GUARD_TIMEOUT_MS = 2 * 60 * 1000;

@Injectable()
export class PrintCenterService {
  private readonly API_AVAILABILITY = '/api/v1/icu/print-center/availability';
  private stageEl: HTMLElement | null = null;

  constructor(private readonly http: HttpClient) {}

  /* ============================ 数据可用性 ============================ */

  /** 优先聚合接口，失败降级为逐表探测 */
  loadAvailability(pid: string, defs: PrintFormDef[]): Observable<Map<string, FormAvailability>> {
    return this.http
      .get<{ items?: FormAvailability[] }>(this.API_AVAILABILITY, { params: new HttpParams().set('pid', pid) })
      .pipe(
        map(res => {
          const items = Array.isArray(res?.items) ? res!.items! : [];
          if (!items.length) { throw new Error('empty'); }
          const table = new Map<string, FormAvailability>();
          items.forEach(item => table.set(item.key, item));
          // 聚合接口未覆盖的（如 localStorage 类）本地补齐
          defs.forEach(def => {
            if (!table.has(def.key) && def.probe?.kind === 'local') {
              table.set(def.key, this.probeLocal(def, pid));
            }
          });
          return table;
        }),
        catchError(() => this.probeAll(pid, defs)),
      );
  }

  private probeAll(pid: string, defs: PrintFormDef[]): Observable<Map<string, FormAvailability>> {
    const tasks = defs.map(def => this.probeOne(pid, def));
    return forkJoin(tasks).pipe(
      map(list => {
        const table = new Map<string, FormAvailability>();
        list.forEach(item => table.set(item.key, item));
        return table;
      }),
    );
  }

  private probeOne(pid: string, def: PrintFormDef): Observable<FormAvailability> {
    const empty: FormAvailability = { key: def.key, hasData: false, count: 0 };
    const probe = def.probe;
    if (!probe) { return of(empty); }
    if (probe.kind === 'local') { return of(this.probeLocal(def, pid)); }

    const { url, params, pick } = this.buildProbeRequest(pid, probe);
    return this.http.get<any>(url, { params }).pipe(
      map(body => {
        const count = pick ? pick(body) : this.countOf(body);
        return {
          key: def.key,
          hasData: count > 0,
          count,
          latestTime: this.latestTimeOf(body),
          estimatedPages: count > 0 ? Math.max(1, Math.ceil(count / 8)) : 0,
        } as FormAvailability;
      }),
      catchError(() => of(empty)),
    );
  }

  private buildProbeRequest(pid: string, probe: Exclude<ProbeDef, { kind: 'local' }>):
      { url: string; params: HttpParams; pick?: (body: any) => number } {
    let params = new HttpParams().set('pid', pid);
    switch (probe.kind) {
      case 'score':
        return { url: '/api/v1/icu/score/listByPid', params: params.set('scoreType', probe.scoreType) };
      case 'bedside':
        return { url: '/api/v1/icu/bedside/listByPid', params: params.set('codes', probe.codes.join(',')) };
      case 'tube':
        return { url: '/api/v1/icu/tube-exe/listByPid', params: params.set('type', probe.tubeType) };
      case 'url': {
        Object.entries(probe.params ?? {}).forEach(([k, v]) => { params = params.set(k, v); });
        if (probe.url.includes('/hljld/nurse-records')) {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          params = params.set('startTime', start.toISOString()).set('endTime', end.toISOString());
        }
        return { url: probe.url, params, pick: probe.pick };
      }
    }
  }

  private probeLocal(def: PrintFormDef, pid: string): FormAvailability {
    const probe = def.probe as Extract<ProbeDef, { kind: 'local' }>;
    let count = 0;
    try {
      const raw = localStorage.getItem(`${probe.storageKeyPrefix}${pid}`);
      const parsed = raw ? JSON.parse(raw) : [];
      count = Array.isArray(parsed) ? parsed.length : 0;
    } catch { count = 0; }
    return { key: def.key, hasData: count > 0, count, estimatedPages: count > 0 ? 1 : 0 };
  }

  private countOf(body: any): number {
    if (Array.isArray(body)) { return body.length; }
    if (Array.isArray(body?.data)) { return body.data.length; }
    return body ? 1 : 0;
  }

  private latestTimeOf(body: any): string | undefined {
    const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    let latest: string | undefined;
    for (const item of list) {
      const time = item?.time ?? item?.updatedAt ?? item?.createdAt;
      if (typeof time === 'string' && (!latest || time > latest)) { latest = time; }
    }
    return latest;
  }

  /* ============================ 离屏渲染与采集 ============================ */

  /** 设置离屏渲染舞台的 DOM 引用，用于提取 scoped 样式 */
  setStageElement(el: HTMLElement): void { this.stageEl = el; }

  /**
   * 串行渲染并采集 sheet。单张失败不抛出，写入 row.state='failed'。
   * 必须在有真实布局的离屏容器中调用（不能是 display:none）。
   */
  async collect(
    rows: PrintRow[],
    vcr: ViewContainerRef,
    onProgress: (row: PrintRow) => void,
    isCancelled: () => boolean,
  ): Promise<void> {
    for (const row of rows) {
      if (isCancelled()) { return; }
      row.state = 'rendering';
      row.errorText = '';
      onProgress(row);

      let ref: ComponentRef<unknown> | null = null;
      try {
        ref = vcr.createComponent(row.def.component as any);
        row.def.applyContext?.(ref.instance);
        await this.waitReady(ref);
        const host = ref.location.nativeElement as HTMLElement;
        row.sheets = this.harvest(host);
        row.renderedPages = row.sheets.length;
        row.state = row.renderedPages > 0 ? 'ready' : 'failed';
        if (row.renderedPages === 0) { row.errorText = '未渲染出可打印内容'; }
      } catch (error) {
        row.state = 'failed';
        row.sheets = [];
        row.renderedPages = 0;
        row.errorText = error instanceof Error ? error.message : '渲染失败';
      } finally {
        try { ref?.destroy(); } catch { /* ignore */ }
        vcr.clear();
      }
      // 让出事件循环，使进度文字能够真实刷新
      await this.delay(0);
      onProgress(row);
    }
  }

  private async waitReady(ref: ComponentRef<unknown>): Promise<void> {
    const host = ref.location.nativeElement as HTMLElement;
    const started = Date.now();
    while (Date.now() - started < READY_TIMEOUT_MS) {
      try { ref.changeDetectorRef.detectChanges(); } catch { /* ignore */ }
      const instance = ref.instance as any;
      const loading = typeof instance?.loading === 'boolean' ? instance.loading : false;
      if (!loading && host.querySelector('.sheet')) {
        await this.nextFrames();
        return;
      }
      await this.delay(READY_POLL_MS);
    }
    throw new Error('渲染超时（12s）');
  }

  private harvest(host: HTMLElement): string[] {
    const sheets = Array.from(host.querySelectorAll<HTMLElement>('.sheet'));
    return sheets.map(source => {
      const clone = source.cloneNode(true) as HTMLElement;
      clone.classList.remove('sheet-hidden', 'print-hidden');
      clone.style.zoom = '1';
      clone.style.transform = 'none';
      clone.style.margin = '0';
      clone.style.boxShadow = 'none';
      clone.querySelectorAll('.no-print, .toolbar').forEach(node => node.remove());
      this.freezeControls(source, clone);
      return clone.outerHTML;
    });
  }

  /** 把表单控件的运行时值固化到 clone 的属性上，否则打印稿会丢失勾选与手填内容 */
  private freezeControls(source: HTMLElement, clone: HTMLElement): void {
    const selector = 'input, textarea, select';
    const from = Array.from(source.querySelectorAll<HTMLElement>(selector));
    const to = Array.from(clone.querySelectorAll<HTMLElement>(selector));
    from.forEach((origin, index) => {
      const target = to[index];
      if (!target) { return; }
      if (origin instanceof HTMLInputElement && target instanceof HTMLInputElement) {
        if (origin.type === 'checkbox' || origin.type === 'radio') {
          if (origin.checked) { target.setAttribute('checked', 'checked'); }
          else { target.removeAttribute('checked'); }
        } else {
          target.setAttribute('value', origin.value ?? '');
        }
      } else if (origin instanceof HTMLTextAreaElement) {
        target.textContent = origin.value ?? '';
      } else if (origin instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
        Array.from(target.options).forEach((option, i) => {
          if (i === origin.selectedIndex) { option.setAttribute('selected', 'selected'); }
          else { option.removeAttribute('selected'); }
        });
      }
    });
  }

  /* ============================ 打印 ============================ */

  /**
   * 按纸张方向分组，串行调起打印对话框。
   * @param preOpenedWin 预创建的打印窗口（同步 window.open 的产物）；首组使用它，后续组各自 window.open。
   */
  async printRows(rows: PrintRow[], preOpenedWin?: Window | null): Promise<void> {
    const orders: PrintOrientation[] = ['landscape', 'portrait'];
    let win: Window | null = preOpenedWin ?? null;
    try {
      for (const orientation of orders) {
        const group = rows.filter(row => row.def.orientation === orientation && row.state === 'ready');
        const bodies = group.flatMap(row =>
          row.sheets
            .filter((_, index) => shouldPrintPage(index + 1, row.selectedPages, row.sheets.length))
            .map(html => `<div class="print-page">${html}</div>`),
        );
        if (!bodies.length) { continue; }
        win = await this.openAndPrint(orientation, bodies, win);
        // 如果首组用了预创建窗口，后续组需要新窗口
        win = null;
      }
    } finally {
      // 确保不留空白窗口
      try { if (win && !win.closed) { win.close(); } } catch { /* ignore */ }
    }
  }

  /**
   * 将打印内容写入窗口并调起 print()。
   * 如果传入 win 则复用（预创建窗口），否则新建。
   * 返回实际使用的窗口引用（可能已被关闭）。
   */
  private openAndPrint(orientation: PrintOrientation, bodies: string[], existingWin?: Window | null): Promise<Window | null> {
    return new Promise<Window | null>((resolve) => {
      const win = existingWin && !existingWin.closed ? existingWin : window.open('', '_blank', 'width=1400,height=900');
      if (!win) { resolve(null); return; }

      // 收集离屏容器中渲染时产生的 scoped 样式
      const scopedStyles = this.collectScopedStyles();
      const overrideCss = this.overrideCss(orientation);
      const body = bodies.join('');

      // 分批写入，避免一次性 document.write 超大字符串阻塞主线程
      win.document.open();
      win.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>批量打印</title>`);
      win.document.write(`<style>${overrideCss}</style>`);
      if (scopedStyles) { win.document.write(`<style>${scopedStyles}</style>`); }
      win.document.write(`</head><body>${body}</body></html>`);
      win.document.close();

      let settled = false;
      const cleanup = () => { if (settled) { return; } settled = true; resolve(win); };
      const forceDone = () => { try { win!.close(); } catch { /* ignore */ } cleanup(); };

      win.addEventListener('afterprint', forceDone, { once: true });
      // 兜底：部分浏览器不触发 afterprint，或用户手动关闭窗口
      const guard = setInterval(() => {
        try { if (win!.closed) { clearInterval(guard); cleanup(); } } catch { clearInterval(guard); cleanup(); }
      }, 500);
      setTimeout(() => { clearInterval(guard); forceDone(); }, PRINT_GUARD_TIMEOUT_MS);

      const run = () => {
        const doc = win!.document as any;
        (doc.fonts?.ready ?? Promise.resolve()).then(() => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            // 打印前尺寸校验
            const overflows: string[] = [];
            win!.document.querySelectorAll<HTMLElement>('.sheet').forEach((sheet, i) => {
              if (sheet.scrollHeight > sheet.clientHeight + 1) {
                overflows.push(`第${i + 1}页纵向溢出 ${sheet.scrollHeight - sheet.clientHeight}px`);
              }
            });
            if (overflows.length) { console.warn('[PrintCenter]', overflows.join('；')); }
            win!.focus();
            win!.print();
          }));
        });
      };
      if (win.document.readyState === 'complete') { run(); }
      else { win.addEventListener('load', run, { once: true }); }
    });
  }

  /**
   * 从离屏渲染容器中提取 scoped <style> 标签内容。
   * Angular 为组件注入的 <style> 带有 _ngcontent-* 属性，与 clone 的 DOM 搭配使用。
   * 只提取一次，避免重复收集。
   */
  private collectScopedStyles(): string {
    if (!this.stageEl) { return ''; }
    const seen = new Set<string>();
    const parts: string[] = [];
    // 全局基础样式：字体、重置
    parts.push(`html,body{margin:0;padding:0;background:#fff;font-family:'SimSun','宋体',serif;color:#000}`);
    // 从离屏容器中提取 Angular scoped 样式
    const styleEls = this.stageEl.querySelectorAll<HTMLStyleElement>('style[ng-transition],style[_ngcontent-ng-server-style],style');
    styleEls.forEach(el => {
      const text = el.textContent ?? '';
      if (text && !seen.has(text)) {
        seen.add(text);
        parts.push(text);
      }
    });
    return parts.join('\n');
  }

  /**
   * 打印覆盖样式。
   * 使用 min-height 而非固定 height，允许内容超过单页的表单（如健康教育）自然撑高。
   * 不使用 overflow:hidden，避免裁剪真实内容。
   */
  private overrideCss(orientation: PrintOrientation): string {
    const width = orientation === 'landscape' ? '297mm' : '210mm';
    const minHeight = orientation === 'landscape' ? '210mm' : '297mm';
    return `
      @page { size: A4 ${orientation}; margin: 0; }
      html, body { margin:0; padding:0; background:#fff; }
      .no-print, .toolbar { display:none !important; }
      .print-page { box-sizing:border-box; width:${width}; min-height:${minHeight}; margin:0;
                    break-after:page; page-break-after:always; background:#fff; }
      .print-page:last-child { break-after:auto; page-break-after:auto; }
      .print-page > .sheet { box-sizing:border-box; width:${width} !important; min-height:${minHeight} !important;
                    max-width:${width} !important;
                    margin:0 !important; box-shadow:none !important;
                    transform:none !important; zoom:1 !important; filter:none !important; }
      .sheet-hidden, .print-hidden { display:block !important; }
    `;
  }

  /** 清空不再使用的 sheets HTML，释放内存 */
  clearSheetCache(rows: PrintRow[]): void {
    rows.forEach(row => { row.sheets = []; row.renderedPages = 0; });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private nextFrames(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
}
