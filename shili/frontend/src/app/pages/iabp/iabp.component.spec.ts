import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IabpComponent } from './iabp.component';

describe('IabpComponent', () => {
  let component: IabpComponent;
  let fixture: ComponentFixture<IabpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ IabpComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(IabpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
