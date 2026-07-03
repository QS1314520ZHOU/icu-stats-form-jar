import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProteinAComponent } from './protein-a.component';

describe('ProteinAComponent', () => {
  let component: ProteinAComponent;
  let fixture: ComponentFixture<ProteinAComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ProteinAComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ProteinAComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
