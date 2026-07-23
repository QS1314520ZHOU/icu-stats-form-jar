import { Component, ElementRef, OnInit } from '@angular/core';

export type SupplyCategory = '常规' | '特殊' | '专科' | '失禁';

export interface SupplyItem {
  id: string;
  category: SupplyCategory;
  name: string;
  quantity: string;
  specification: string;
  purpose: string;
  selected: boolean;
}

interface RenderPage {
  index: number;
  items: SupplyItem[];
  showDocumentHeader: boolean;
  showReferenceImages: boolean;
  showFooterNotice: boolean;
}

@Component({
  standalone: false,
  selector: 'app-wpgm-form',
  templateUrl: './wpgm-form.component.html',
  styleUrls: ['./wpgm-form.component.css'],
})
export class WpgmFormComponent implements OnInit {
  readonly categories: SupplyCategory[] = ['常规', '特殊', '专科', '失禁'];
  selectorOpen = false;
  keyword = '';
  pages: RenderPage[] = [];

  items: SupplyItem[] = [
    { id:'turning-pillow', category:'常规', name:'翻身枕', quantity:'1个', specification:'R型或等边三角形', purpose:'翻身', selected:false },
    { id:'soft-pillow', category:'常规', name:'小软枕', quantity:'2个', specification:'/', purpose:'抬高双手、减轻水肿', selected:false },
    { id:'restraint-gloves', category:'常规', name:'约束手套', quantity:'2个', specification:'手套样式（带拉链）', purpose:'防止意外拔管', selected:false },
    { id:'water-pad', category:'常规', name:'水垫', quantity:'1个', specification:'48×35cm及以上尺寸', purpose:'皮肤减压', selected:false },
    { id:'foam-dressing', category:'常规', name:'泡沫敷料', quantity:'2-3张', specification:'不带卷边，10×10cm及以上', purpose:'皮肤减压', selected:false },
    { id:'nursing-pad', category:'常规', name:'护理垫', quantity:'1-2包', specification:'60×90cm', purpose:'大小便护理', selected:false },
    { id:'cup', category:'常规', name:'杯子', quantity:'1个', specification:'带有刻度', purpose:'装水', selected:false },
    { id:'bowl', category:'常规', name:'碗', quantity:'1个', specification:'带盖，可进微波炉', purpose:'盛装食物', selected:false },
    { id:'basin', category:'常规', name:'盆子', quantity:'2个', specification:'/', purpose:'洗脸、擦浴', selected:false },
    { id:'towel', category:'常规', name:'毛巾', quantity:'2个', specification:'/', purpose:'洗脸、擦浴', selected:false },
    { id:'disinfect-wipes', category:'常规', name:'消毒湿巾', quantity:'1包', specification:'消毒湿巾/75%酒精湿巾', purpose:'消毒个人物品', selected:false },
    { id:'tissue', category:'常规', name:'抽纸', quantity:'4包', specification:'/', purpose:'皮肤清洁', selected:false },
    { id:'wet-wipes', category:'常规', name:'卫生湿巾', quantity:'1-2包', specification:'/', purpose:'皮肤清洁', selected:false },
    { id:'vaseline-lotion', category:'常规', name:'凡士林润肤乳', quantity:'1瓶', specification:'/', purpose:'滋润皮肤', selected:false },
    { id:'lip-balm', category:'常规', name:'润唇膏', quantity:'1支', specification:'安全型', purpose:'滋润口唇', selected:false },
    { id:'nail-clipper', category:'常规', name:'指甲刀', quantity:'1个', specification:'/', purpose:'个人护理', selected:false },
    { id:'tourniquet', category:'常规', name:'止血带', quantity:'2个', specification:'红色', purpose:'压迫止血', selected:false },

    { id:'milk-rice', category:'特殊', name:'牛奶/米粉', quantity:'/', specification:'纯牛奶/婴儿米粉', purpose:'提供能量与营养', selected:false },
    { id:'razor', category:'特殊', name:'剃须刀（男性患者）', quantity:'1个', specification:'安全型', purpose:'个人护理', selected:false },
    { id:'urinal', category:'特殊', name:'尿壶', quantity:'1个', specification:'容积1000ml及以上；带盖、带刻度；男性手提把手式，女性扁平式', purpose:'排泄护理', selected:false },
    { id:'comb', category:'特殊', name:'梳子', quantity:'1把', specification:'/', purpose:'头发护理', selected:false },
    { id:'hair-tie', category:'特殊', name:'头绳', quantity:'2根', specification:'/', purpose:'头发护理', selected:false },
    { id:'shampoo', category:'特殊', name:'洗头液', quantity:'1瓶', specification:'符合国家安全卫生/无刺激', purpose:'头发护理', selected:false },
    { id:'socks', category:'特殊', name:'袜子', quantity:'1双', specification:'透气型', purpose:'保暖', selected:false },
    { id:'hat', category:'特殊', name:'帽子', quantity:'1个', specification:'透气保暖型', purpose:'保暖', selected:false },

    { id:'rhubarb', category:'专科', name:'大黄', quantity:'/', specification:'/', purpose:'清肠解毒、改善腹胀、控制感染', selected:false },
    { id:'mirabilite', category:'专科', name:'芒硝', quantity:'/', specification:'/', purpose:'清肠解毒、改善腹胀、控制感染', selected:false },
    { id:'mirabilite-bag', category:'专科', name:'芒硝袋', quantity:'/', specification:'/', purpose:'装芒硝敷腹部', selected:false },
    { id:'strainer', category:'专科', name:'漏勺', quantity:'/', specification:'/', purpose:'过滤大黄', selected:false },
    { id:'small-basin', category:'专科', name:'小盆子', quantity:'1个', specification:'安全型', purpose:'浸泡大黄', selected:false },
    { id:'corrective-shoes', category:'专科', name:'矫正鞋', quantity:'1双', specification:'医用', purpose:'预防与矫正畸形', selected:false },
    { id:'neck-brace', category:'专科', name:'颈托', quantity:'1个', specification:'医用', purpose:'支撑、保护颈部', selected:false },
    { id:'abdominal-belt', category:'专科', name:'腹带', quantity:'1根', specification:'/', purpose:'减轻伤口疼痛、促进愈合', selected:false },
    { id:'chest-band', category:'专科', name:'多头胸带', quantity:'1根', specification:'改良款', purpose:'固定胸廓，纠正反常呼吸，改善通气', selected:false },

    { id:'tampon', category:'失禁', name:'卫生棉条（量多型）', quantity:'1盒', specification:'/', purpose:'用于大便失禁患者', selected:false },
    { id:'skin-protector', category:'失禁', name:'皮肤保护剂', quantity:'1瓶', specification:'/', purpose:'阻隔刺激、保护皮肤', selected:false },
    { id:'safflower-oil', category:'失禁', name:'赛肤润', quantity:'1瓶', specification:'/', purpose:'滋润、保护皮肤', selected:false },
    { id:'stoma-powder', category:'失禁', name:'造口粉', quantity:'1瓶', specification:'/', purpose:'吸收渗液、减轻刺激', selected:false },
  ];

  constructor(private host: ElementRef) {}

  ngOnInit(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('wpgmForm.selectedIds') || '[]') as string[];
      const selected = new Set(saved);
      this.items.forEach(item => item.selected = selected.has(item.id));
    } catch { /* ignore */ }
    this.paginate();
  }

  get selectedItems(): SupplyItem[] { return this.items.filter(item => item.selected); }
  get selectedCount(): number { return this.selectedItems.length; }

  visibleItems(category: SupplyCategory): SupplyItem[] {
    const key = this.keyword.trim().toLowerCase();
    return this.items.filter(item => item.category === category &&
      (!key || `${item.name}${item.specification}${item.purpose}`.toLowerCase().includes(key)));
  }

  selectedByCategory(category: SupplyCategory): SupplyItem[] {
    return this.items.filter(item => item.category === category && item.selected);
  }

  pageItemsByCategory(page: RenderPage, category: SupplyCategory): SupplyItem[] {
    return page.items.filter(item => item.category === category);
  }

  categoryTotal(category: SupplyCategory): number {
    return this.items.filter(item => item.category === category).length;
  }

  categoryAllSelected(category: SupplyCategory): boolean {
    const list = this.visibleItems(category);
    return list.length > 0 && list.every(item => item.selected);
  }

  toggleCategory(category: SupplyCategory, checked: boolean): void {
    this.visibleItems(category).forEach(item => item.selected = checked);
    this.persistSelection();
  }

  selectAll(): void { this.items.forEach(item => item.selected = true); this.persistSelection(); }
  clearAll(): void { this.items.forEach(item => item.selected = false); this.persistSelection(); }
  onItemChanged(): void { this.persistSelection(); }
  trackById(_: number, item: SupplyItem): string { return item.id; }

  /* ---- 分页：三阶段（表格→图片→第3-8点） ----
   * 使用固定 mm 估算值，不依赖浏览器字体测量。
   * A4 内容区 275mm = 297 - 8(top pad) - 14(bottom pad + page number)
   */
  private paginate(): void {
    const items = this.selectedItems;
    const out: RenderPage[] = [];

    // 0项：1页无表格
    if (!items.length) {
      this.pages = [{ index: 1, items: [], showDocumentHeader: true, showReferenceImages: true, showFooterNotice: true }];
      return;
    }

    // 固定高度估算（mm），与当前CSS一致：padding=2.2mm×2, font=10.5pt, line-height=1.45
    const PAGE_H     = 275; // 页面内容可用高度
    const INTRO_H    = 28;  // 标题10mm + 4段文字~18mm
    const TH_H       = 8;   // 表头单行
    const ROW_H      = 7.5; // 普通单行
    const ROW_H_LONG = 11;  // 长文本行（单列超24字符）
    const IMAGES_H   = 91;  // 6图两行
    const FOOTER_PER = 9;

    const estimatedRowH = (item: SupplyItem): number => {
      const maxCol = Math.max(item.name.length, item.specification.length, item.purpose.length);
      if (maxCol > 24) return ROW_H_LONG;
      if (maxCol > 14) return 9;
      return ROW_H;
    };

    const FOOTER_LINES = [
      '3、以上患者所需物品请家属自行准备，科室及工作人员不销售任何物品。',
      '4、患者身上不留现金、手机及其它贵重物品，若必须留时，请与医护人员当面交接。',
      '5、请注意维护公共环境，请勿在通道座椅上躺卧睡觉，同时请保管好个人财物。',
      '6、医院禁止吸烟及任何形式使用明火，通道电源插座禁止连接大功率电器，插座上不能有裸露的电源线，请及时将充电电源线取下。为了您和家人的安全，请重视消防安全！',
      '7、家属在外走廊等候期间，请不要大声喧哗，以免影响患者休息。',
      '8、住院期间如患者病情变化、转科或生活物品数量不足等情况，医护人员会电话通知您，请保持电话通畅，以便及时与您取得联系，如有需要请拨打科室电话：023-81915173。',
    ];

    // ===== 第一阶段：逐行填表，不预留图片/底部空间 =====
    let cur = this.makePage();
    cur.showDocumentHeader = true;
    let used = INTRO_H + TH_H; // 第1页：标题+第1-2点+表头

    for (const item of items) {
      const rh = estimatedRowH(item);
      if (used + rh > PAGE_H) {
        out.push(cur);
        cur = this.makePage();
        used = TH_H; // 续页只有表头
      }
      cur.items.push(item);
      used += rh;
    }

    // ===== 第二阶段：全部表格行结束后放图片 =====
    if (used + IMAGES_H > PAGE_H) {
      out.push(cur);
      cur = this.makePage();
      used = 0;
    }
    cur.showReferenceImages = true;
    used += IMAGES_H;

    // ===== 第三阶段：图片之后放第3-8点 =====
    for (const line of FOOTER_LINES) {
      const lineH = line.length > 60 ? FOOTER_PER * 2 : FOOTER_PER;
      if (used + lineH > PAGE_H) {
        out.push(cur);
        cur = this.makePage();
        used = 0;
      }
      used += lineH;
    }
    cur.showFooterNotice = true;
    out.push(cur);

    this.pages = out.map((p, i) => { p.index = i + 1; return p; });
  }

  private makePage(): RenderPage {
    return { index: 0, items: [], showDocumentHeader: false, showReferenceImages: false, showFooterNotice: false };
  }

  /* ---- 打印（复用屏幕CSS，不覆盖任何尺寸） ---- */
  print(): void {
    const allSheets = Array.from(this.host.nativeElement.querySelectorAll('.sheet')) as HTMLElement[];
    if (!allSheets.length) { alert('没有可打印的表单'); return; }

    let body = '';
    allSheets.forEach((s: HTMLElement) => {
      const c = s.cloneNode(true) as HTMLElement;
      c.querySelectorAll('.no-print').forEach(el => el.remove());
      c.style.zoom = '1';
      c.style.transform = 'none';
      body += '<div class="print-page">' + c.outerHTML + '</div>';
    });

    const componentStyles = Array.from(document.querySelectorAll('style'))
      .map(st => st.textContent || '').join('\n');

    const printCss = `
      @page{size:A4 portrait;margin:0}
      html,body{margin:0;padding:0;background:#fff}
      .no-print{display:none!important}
      .print-page{box-sizing:border-box;width:210mm;height:297mm;margin:0;padding:0;overflow:hidden;break-after:page;page-break-after:always;background:#fff}
      .print-page:last-child{break-after:auto;page-break-after:auto}
      .sheet{width:210mm!important;height:297mm!important;min-height:297mm!important;margin:0!important;padding:8mm 8mm 14mm!important;overflow:hidden!important;box-shadow:none!important;zoom:1!important;transform:none!important}
    `;

    const pw = window.open('', '_blank', 'width=900,height=700');
    if (!pw) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    pw.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>患者物品购买温馨提醒</title><style>' + componentStyles + '</style><style>' + printCss + '</style></head><body>' + body + '</body></html>');
    pw.document.close();

    this.prepareAndPrint(pw);
  }

  private async prepareAndPrint(pw: Window): Promise<void> {
    const doc = pw.document as any;
    if (doc.fonts?.ready) { await doc.fonts.ready; }
    await this.waitForImages(pw.document);
    await new Promise<void>(resolve => { pw.requestAnimationFrame(() => pw.requestAnimationFrame(() => resolve())); });
    this.validatePrintPages(pw);
    pw.focus(); pw.print();
    pw.addEventListener('afterprint', () => { try { pw.close(); } catch { /* ignore */ } }, { once: true });
  }

  private validatePrintPages(pw: Window): boolean {
    const pages = Array.from(pw.document.querySelectorAll<HTMLElement>('.print-page'));
    let ok = true;
    pages.forEach((page, i) => {
      const sheet = page.querySelector<HTMLElement>('.sheet');
      const content = page.querySelector<HTMLElement>('.sheet-content');
      const pn = page.querySelector<HTMLElement>('.sheet-pageno');
      if (!sheet || !pn) { console.error('第' + (i + 1) + '页结构不完整'); ok = false; return; }
      if (content && content.scrollHeight > content.clientHeight + 1) {
        console.error('第' + (i + 1) + '页正文溢出', content.scrollHeight - content.clientHeight); ok = false;
      }
      const sr = sheet.getBoundingClientRect();
      const pr = pn.getBoundingClientRect();
      if (pr.top < sr.top || pr.bottom > sr.bottom) { console.error('第' + (i + 1) + '页页码越界'); ok = false; }
      if (sheet.scrollHeight > sheet.clientHeight + 1) { console.warn('第' + (i + 1) + '页溢出', sheet.scrollHeight - sheet.clientHeight); ok = false; }
    });
    return ok;
  }

  private waitForImages(doc: Document): Promise<void> {
    const images = Array.from(doc.images);
    return Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>(resolve => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    })).then(() => undefined);
  }

  private persistSelection(): void {
    localStorage.setItem('wpgmForm.selectedIds', JSON.stringify(this.selectedItems.map(item => item.id)));
    this.paginate();
  }
}
