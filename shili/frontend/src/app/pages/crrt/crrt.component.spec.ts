import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrrtComponent } from './crrt.component';

describe('CrrtComponent', () => {
  let component: CrrtComponent;
  let fixture: ComponentFixture<CrrtComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CrrtComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CrrtComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
