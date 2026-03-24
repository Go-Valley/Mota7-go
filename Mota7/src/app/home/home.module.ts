import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { HomePageRoutingModule } from './home-routing.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomePageRoutingModule
    // لاحظ أننا حذفنا HomePage من هنا تماماً
  ],
  declarations: [] // يجب أن تبقى فارغة
})
export class HomePageModule {}