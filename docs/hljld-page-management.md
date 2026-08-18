# ICU 护理记录单 PDF 分页方案

## 一、数据库设计

### 1.1 页码管理表 `hljld_page_index`

```javascript
// MongoDB 集合结构
{
  _id: ObjectId,
  pid: "患者ID",                    // 关联患者
  admissionTime: ISODate("入科时间"), // 用于定位
  
  // 页码索引 - 按日期存储每天的起始页码
  dailyPages: [
    {
      date: "2026-08-18",          // 护理日日期
      startPageNo: 1,              // 该天起始页码
      pageCount: 3,                // 该天总页数
      endPageNo: 3                 // 该天结束页码 = startPageNo + pageCount - 1
    },
    {
      date: "2026-08-19",
      startPageNo: 4,
      pageCount: 2,
      endPageNo: 5
    }
  ],
  
  totalPages: 5,                   // 总页数
  lastUpdated: ISODate(),          // 最后更新时间
  version: 1                       // 版本号，用于并发控制
}
```

### 1.2 PDF 缓存表 `hljld_pdf_cache`

```javascript
{
  _id: ObjectId,
  pid: "患者ID",
  date: "2026-08-18",              // 护理日日期
  pdfData: BinData,                // PDF 二进制数据
  pageCount: 3,                    // 该 PDF 页数
  contentHash: "abc123",           // 内容哈希，用于判断是否需要重新生成
  generatedAt: ISODate(),
  expiresAt: ISODate()             // 过期时间
}
```

## 二、后端实现

### 2.1 Maven 依赖

```xml
<!-- pom.xml 添加 PDFBox -->
<dependency>
    <groupId>org.apache.pdfbox</groupId>
    <artifactId>pdfbox</artifactId>
    <version>2.0.31</version>
</dependency>

<!-- 中文字体支持 -->
<dependency>
    <groupId>com.github.jai-imageio</groupId>
    <artifactId>jai-imageio-core</artifactId>
    <version>1.4.0</version>
</dependency>
```

### 2.2 核心服务类

```java
// HljldPdfService.java
@Service
public class HljldPdfService {
    
    private final MongoTemplate mongoTemplate;
    private final GridFsTemplate gridFsTemplate;
    
    // A4 横向尺寸（像素，72 DPI）
    private static final float PAGE_WIDTH = 841.89f;  // 297mm
    private static final float PAGE_HEIGHT = 595.28f; // 210mm
    
    // 边距
    private static final float MARGIN_TOP = 28.35f;   // 10mm
    private static final float MARGIN_BOTTOM = 28.35f;
    private static final float MARGIN_LEFT = 19.84f;  // 7mm
    private static final float MARGIN_RIGHT = 19.84f;
    
    // 表格区域
    private static final float TABLE_TOP = 120f;      // 表头下方
    private static final float TABLE_BOTTOM = PAGE_HEIGHT - 80f; // 页码上方
    private static final float ROW_HEIGHT = 20f;      // 默认行高
    
    @Autowired
    public HljldPdfService(MongoTemplate mongoTemplate, GridFsTemplate gridFsTemplate) {
        this.mongoTemplate = mongoTemplate;
        this.gridFsTemplate = gridFsTemplate;
    }
    
    /**
     * 生成指定日期的护理记录 PDF
     */
    public byte[] generateDailyPdf(String pid, String date) {
        // 1. 查询当天数据
        HljldViewModel vm = loadViewModel(pid, date);
        if (vm == null || vm.getTimeline().isEmpty()) {
            return generateEmptyPagePdf(pid, date);
        }
        
        // 2. 查询页码信息
        PageIndexInfo pageIndex = getPageIndex(pid, date);
        
        // 3. 创建 PDF 文档
        try (PDDocument doc = new PDDocument()) {
            // 4. 分页渲染
            List<List<HljldTimelineItem>> pages = paginateData(vm.getTimeline());
            
            for (int i = 0; i < pages.size(); i++) {
                PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, PAGE_HEIGHT));
                doc.addPage(page);
                
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    // 渲染固定部分
                    renderHeader(cs, vm.getPatient());
                    renderTableHeader(cs);
                    renderFooter(cs, pageIndex.getStartPageNo() + i);
                    
                    // 渲染动态数据
                    renderTableData(cs, pages.get(i));
                }
            }
            
            // 5. 转换为字节数组
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }
    
    /**
     * 渲染页面头部（标题 + 患者信息）
     */
    private void renderHeader(PDPageContentStream cs, PatientContext patient) throws IOException {
        // 加载中文字体
        PDType0Font font = loadChineseFont();
        
        // 标题
        cs.beginText();
        cs.setFont(font, 18);
        cs.newLineAtOffset(PAGE_WIDTH / 2 - 100, PAGE_HEIGHT - MARGIN_TOP - 20);
        cs.showText("重钢总医院重症医学科护理记录单");
        cs.endText();
        
        // 患者信息行
        cs.beginText();
        cs.setFont(font, 10);
        cs.newLineAtOffset(MARGIN_LEFT, PAGE_HEIGHT - MARGIN_TOP - 50);
        cs.showText(String.format("床号：%s  姓名：%s  住院号：%s  性别：%s  年龄：%s  诊断：%s",
            patient.getBedNo(), patient.getName(), patient.getMrn(),
            patient.getSex(), patient.getAge(), patient.getDiagnosis()));
        cs.endText();
    }
    
    /**
     * 渲染表头（固定）
     */
    private void renderTableHeader(PDPageContentStream cs) throws IOException {
        PDType0Font font = loadChineseFont();
        float y = PAGE_HEIGHT - MARGIN_TOP - 70;
        
        // 第一行表头
        String[] headers1 = {"日期时间", "药物治疗", "", "", "胃肠摄入", "", "", 
                            "尿量", "净超滤量", "排出物", "", "引流液", "",
                            "检查", "治疗", "基础护理", "健康教育", "护理记录", "签名"};
        float[] colWidths = {60, 40, 30, 30, 40, 30, 30, 30, 40, 30, 30, 30, 30, 
                            35, 35, 35, 35, 120, 40};
        
        // 绘制表头背景
        cs.setNonStrokingColor(240, 240, 240);
        cs.addRect(MARGIN_LEFT, y - 20, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, 40);
        cs.fill();
        
        // 绘制表头文字
        cs.setNonStrokingColor(0, 0, 0);
        cs.setFont(font, 8);
        
        float x = MARGIN_LEFT;
        for (int i = 0; i < headers1.length; i++) {
            cs.beginText();
            cs.newLineAtOffset(x + 2, y);
            cs.showText(headers1[i]);
            cs.endText();
            x += colWidths[i];
        }
        
        // 绘制边框
        cs.setStrokingColor(0, 0, 0);
        cs.setLineWidth(0.5f);
        cs.addRect(MARGIN_LEFT, y - 20, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, 40);
        cs.stroke();
    }
    
    /**
     * 渲染表格数据（动态）
     */
    private void renderTableData(PDPageContentStream cs, List<HljldTimelineItem> items) 
            throws IOException {
        PDType0Font font = loadChineseFont();
        float y = TABLE_TOP;
        
        for (HljldTimelineItem item : items) {
            if (y < TABLE_BOTTOM) {
                // 需要换页（这里简化处理，实际需要更复杂的跨页逻辑）
                break;
            }
            
            if (item.getKind().equals("time-group")) {
                for (HljldDisplayRow row : item.getGroup().getRows()) {
                    renderDataRow(cs, font, y, row);
                    y -= ROW_HEIGHT;
                }
            } else if (item.getKind().contains("summary")) {
                renderSummaryRow(cs, font, y, item.getSummary());
                y -= ROW_HEIGHT * 2;
            }
        }
    }
    
    /**
     * 渲染单行数据
     */
    private void renderDataRow(PDPageContentStream cs, PDType0Font font, float y, 
            HljldDisplayRow row) throws IOException {
        cs.setFont(font, 7);
        
        float[] colWidths = {60, 40, 30, 30, 40, 30, 30, 30, 40, 30, 30, 30, 30, 
                            35, 35, 35, 35, 120, 40};
        float x = MARGIN_LEFT;
        
        // 时间
        cs.beginText();
        cs.newLineAtOffset(x + 2, y);
        cs.showText(row.getTimeText() != null ? row.getTimeText() : "");
        cs.endText();
        x += colWidths[0];
        
        // 药物治疗
        cs.beginText();
        cs.newLineAtOffset(x + 2, y);
        cs.showText(row.getMedication() != null ? row.getMedication().getName() : "");
        cs.endText();
        x += colWidths[1];
        
        // ... 其他列类似
        
        // 绘制行边框
        cs.setStrokingColor(200, 200, 200);
        cs.addRect(MARGIN_LEFT, y - 5, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, ROW_HEIGHT);
        cs.stroke();
    }
    
    /**
     * 渲染页脚（备注 + 页码）
     */
    private void renderFooter(PDPageContentStream cs, int pageNo) throws IOException {
        PDType0Font font = loadChineseFont();
        
        // 备注区域
        cs.beginText();
        cs.setFont(font, 9);
        cs.newLineAtOffset(MARGIN_LEFT, 60);
        cs.showText("备注：");
        cs.endText();
        
        // 页码
        cs.beginText();
        cs.setFont(font, 10);
        cs.newLineAtOffset(PAGE_WIDTH / 2 - 20, 30);
        cs.showText(String.format("第 %d 页", pageNo));
        cs.endText();
    }
    
    /**
     * 数据分页逻辑
     */
    private List<List<HljldTimelineItem>> paginateData(List<HljldTimelineItem> timeline) {
        List<List<HljldTimelineItem>> pages = new ArrayList<>();
        List<HljldTimelineItem> currentPage = new ArrayList<>();
        float currentHeight = 0;
        float maxHeight = TABLE_BOTTOM - TABLE_TOP;
        
        for (HljldTimelineItem item : timeline) {
            float itemHeight = estimateItemHeight(item);
            
            if (currentHeight + itemHeight > maxHeight && !currentPage.isEmpty()) {
                pages.add(currentPage);
                currentPage = new ArrayList<>();
                currentHeight = 0;
            }
            
            currentPage.add(item);
            currentHeight += itemHeight;
        }
        
        if (!currentPage.isEmpty()) {
            pages.add(currentPage);
        }
        
        return pages;
    }
    
    /**
     * 估算数据项高度
     */
    private float estimateItemHeight(HljldTimelineItem item) {
        if (item.getKind().equals("time-group")) {
            return item.getGroup().getRows().size() * ROW_HEIGHT;
        } else if (item.getKind().contains("summary")) {
            return ROW_HEIGHT * 3; // 小结占更多空间
        }
        return ROW_HEIGHT;
    }
    
    /**
     * 加载中文字体
     */
    private PDType0Font loadChineseFont() throws IOException {
        // 从 resources/fonts 加载宋体
        InputStream fontStream = getClass().getResourceAsStream("/fonts/simsun.ttf");
        return PDType0Font.load(new PDDocument(), fontStream);
    }
}
```

### 2.3 页码管理服务

```java
// HljldPageIndexService.java
@Service
public class HljldPageIndexService {
    
    private final MongoTemplate mongoTemplate;
    
    @Autowired
    public HljldPageIndexService(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }
    
    /**
     * 获取指定日期的起始页码
     */
    public int getStartPageNo(String pid, String date) {
        Query query = new Query(Criteria.where("pid").is(pid));
        HljldPageIndex index = mongoTemplate.findOne(query, HljldPageIndex.class);
        
        if (index == null) {
            return 1; // 默认从1开始
        }
        
        return index.getDailyPages().stream()
            .filter(d -> d.getDate().equals(date))
            .map(DailyPageInfo::getStartPageNo)
            .findFirst()
            .orElse(1);
    }
    
    /**
     * 重新计算并更新页码（纠正功能）
     */
    public void recalculatePageIndexes(String pid) {
        // 1. 查询患者入科和出科时间
        PatientContext patient = getPatientContext(pid);
        Date admissionTime = patient.getAdmissionTime();
        Date dischargeTime = patient.getDischargeTime();
        
        // 2. 确定计算范围
        Date startDate = startOfNursingDay(admissionTime);
        Date endDate = dischargeTime != null ? 
            endOfNursingDay(dischargeTime) : 
            endOfNursingDay(new Date());
        
        // 3. 分批计算（每次处理7天）
        List<DailyPageInfo> dailyPages = new ArrayList<>();
        int currentPageNo = 1;
        
        Calendar cal = Calendar.getInstance();
        cal.setTime(startDate);
        
        while (!cal.getTime().after(endDate)) {
            Date batchEnd = addDays(cal.getTime(), 7);
            if (batchEnd.after(endDate)) {
                batchEnd = endDate;
            }
            
            // 处理这一批
            while (!cal.getTime().after(batchEnd)) {
                String dateStr = formatDate(cal.getTime());
                int pageCount = calculatePageCount(pid, dateStr);
                
                DailyPageInfo info = new DailyPageInfo();
                info.setDate(dateStr);
                info.setStartPageNo(currentPageNo);
                info.setPageCount(pageCount);
                info.setEndPageNo(currentPageNo + pageCount - 1);
                
                dailyPages.add(info);
                currentPageNo += pageCount;
                
                cal.add(Calendar.DAY_OF_MONTH, 1);
            }
            
            // 更新进度（可选）
            updateProgress(pid, cal.getTime(), endDate);
        }
        
        // 4. 保存到数据库
        savePageIndex(pid, dailyPages, currentPageNo - 1);
    }
    
    /**
     * 计算某天的页数
     */
    private int calculatePageCount(String pid, String date) {
        // 加载当天数据
        HljldViewModel vm = loadViewModel(pid, date);
        if (vm == null || vm.getTimeline().isEmpty()) {
            return 1; // 空白页
        }
        
        // 估算页数（基于数据量）
        float totalHeight = 0;
        for (HljldTimelineItem item : vm.getTimeline()) {
            totalHeight += estimateItemHeight(item);
        }
        
        float pageHeight = TABLE_BOTTOM - TABLE_TOP;
        return (int) Math.ceil(totalHeight / pageHeight);
    }
    
    /**
     * 保存页码索引
     */
    private void savePageIndex(String pid, List<DailyPageInfo> dailyPages, int totalPages) {
        Query query = new Query(Criteria.where("pid").is(pid));
        
        HljldPageIndex index = mongoTemplate.findOne(query, HljldPageIndex.class);
        if (index == null) {
            index = new HljldPageIndex();
            index.setPid(pid);
            index.setAdmissionTime(getPatientContext(pid).getAdmissionTime());
        }
        
        index.setDailyPages(dailyPages);
        index.setTotalPages(totalPages);
        index.setLastUpdated(new Date());
        index.setVersion(index.getVersion() + 1);
        
        mongoTemplate.save(index);
    }
    
    /**
     * 分批处理长时间住院患者
     */
    private void processLongStayPatient(String pid, Date startDate, Date endDate) {
        // 计算总天数
        long days = daysBetween(startDate, endDate);
        
        if (days <= 7) {
            // 短期住院，一次性处理
            recalculatePageIndexes(pid);
        } else if (days <= 30) {
            // 中期住院，分周处理
            for (Date start = startDate; start.before(endDate); start = addDays(start, 7)) {
                Date end = addDays(start, 7);
                if (end.after(endDate)) end = endDate;
                processBatch(pid, start, end);
            }
        } else {
            // 长期住院，分月处理
            for (Date start = startDate; start.before(endDate); start = addDays(start, 30)) {
                Date end = addDays(start, 30);
                if (end.after(endDate)) end = endDate;
                processBatch(pid, start, end);
                
                // 避免阻塞，可以在这里添加异步处理或进度反馈
            }
        }
    }
}
```

### 2.4 Controller 接口

```java
// HljldPdfController.java
@RestController
@RequestMapping("/api/v1/icu/hljld")
public class HljldPdfController {
    
    private final HljldPdfService pdfService;
    private final HljldPageIndexService pageIndexService;
    
    @Autowired
    public HljldPdfController(HljldPdfService pdfService, HljldPageIndexService pageIndexService) {
        this.pdfService = pdfService;
        this.pageIndexService = pageIndexService;
    }
    
    /**
     * 获取指定日期的 PDF
     */
    @GetMapping("/pdf/{pid}/{date}")
    public ResponseEntity<byte[]> getPdf(@PathVariable String pid, @PathVariable String date) {
        byte[] pdfData = pdfService.generateDailyPdf(pid, date);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("filename", 
            String.format("护理记录_%s_%s.pdf", pid, date));
        
        return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
    }
    
    /**
     * 获取页码信息
     */
    @GetMapping("/page-index/{pid}")
    public PageIndexInfo getPageIndex(@PathVariable String pid, 
                                      @RequestParam String date) {
        int startPageNo = pageIndexService.getStartPageNo(pid, date);
        int pageCount = pageIndexService.getPageCount(pid, date);
        
        return new PageIndexInfo(startPageNo, pageCount);
    }
    
    /**
     * 重新计算页码（纠正功能）
     */
    @PostMapping("/recalculate/{pid}")
    public ResponseEntity<Void> recalculatePageIndexes(@PathVariable String pid) {
        pageIndexService.recalculatePageIndexes(pid);
        return ResponseEntity.ok().build();
    }
    
    /**
     * 批量生成 PDF（一键打印全部）
     */
    @GetMapping("/pdf-all/{pid}")
    public ResponseEntity<byte[]> getAllPdfs(@PathVariable String pid) {
        byte[] pdfData = pdfService.generateAllPagesPdf(pid);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("filename", 
            String.format("护理记录_全部_%s.pdf", pid));
        
        return new ResponseEntity<>(pdfData, headers, HttpStatus.OK);
    }
}
```

## 三、前端实现

### 3.1 服务层

```typescript
// hljld-pdf.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PageIndexInfo {
  startPageNo: number;
  pageCount: number;
}

@Injectable({ providedIn: 'root' })
export class HljldPdfService {
  
  private readonly baseUrl = '/api/v1/icu/hljld';
  
  constructor(private http: HttpClient) {}
  
  /**
   * 获取指定日期的 PDF URL
   */
  getPdfUrl(pid: string, date: string): string {
    return `${this.baseUrl}/pdf/${pid}/${date}`;
  }
  
  /**
   * 获取页码信息
   */
  getPageIndex(pid: string, date: string): Observable<PageIndexInfo> {
    return this.http.get<PageIndexInfo>(`${this.baseUrl}/page-index/${pid}`, {
      params: { date }
    });
  }
  
  /**
   * 重新计算页码
   */
  recalculatePageIndexes(pid: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/recalculate/${pid}`, {});
  }
  
  /**
   * 获取全部记录的 PDF URL
   */
  getAllPdfsUrl(pid: string): string {
    return `${this.baseUrl}/pdf-all/${pid}`;
  }
}
```

### 3.2 组件实现

```typescript
// hljld-form.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HljldPdfService, PageIndexInfo } from './hljld-pdf.service';
import { HostPatientService } from './services/host-patient.service';

@Component({
  selector: 'app-hljld-form',
  templateUrl: './hljld-form.component.html',
  styleUrls: ['./hljld-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HljldFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  
  pid = '';
  selectedDate = new Date();
  dateInput = this.formatDate(this.selectedDate);
  
  // PDF 相关
  pdfUrl = '';
  pageIndex: PageIndexInfo = { startPageNo: 1, pageCount: 0 };
  pageOptions: number[] = [];  // 页码下拉选项
  selectedPageNo = 1;
  
  // 状态
  loading = false;
  recalculating = false;
  
  constructor(
    private pdfService: HljldPdfService,
    private hostPatient: HostPatientService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit(): void {
    // 监听患者变化
    this.hostPatient.patient$.pipe(takeUntil(this.destroy$)).subscribe(patient => {
      if (patient) {
        this.pid = patient.pid;
        this.loadPdf();
      }
    });
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  /**
   * 加载 PDF
   */
  loadPdf(): void {
    if (!this.pid) return;
    
    this.loading = true;
    this.cdr.markForCheck();
    
    const dateStr = this.formatDate(this.selectedDate);
    
    // 获取页码信息
    this.pdfService.getPageIndex(this.pid, dateStr).subscribe({
      next: (info) => {
        this.pageIndex = info;
        this.updatePageOptions();
        this.pdfUrl = this.pdfService.getPdfUrl(this.pid, dateStr);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }
  
  /**
   * 更新页码选项
   */
  private updatePageOptions(): void {
    this.pageOptions = [];
    for (let i = 0; i < this.pageIndex.pageCount; i++) {
      this.pageOptions.push(this.pageIndex.startPageNo + i);
    }
    this.selectedPageNo = this.pageOptions[0] || 1;
  }
  
  /**
   * 日期变化
   */
  onDateChange(dateStr: string): void {
    this.selectedDate = new Date(dateStr);
    this.loadPdf();
  }
  
  /**
   * 选择页码
   */
  onPageSelect(pageNo: number): void {
    this.selectedPageNo = pageNo;
    // 滚动到指定页码（PDF viewer 支持）
    this.scrollToPage(pageNo - this.pageIndex.startPageNo + 1);
  }
  
  /**
   * 滚动到指定页
   */
  private scrollToPage(pageNumber: number): void {
    const iframe = document.querySelector('.pdf-viewer') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      // PDF.js 支持的页码参数
      iframe.contentWindow.location.hash = `#page=${pageNumber}`;
    }
  }
  
  /**
   * 纠正页码
   */
  recalculatePageIndexes(): void {
    if (!this.pid || this.recalculating) return;
    
    const confirmed = confirm('确定要重新计算页码吗？\n\n这将根据入科时间到当前时间的所有数据重新计算，可能需要一些时间。');
    if (!confirmed) return;
    
    this.recalculating = true;
    this.cdr.markForCheck();
    
    this.pdfService.recalculatePageIndexes(this.pid).subscribe({
      next: () => {
        alert('页码重新计算完成！');
        this.recalculating = false;
        this.loadPdf(); // 重新加载
      },
      error: (err) => {
        alert('页码计算失败：' + (err.message || '请重试'));
        this.recalculating = false;
        this.cdr.markForCheck();
      }
    });
  }
  
  /**
   * 打印全部
   */
  printAll(): void {
    if (!this.pid) return;
    window.open(this.pdfService.getAllPdfsUrl(this.pid), '_blank');
  }
  
  /**
   * 打印当前页
   */
  printCurrentPage(): void {
    const iframe = document.querySelector('.pdf-viewer') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  }
  
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
```

### 3.3 模板

```html
<!-- hljld-form.component.html -->
<section class="hljld-shell">
  <!-- 工具栏 -->
  <header class="toolbar">
    <!-- 日期选择 -->
    <div class="date-tools">
      <button (click)="previousDay()" class="nav-arrow">‹</button>
      <input type="date" [value]="dateInput" (change)="onDateChange($any($event.target).value)" />
      <button (click)="nextDay()" class="nav-arrow">›</button>
      <button (click)="today()" class="today-button">今天</button>
    </div>
    
    <!-- 页码选择 -->
    <div class="page-tools" *ngIf="pageOptions.length > 0">
      <label>页码：</label>
      <select [ngModel]="selectedPageNo" (ngModelChange)="onPageSelect($event)">
        <option *ngFor="let pageNo of pageOptions" [value]="pageNo">
          第 {{ pageNo }} 页
        </option>
      </select>
      <span class="page-info">共 {{ pageIndex.pageCount }} 页</span>
    </div>
    
    <div class="toolbar-spacer"></div>
    
    <!-- 操作按钮 -->
    <div class="action-tools">
      <button 
        (click)="recalculatePageIndexes()" 
        [disabled]="recalculating"
        class="recalculate-button"
        title="重新计算页码"
      >
        {{ recalculating ? '计算中...' : '纠正页码' }}
      </button>
      
      <button (click)="printCurrentPage()" class="print-button">
        打印当前页
      </button>
      
      <button (click)="printAll()" class="print-button print-all-button">
        打印全部
      </button>
    </div>
  </header>
  
  <!-- PDF 查看器 -->
  <div class="pdf-container" *ngIf="pdfUrl; else noPdf">
    <div *ngIf="loading" class="loading-overlay">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>
    
    <iframe
      class="pdf-viewer"
      [src]="pdfUrl"
      frameborder="0"
      width="100%"
      height="100%"
    ></iframe>
  </div>
  
  <!-- 无数据状态 -->
  <ng-template #noPdf>
    <div class="empty-state" *ngIf="!loading">
      <p *ngIf="!pid">等待患者信息...</p>
      <p *ngIf="pid">暂无护理记录</p>
    </div>
  </ng-template>
</section>
```

### 3.4 样式

```css
/* hljld-form.component.css */
.hljld-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  z-index: 10;
}

.date-tools,
.page-tools,
.action-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-spacer {
  flex: 1;
}

.nav-arrow {
  width: 32px;
  height: 32px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 18px;
}

.nav-arrow:hover:not(:disabled) {
  background: #f0f0f0;
}

.today-button {
  padding: 6px 12px;
  border: 1px solid #1976d2;
  border-radius: 4px;
  background: #fff;
  color: #1976d2;
  cursor: pointer;
}

.today-button:hover {
  background: #e3f2fd;
}

select {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
}

.page-info {
  color: #666;
  font-size: 14px;
}

.recalculate-button {
  padding: 6px 12px;
  border: 1px solid #ff9800;
  border-radius: 4px;
  background: #fff;
  color: #ff9800;
  cursor: pointer;
}

.recalculate-button:hover:not(:disabled) {
  background: #fff3e0;
}

.recalculate-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.print-button {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  background: #1976d2;
  color: #fff;
  cursor: pointer;
}

.print-button:hover {
  background: #1565c0;
}

.print-all-button {
  background: #388e3c;
}

.print-all-button:hover {
  background: #2e7d32;
}

.pdf-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.pdf-viewer {
  width: 100%;
  height: 100%;
  border: none;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.9);
  z-index: 5;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #ddd;
  border-top-color: #1976d2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
}

@media print {
  .toolbar {
    display: none;
  }
  
  .pdf-container {
    position: static;
  }
}
```

## 四、字体配置

### 4.1 添加中文字体

```
src/main/resources/
└── fonts/
    └── simsun.ttf  // 宋体字体文件
```

### 4.2 字体加载配置

```java
// FontConfig.java
@Configuration
public class FontConfig {
    
    @Bean
    public PDType0Font chineseFont() throws IOException {
        InputStream fontStream = getClass().getResourceAsStream("/fonts/simsun.ttf");
        return PDType0Font.load(new PDDocument(), fontStream);
    }
}
```

## 五、部署注意事项

1. **字体文件**：确保 `simsun.ttf` 在 `src/main/resources/fonts/` 目录下
2. **MongoDB 索引**：为 `hljld_page_index` 集合的 `pid` 字段创建索引
3. **缓存策略**：PDF 缓存建议设置 24 小时过期
4. **并发控制**：页码计算使用版本号避免并发冲突

## 六、优化建议

1. **异步生成**：大量数据时使用异步任务生成 PDF
2. **增量更新**：只重新生成有数据变化的日期
3. **预生成**：在每日凌晨预生成当天的 PDF
4. **CDN 加速**：将生成的 PDF 存储到 CDN
