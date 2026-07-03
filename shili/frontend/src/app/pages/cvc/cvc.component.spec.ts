import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CvcComponent } from './cvc.component';

describe('CvcComponent', () => {
  let component: CvcComponent;
  let fixture: ComponentFixture<CvcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CvcComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CvcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
