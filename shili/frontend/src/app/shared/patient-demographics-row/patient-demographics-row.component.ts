import { Component } from '@angular/core';
import { HostPatientService } from '../../services/host-patient.service';

@Component({
  selector: 'app-patient-demographics-row',
  templateUrl: './patient-demographics-row.component.html',
})
export class PatientDemographicsRowComponent {
  constructor(readonly hostPatient: HostPatientService) {}
}
