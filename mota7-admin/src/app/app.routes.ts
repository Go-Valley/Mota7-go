import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then( m => m.LoginPage)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.page').then( m => m.DashboardPage)
  },
  {
    path: 'taxonomy-lists',
    loadComponent: () =>
      import('./pages/taxonomy-lists/taxonomy-lists.page').then((m) => m.TaxonomyListsPage),
  },
  {
    path: 'users',
    loadComponent: () => import('./pages/users/users.page').then(m => m.UsersPage)
  },
  {
    path: 'blocked-users',
    loadComponent: () => import('./pages/blocked_users/blocked_users.page').then( m => m.BlockedUsersPage)
  },
  {
    path: 'adv',
    loadComponent: () => import('./pages/adv/adv').then(m => m.AdvPage)
  },
  {
    path: 'banners',
    loadComponent: () => import('./pages/banners/banners.page').then( m => m.BannersPage)
  },
  {
    path: 'pending-requests',
    loadComponent: () => import('./pages/pinding_order/pinding-order.page').then( m => m.PindingOrderPage)
  },
  {
    path: 'accepting_order',
    loadComponent: () => import('./pages/accepting_order/accepting_order').then(m => m.AcceptingOrderPage)
  },
  {
    path: 'completing-order',
    loadComponent: () => import('./pages/completing_order/completing_order').then(m => m.CompletingOrderPage)
  },
  {
    path: 'user-total-accepted',
    loadComponent: () => import('./pages/total_order_user/total_order_user').then(m => m.TotalOrderUserPage)
  },
  {
    path: 'provider-total-accepted',
    loadComponent: () =>
      import('./pages/total_order_subscriber/total_order_subscriber').then((m) => m.TotalOrderSubscriberPage),
  },
  {
    path: 'click-analytics',
    loadComponent: () => import('./pages/click_btn/click_btn').then((m) => m.ClickBtnPage),
  },
];