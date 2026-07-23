import { Routes } from '@angular/router';
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

export const routes: Routes = [
  { path: 'sjm1', component: Sjm1VeinMaintenanceComponent },
  { path: 'sjmCrrt', component: SjmCrrtVeinMaintenanceComponent },
  { path: 'ydwzlForm', component: YdwzlTemperatureComponent },
  { path: 'toleranceForm', component: ToleranceScoreComponent },
  { path: 'commitSuicideForm', component: CommitSuicideScoreComponent },
  { path: 'IADForm', component: IadScoreComponent },
  { path: 'baetheiForm', component: BaetheiScoreComponent },
  { path: 'patientFallDangerForm', component: PatientFallDangerComponent },
  { path: 'jkjyForm', component: HealthEducationComponent },
  { path: 'wpgmForm', component: WpgmFormComponent },
  { path: 'ecmoForm', component: EcmoRecordComponent },
  { path: 'transfusionForm', component: TransfusionRecordComponent },
  { path: 'piccoForm', component: PiccoRecordComponent },
  { path: 'iabpForm', component: IabpRecordComponent },
  { path: '', redirectTo: 'sjm1', pathMatch: 'full' },
];
