import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NZ_I18N } from 'ng-zorro-antd/i18n';
import { zh_CN } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import zh from '@angular/common/locales/zh';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

// NG-ZORRO Modules
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageModule } from 'ng-zorro-antd/message';
import { NzTimePickerModule } from 'ng-zorro-antd/time-picker';
import { NzDividerModule } from 'ng-zorro-antd/divider';

// Components
import { CrrtComponent } from './pages/crrt/crrt.component';
import { CvcComponent } from './pages/cvc/cvc.component';
import { RmComponent } from './pages/rm/rm.component';
import { PiccoComponent } from './pages/picco/picco.component';
import { IabpComponent } from './pages/iabp/iabp.component';
import { PeComponent } from './pages/pe/pe.component';
import { HpComponent } from './pages/hp/hp.component';
import { ProteinAComponent } from './pages/protein-a/protein-a.component';
import { PatientDemographicsRowComponent } from './shared/patient-demographics-row/patient-demographics-row.component';

registerLocaleData(zh);

@NgModule({
  declarations: [
    AppComponent,
    CrrtComponent,
    CvcComponent,
    RmComponent,
    PiccoComponent,
    IabpComponent,
    PeComponent,
    HpComponent,
    ProteinAComponent,
    PatientDemographicsRowComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    BrowserAnimationsModule,
    NzLayoutModule,
    NzIconModule,
    NzFormModule,
    NzInputModule,
    NzSelectModule,
    NzButtonModule,
    NzTableModule,
    NzDatePickerModule,
    NzCardModule,
    NzSwitchModule,
    NzModalModule,
    NzMessageModule,
    NzTimePickerModule,
    NzDividerModule
  ],
  providers: [{ provide: NZ_I18N, useValue: zh_CN }],
  bootstrap: [AppComponent]
})
export class AppModule { }
