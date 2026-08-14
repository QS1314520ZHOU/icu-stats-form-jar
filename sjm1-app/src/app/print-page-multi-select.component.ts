import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { normalizePrintPages, printPageSelectionLabel } from './form-print-pages.util';

@Component({
  standalone: false,
  selector: 'app-print-page-multi-select',
  templateUrl: './print-page-multi-select.component.html',
  styleUrls: ['./print-page-multi-select.component.css'],
})
export class PrintPageMultiSelectComponent {
  @Input() totalPages = 0;
  @Input() selectedPages: number[] = [];
  @Input() disabled = false;
  @Input() label = '打印页码：';

  @Output() selectedPagesChange = new EventEmitter<number[]>();

  open = false;

  constructor(private readonly elRef: ElementRef) {}

  get pageNumbers(): number[] {
    return Array.from({ length: Math.max(0, this.totalPages) }, (_, i) => i + 1);
  }

  get normalizedSelectedPages(): number[] {
    return normalizePrintPages(this.selectedPages, this.totalPages);
  }

  get allSelected(): boolean {
    return this.normalizedSelectedPages.length === 0;
  }

  get selectionText(): string {
    return printPageSelectionLabel(this.selectedPages, this.totalPages);
  }

  toggleAll(): void {
    this.selectedPagesChange.emit([]);
    this.open = false;
  }

  togglePage(pageNumber: number, checked: boolean): void {
    let current = this.normalizedSelectedPages;

    // 当前为空表示"全部"。用户从"全部"状态取消某一页时，先展开成全部页码再移除。
    if (current.length === 0) {
      current = [...this.pageNumbers];
    }

    const next = checked
      ? [...current, pageNumber]
      : current.filter(page => page !== pageNumber);

    const normalized = normalizePrintPages(next, this.totalPages);

    // 所有页都被选中时，归一化为 [] 表示全部。
    if (this.totalPages > 0 && normalized.length === this.totalPages) {
      this.selectedPagesChange.emit([]);
      return;
    }

    // 不允许取消到零页。
    if (normalized.length === 0) {
      return;
    }

    this.selectedPagesChange.emit(normalized);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.elRef.nativeElement.contains(event.target)) {
      this.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.open = false;
  }
}
