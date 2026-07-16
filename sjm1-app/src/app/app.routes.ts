import { Routes } from '@angular/router';
import { Sjm1VeinMaintenanceComponent } from './sjm1-vein-maintenance.component';
import { SjmCrrtVeinMaintenanceComponent } from './sjm-crrt-vein-maintenance.component';
import { YdwzlTemperatureComponent } from './ydwzl-temperature.component';
import { ToleranceScoreComponent } from './tolerance-score.component';
import { CommitSuicideScoreComponent } from './commit-suicide-score.component';

export const routes: Routes = [
  { path: 'sjm1', component: Sjm1VeinMaintenanceComponent },
  { path: 'sjmCrrt', component: SjmCrrtVeinMaintenanceComponent },
  { path: 'ydwzlForm', component: YdwzlTemperatureComponent },
  { path: 'toleranceForm', component: ToleranceScoreComponent },
  { path: 'commitSuicideForm', component: CommitSuicideScoreComponent },
  { path: '', redirectTo: 'sjm1', pathMatch: 'full' },
];
