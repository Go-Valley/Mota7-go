import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MyAccountPage } from './my-account.page';

const routes: Routes = [
  {
    path: '',
    component: MyAccountPage,
  },
  {
    path: 'cus-order',
    // تأكد أن المسار يبدأ بـ ./ للإشارة للمجلد الحالي
    loadComponent: () => import('./cus_order/cus-order.page').then(m => m.CusOrderPage)
    }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MyAccountPageRoutingModule {}