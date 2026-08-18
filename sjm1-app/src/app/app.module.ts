import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { App } from './app';
import { Sjm1VeinMaintenanceComponent } from './sjm1-vein-maintenance.component';
import { SjmCrrtVeinMaintenanceComponent } from './sjm-crrt-vein-maintenance.component';
import { YdwzlTemperatureComponent } from './ydwzl-temperature.component';
import { ToleranceScoreComponent } from './tolerance-score.component';
import { CommitSuicideScoreComponent } from './commit-suicide-score.component';
import { IadScoreComponent } from './iad-score.component';
import { BaetheiScoreComponent } from './baethei-score.component';
import { PatientFallDangerComponent } from './patient-fall-danger.component';
import { HealthEducationComponent } from './health-education.component';
import { WpgmFormComponent } from './wpgm-form.component';
import { EcmoRecordComponent } from './ecmo-record.component';
import { TransfusionRecordComponent } from './transfusion-record.component';
import { PiccoRecordComponent } from './picco-record.component';
import { IabpRecordComponent } from './iabp-record.component';
import { TemperatureRecordComponent } from './temperature-record.component';
import { BradenFormComponent } from './braden-form.component';
import { CrrtRecordComponent } from './crrt-record.component';
import { CrrtOrderFormComponent } from './crrt-order-form.component';
import { HljldFormComponent } from './hljld-form.component';
import { HljldFormService } from './hljld-form.service';
import { HljldPdfService } from './hljld-pdf.service';
import { DomSafePipe } from './dom-safe.pipe';
import { HandoverReportComponent } from './handover-report.component';
import { PrintCenterComponent } from './print-center.component';
import { PrintCenterService } from './print-center.service';
import { HandoverReportService } from './handover-report.service';
import { BloodSugarComponent } from './blood-sugar.component';
import { UnplannedExtubationComponent } from './unplanned-extubation.component';
import { PrintPageMultiSelectComponent } from './print-page-multi-select.component';
import { routes } from './app.routes';

@NgModule({
  declarations: [
    App,
    Sjm1VeinMaintenanceComponent,
    SjmCrrtVeinMaintenanceComponent,
    YdwzlTemperatureComponent,
    ToleranceScoreComponent,
    CommitSuicideScoreComponent,
    IadScoreComponent,
    BaetheiScoreComponent,
    PatientFallDangerComponent,
    HealthEducationComponent,
    WpgmFormComponent,
    EcmoRecordComponent,
    TransfusionRecordComponent,
    PiccoRecordComponent,
    IabpRecordComponent,
    BradenFormComponent,
    CrrtRecordComponent,
    CrrtOrderFormComponent,
    TemperatureRecordComponent,
    HljldFormComponent,
    HandoverReportComponent,
    PrintCenterComponent,
    BloodSugarComponent,
    UnplannedExtubationComponent,
    PrintPageMultiSelectComponent,
    DomSafePipe,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    RouterModule.forRoot(routes),
  ],
  providers: [HljldFormService, HljldPdfService, HandoverReportService, PrintCenterService],
  bootstrap: [App],
})
export class AppModule {}
