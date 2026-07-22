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
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    RouterModule.forRoot(routes),
  ],
  bootstrap: [App],
})
export class AppModule {}
