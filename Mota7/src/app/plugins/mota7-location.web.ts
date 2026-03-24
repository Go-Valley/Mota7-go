import { WebPlugin } from '@capacitor/core';
import type { Mota7LocationPlugin } from './mota7-location.plugin';

export class Mota7LocationWeb extends WebPlugin implements Mota7LocationPlugin {
  async requestLocationAccess(): Promise<void> {
    return;
  }
}
