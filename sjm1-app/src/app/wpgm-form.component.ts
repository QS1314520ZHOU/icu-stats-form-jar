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

const INTRO_HTML = `<p>尊敬的病员家属：</p><p class="indent">您好！为了给患者提供一个安全舒适的就医环境，特此说明以下提醒事项，请您知晓，敬请配合！</p><p>1、重症医学科（ICU）实行24小时无陪护制度，每日探视时间为11:00—11:30，每位患者探视人数不超过2人，中途不交换家属，具体探视要求请参照《重症医学科探视制度》规定。</p><p>2、请按照以下物品清单为患者准备住院所需用物，为方便您购买，部分物品可参照以下图片。</p>`;

const TABLE_HEADER_HTML = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5pt;line-height:1.45"><thead><tr><th style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:9%">分类</th><th style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:18%">物品名称</th><th style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:11%">数量</th><th style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:30%">规格</th><th style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:32%">物品用途</th></tr></thead></table>`;

const IMAGES_HTML = `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4mm 6mm;margin:5mm 0 6mm"><figure style="margin:0"><div style="display:block;width:100%;height:34mm;background:#fff"></div><div style="margin-top:1.5mm;text-align:center;font-family:SimHei,sans-serif;font-size:10.5pt;font-weight:700">图</div></figure><figure style="margin:0"><div style="display:block;width:100%;height:34mm;background:#fff"></div><div style="margin-top:1.5mm;text-align:center;font-family:SimHei,sans-serif;font-size:10.5pt;font-weight:700">图</div></figure></div>`;

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

  // 缓存测量值
  private _pxPerMm = 0;
  private _rowHeightMm = 0;
  private _headerRowHeightMm = 0;
  private _introHeightMm = 0;
  private _imagesHeightMm = 0;
  private _footerLineHeightMm = 0;

  constructor(private host: ElementRef) {}

  ngOnInit(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('wpgmForm.selectedIds') || '[]') as string[];
      const selected = new Set(saved);
      this.items.forEach(item => item.selected = selected.has(item.id));
    } catch { /* ignore */ }
    // 延迟测量，等DOM就绪
    setTimeout(() => { this.measureHeights(); this.paginate(); }, 50);
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

  /* ---- 高度测量 ---- */
  private get pxPerMm(): number {
    if (!this._pxPerMm) {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;visibility:hidden;width:100mm';
      document.body.appendChild(div);
      this._pxPerMm = div.getBoundingClientRect().width / 100;
      document.body.removeChild(div);
    }
    return this._pxPerMm;
  }

  private mmToPx(mm: number): number { return mm * this.pxPerMm; }
  private pxToMm(px: number): number { return px / this.pxPerMm; }

  private measureBlock(innerHtml: string, extraCss: string = ''): number {
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;visibility:hidden;width:${this.mmToPx(194)}px;font-family:'SimSun','宋体',serif;font-size:11pt;line-height:1.75;${extraCss}`;
    div.innerHTML = innerHtml;
    document.body.appendChild(div);
    const h = div.getBoundingClientRect().height;
    document.body.removeChild(div);
    return this.pxToMm(h);
  }

  private measureHeights(): void {
    // 标题+第1-2点
    this._introHeightMm = this.measureBlock(
      INTRO_HTML,
      'font-size:11pt;line-height:1.75'
    ) + 10; // h1 title ~10mm

    // 表头
    this._headerRowHeightMm = this.measureBlock(
      TABLE_HEADER_HTML,
      'font-size:10.5pt;line-height:1.45'
    );

    // 数据行（用最长的规格行测量）
    const longest = this.items.reduce((a, b) =>
      (a.specification.length + a.purpose.length) > (b.specification.length + b.purpose.length) ? a : b
    );
    this._rowHeightMm = this.measureBlock(
      `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5pt;line-height:1.45"><tr><td style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:9%">分类</td><td style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:18%">${longest.name}</td><td style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:11%">${longest.quantity}</td><td style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:30%">${longest.specification}</td><td style="border:1px solid #000;padding:2.2mm 2mm;text-align:center;width:32%">${longest.purpose}</td></tr></table>`,
      'font-size:10.5pt;line-height:1.45'
    );

    // 图片区（两行三列，img高度34mm×2+间距+标题）
    this._imagesHeightMm = 34 * 2 + 4 + 3 + 5 + 6; // ~86mm

    // 底部提醒每行
    this._footerLineHeightMm = this.measureBlock(
      '<p>3、以上患者所需物品请家属自行准备，科室及工作人员不销售任何物品。</p>',
      'font-size:11pt;line-height:1.75'
    );
  }

  /* ---- 分页：三阶段（表格→图片→第3-8点） ---- */
  private paginate(): void {
    const items = this.selectedItems;
    const out: RenderPage[] = [];

    // 0项：1页无表格
    if (!items.length) {
      out.push({ index: 1, items: [], showDocumentHeader: true, showReferenceImages: true, showFooterNotice: true });
      this.pages = out;
      return;
    }

    const pageH = 275; // mm (297 - 8top - 14bottom)
    const introH = this._introHeightMm || 35;
    const thH = this._headerRowHeightMm || 8;
    const rowH = this._rowHeightMm || 7.5;
    const imagesH = this._imagesHeightMm || 86;
    const footerLineH = this._footerLineHeightMm || 8;

    const FOOTER_LINES = [
      '3、以上患者所需物品请家属自行准备，科室及工作人员不销售任何物品。',
      '4、患者身上不留现金、手机及其它贵重物品，若必须留时，请与医护人员当面交接。',
      '5、请注意维护公共环境，请勿在通道座椅上躺卧睡觉，同时请保管好个人财物。',
      '6、医院禁止吸烟及任何形式使用明火，通道电源插座禁止连接大功率电器，插座上不能有裸露的电源线，请及时将充电电源线取下。为了您和家人的安全，请重视消防安全！',
      '7、家属在外走廊等候期间，请不要大声喧哗，以免影响患者休息。',
      '8、住院期间如患者病情变化、转科或生活物品数量不足等情况，医护人员会电话通知您，请保持电话通畅，以便及时与您取得联系，如有需要请拨打科室电话：023-81915173。',
    ];

    // --- 第一阶段：分页表格行（不预留给图片和第3-8点） ---
    let currentPage = this.makePage();
    currentPage.showDocumentHeader = true;
    let usedH = introH + (items.length > 0 ? thH : 0);

    for (const item of items) {
      if (usedH + rowH > pageH) {
        out.push(currentPage);
        currentPage = this.makePage();
        usedH = thH; // 续页只有表头
      }
      currentPage.items.push(item);
      usedH += rowH;
    }

    // --- 第二阶段：全部表格行结束后放图片 ---
    if (usedH + imagesH > pageH) {
      out.push(currentPage);
      currentPage = this.makePage();
      usedH = 0;
    }
    currentPage.showReferenceImages = true;
    usedH += imagesH;

    // --- 第三阶段：图片之后放第3-8点 ---
    for (const line of FOOTER_LINES) {
      const lineH = line.length > 60 ? footerLineH * 2 : footerLineH;
      if (usedH + lineH > pageH) {
        out.push(currentPage);
        currentPage = this.makePage();
        usedH = 0;
      }
      usedH += lineH;
    }
    currentPage.showFooterNotice = true;
    out.push(currentPage);

    // 编号
    this.pages = out.map((p, i) => { p.index = i + 1; return p; });
  }

  private makePage(): RenderPage {
    return { index: 0, items: [], showDocumentHeader: false, showReferenceImages: false, showFooterNotice: false };
  }

  /* ---- 打印 ---- */
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
