import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule),
  },
  {
    path: 'my-account',
    redirectTo: '/tabs/my-account',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./my-account/login.page').then(m => m.LoginPage)
  },
  {
    path: 'register',
    loadComponent: () => import('./my-account/register.page').then(m => m.RegisterPage)
  },
  {
    path: 'edit-profile',
    loadComponent: () => import('./my-account/edit-profile.page').then(m => m.EditProfilePage)
  },
  {
    path: 'my-ads',
    loadComponent: () => import('./my-account/my_adv/my-ads.page').then(m => m.MyAdsPage)
  },
  {
    path: 'add-ad-type',
    loadComponent: () => import('./my-account/my_adv/add-ad-type.page').then(m => m.AddAdTypePage)
  },
  {
    path: 'education-form',
    loadComponent: () => import('./my-account/my_adv/components/education-form/education-form.component').then(m => m.EducationFormComponent)
  },
  {
    path: 'delivery-form',
    loadComponent: () => import('./my-account/my_adv/components/delivery-form/delivery-form.component').then(m => m.DeliveryFormComponent)
  },
  {
    path: 'other-services-form',
    loadComponent: () => import('./my-account/my_adv/components/other-services-form/other-services-form.component').then(m => m.OtherServicesFormComponent)
  },
  {
    path: 'product-form',
    loadComponent: () => import('./my-account/my_adv/components/product-form/product-form.component').then(m => m.ProductFormComponent)
  },
  {
    path: 'store-form',
    loadComponent: () => import('./my-account/my_adv/components/store-form/store-form.component').then(m => m.StoreFormComponent)
  },
  {
    path: 'cus-order',
    loadComponent: () => import('./my-account/cus_order/cus-order.page').then(m => m.CusOrderPage)
  },
  /** مسار مطلق من الجذر — النسبي `tabs/home` يسبب مسارات خاطئة وشاشة بيضاء عند مطابقة `**` */
  { path: '**', redirectTo: '/tabs/home' }
];