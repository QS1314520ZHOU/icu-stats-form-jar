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
  showHeaderNotice: boolean;
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
    } catch { /* 忽略损坏的本地缓存 */ }
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

  /* ---- 分页 ---- */
  private paginate(): void {
    const items = this.selectedItems;

    // 0项时仍然生成1页：标题+第1-2点+图片+第3-8点（无表格）
    if (!items.length) {
      this.pages = [{ index: 1, items: [], showHeaderNotice: true, showReferenceImages: true, showFooterNotice: true }];
      return;
    }

    const PAGE1_ITEMS = 14;   // 首页含标题/提示/图片/底部提醒
    const PAGE2_ITEMS = 14;   // 第2页含图片
    const PAGE_MID_ITEMS = 28; // 中间纯表格页
    const PAGE_LAST_ITEMS = 22; // 末页含底部提醒

    const total = items.length;
    const out: RenderPage[] = [];

    if (total <= PAGE1_ITEMS) {
      out.push({ index: 1, items: [...items], showHeaderNotice: true, showReferenceImages: true, showFooterNotice: true });
    } else if (total <= PAGE1_ITEMS + PAGE_LAST_ITEMS) {
      out.push({ index: 1, items: items.slice(0, PAGE1_ITEMS), showHeaderNotice: true, showReferenceImages: true, showFooterNotice: false });
      out.push({ index: 2, items: items.slice(PAGE1_ITEMS), showHeaderNotice: false, showReferenceImages: false, showFooterNotice: true });
    } else {
      out.push({ index: 1, items: items.slice(0, PAGE1_ITEMS), showHeaderNotice: true, showReferenceImages: false, showFooterNotice: false });
      out.push({ index: 2, items: items.slice(PAGE1_ITEMS, PAGE1_ITEMS + PAGE2_ITEMS), showHeaderNotice: false, showReferenceImages: true, showFooterNotice: false });
      const rest = items.slice(PAGE1_ITEMS + PAGE2_ITEMS);
      if (rest.length <= PAGE_LAST_ITEMS) {
        out.push({ index: 3, items: rest, showHeaderNotice: false, showReferenceImages: false, showFooterNotice: true });
      } else {
        out.push({ index: 3, items: rest.slice(0, PAGE_MID_ITEMS), showHeaderNotice: false, showReferenceImages: false, showFooterNotice: false });
        out.push({ index: 4, items: rest.slice(PAGE_MID_ITEMS), showHeaderNotice: false, showReferenceImages: false, showFooterNotice: true });
      }
    }

    this.pages = out;
  }

  /* ---- 打印（参考health-education实现） ---- */
  print(): void {
    const allSheets = Array.from(this.host.nativeElement.querySelectorAll('.sheet')) as HTMLElement[];
    if (!allSheets.length) { alert('没有可打印的表单'); return; }

    let body = '';
    allSheets.forEach((s: HTMLElement) => {
      const c = s.cloneNode(true) as HTMLElement;
      c.querySelectorAll('.no-print').forEach(el => el.remove());
      body += '<section class="print-page">' + c.outerHTML + '</section>';
    });

    const css = `
      @page{size:A4 portrait;margin:0}
      html,body{margin:0;padding:0;background:#fff}
      .print-page{box-sizing:border-box;width:210mm;height:297mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
      .print-page:last-child{page-break-after:auto;break-after:auto}
      .sheet{box-sizing:border-box;position:relative;width:210mm;height:297mm;margin:0;padding:8mm 8mm 14mm;box-shadow:none;background:#fff;color:#000;overflow:hidden}
      h1{margin:0 0 2mm;text-align:center;font-family:SimHei,'黑体',sans-serif;font-size:20pt;line-height:1.35}
      .notice-copy p{margin:1mm 0;text-align:justify;font-family:'SimSun','宋体',serif}
      .notice-copy .indent{text-indent:2em}
      .paper-table{width:100%;margin:4mm 0;border-collapse:collapse;table-layout:fixed;font-size:9.5pt;line-height:1.45;font-family:'SimSun','宋体',serif}
      .paper-table th,.paper-table td{border:1px solid #000;padding:1.6mm 1.5mm;text-align:center;vertical-align:middle;overflow-wrap:anywhere}
      .paper-table th{font-family:SimHei,'黑体',sans-serif;font-weight:700}
      .paper-table thead{display:table-header-group}
      .paper-table tr{break-inside:avoid;page-break-inside:avoid}
      .paper-table .category{font-weight:700}
      .category-column{width:9%}.name-column{width:18%}.quantity-column{width:11%}.spec-column{width:30%}.purpose-column{width:32%}
      .reference-images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm 5mm;margin:4mm 0 5mm;break-inside:avoid;page-break-inside:avoid}
      .reference-image-card{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0;margin:0;break-inside:avoid;page-break-inside:avoid}
      .reference-image-card img{display:block;width:100%;height:31mm;object-fit:contain;background:#fff}
      .reference-image-card figcaption{margin-top:1.5mm;text-align:center;font-family:SimHei,"黑体",sans-serif;font-size:9.5pt;font-weight:700;line-height:1.25}
      .footer-copy{margin-top:4mm}.footer-copy p{break-inside:avoid}
      .no-print{display:none!important}
      .sheet-pageno{position:absolute;left:8mm;right:8mm;bottom:5mm;margin:0;text-align:center;font-family:'SimSun','宋体',serif;font-size:12pt;font-weight:400;line-height:1;color:#000;white-space:nowrap}
    `;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('打印窗口被拦截，请允许弹出窗口'); return; }
    win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + body + '</body></html>');
    win.document.close();

    const doPrint = () => {
      const sheets = win!.document.querySelectorAll<HTMLElement>('.sheet');
      sheets.forEach(sh => { if (sh.scrollHeight > sh.clientHeight + 1) console.warn('Overflow:', sh.scrollHeight - sh.clientHeight); });
      win!.focus(); win!.print();
    };

    const ready = () => {
      const doc = win!.document as any;
      const run = () => {
        this.waitForImages(win!.document).then(() => {
          if (doc.fonts?.ready) {
            doc.fonts.ready.then(() => { requestAnimationFrame(() => requestAnimationFrame(doPrint)); });
          } else {
            requestAnimationFrame(() => requestAnimationFrame(doPrint));
          }
        });
      };
      run();
    };

    win.addEventListener('afterprint', () => { try { win.close(); } catch(e) { /* ignore */ } });
    if ((win.document as any).readyState === 'complete') ready();
    else win.addEventListener('load', ready);
  }

  private waitForImages(doc: Document): Promise<void> {
    const images = Array.from(doc.images);
    return Promise.all(images.map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    })).then(() => undefined);
  }

  private persistSelection(): void {
    localStorage.setItem('wpgmForm.selectedIds', JSON.stringify(this.selectedItems.map(item => item.id)));
    this.paginate();
  }
}
