import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { MyAccountPage } from './my-account.page';

describe('MyAccountPage', () => {
  let component: MyAccountPage;
  let fixture: ComponentFixture<MyAccountPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MyAccountPage],
      imports: [IonicModule.forRoot(), ExploreContainerComponentModule]
    }).compileComponents();

    fixture = TestBed.createComponent(MyAccountPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
