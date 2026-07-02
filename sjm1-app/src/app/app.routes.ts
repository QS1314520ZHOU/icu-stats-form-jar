import { Routes } from '@angular/router';
import { Sjm1VeinMaintenanceComponent } from './sjm1-vein-maintenance.component';

export const routes: Routes = [
  { path: 'sjm1', component: Sjm1VeinMaintenanceComponent },
  { path: '', redirectTo: 'sjm1', pathMatch: 'full' },
];
