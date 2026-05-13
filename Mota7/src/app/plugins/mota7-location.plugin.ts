import { registerPlugin } from '@capacitor/core';

export interface Mota7LocationPlugin {
  /**
   * طلب أذونات الموقع على أندرويد (بدون الاعتماد على سلوك Geolocation عندما يكون GPS مطفأ).
   */
  requestLocationAccess(): Promise<void>;

  /**
   * فتح منتقي موقع Native (Google Maps SDK) وإرجاع الموقع المختار.
   */
  pickLocationOnNativeMap(options: {
    lat: number;
    lng: number;
    title?: string;
  }): Promise<{
    lat: number;
    lng: number;
    address?: string;
  }>;
}

export const Mota7Location = registerPlugin<Mota7LocationPlugin>('Mota7Location', {
  web: () => import('./mota7-location.web').then((m) => new m.Mota7LocationWeb()),
});
