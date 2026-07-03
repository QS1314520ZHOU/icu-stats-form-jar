import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PiccoComponent } from './picco.component';

describe('PiccoComponent', () => {
  let component: PiccoComponent;
  let fixture: ComponentFixture<PiccoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PiccoComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PiccoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
