import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CrrtComponent } from './pages/crrt/crrt.component';
import { CvcComponent } from './pages/cvc/cvc.component';
import { RmComponent } from './pages/rm/rm.component';
import { PiccoComponent } from './pages/picco/picco.component';
import { IabpComponent } from './pages/iabp/iabp.component';
import { PeComponent } from './pages/pe/pe.component';
import { HpComponent } from './pages/hp/hp.component';
import { ProteinAComponent } from './pages/protein-a/protein-a.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/crrt' },
  { path: 'crrt', component: CrrtComponent },
  { path: 'cvc', component: CvcComponent },
  { path: 'rm', component: RmComponent },
  { path: 'picco', component: PiccoComponent },
  { path: 'iabp', component: IabpComponent },
  { path: 'pe', component: PeComponent },
  { path: 'hp', component: HpComponent },
  { path: 'protein-a', component: ProteinAComponent },
  { path: '**', redirectTo: '/crrt' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
