import { Component, OnInit } from '@angular/core';

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

  ngOnInit(): void {
    // 仅记住项目勾选，不保存患者信息；如不需要记忆可删除这段。
    try {
      const saved = JSON.parse(localStorage.getItem('wpgmForm.selectedIds') || '[]') as string[];
      const selected = new Set(saved);
      this.items.forEach(item => item.selected = selected.has(item.id));
    } catch { /* 忽略损坏的本地缓存 */ }
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

  print(): void {
    if (!this.selectedCount) { alert('请先选择需要展示和打印的物品'); return; }
    window.print();
  }

  private persistSelection(): void {
    localStorage.setItem('wpgmForm.selectedIds', JSON.stringify(this.selectedItems.map(item => item.id)));
  }
}
