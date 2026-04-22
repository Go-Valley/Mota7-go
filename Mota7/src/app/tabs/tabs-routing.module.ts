import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'home',
        children: [
          {
            path: '',
            loadChildren: () => import('../home/home.module').then(m => m.HomePageModule)
          },
          {
            path: 'store/:storeId',
            loadComponent: () => import('../home/store-detail/store-detail.page').then(m => m.StoreDetailPage)
          }
        ]
      },
      {
        path: 'my-order',
        loadChildren: () => import('../my-order/my-order.module').then(m => m.MyOrderPageModule)
      },
      {
        path: 'my-account',
        children: [
          {
            path: '',
            loadChildren: () => import('../my-account/my-account.module').then(m => m.MyAccountPageModule)
          },
          {
            path: 'cus-order',
            loadComponent: () => import('../my-account/cus_order/cus-order.page').then(m => m.CusOrderPage)
          }
        ]
      },
      {
        path: 'login',
        loadComponent: () => import('../my-account/login.page').then(m => m.LoginPage)
      },
      {
        path: '',
        redirectTo: 'home', // توجيه نسبي أضمن
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsPageRoutingModule {}