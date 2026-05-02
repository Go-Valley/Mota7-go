import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Network, ConnectionStatus, PluginListenerHandle } from '@capacitor/network';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService implements OnDestroy {
  private readonly _isOnline$ = new BehaviorSubject<boolean>(true);
  readonly isOnline$ = this._isOnline$.asObservable();

  private nativeListener?: PluginListenerHandle;
  private webOnline = () => this._isOnline$.next(true);
  private webOffline = () => this._isOnline$.next(false);

  get isOnline(): boolean {
    return this._isOnline$.value;
  }

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await this.initNative();
    } else {
      this.initWeb();
    }
  }

  private async initNative(): Promise<void> {
    try {
      const status: ConnectionStatus = await Network.getStatus();
      this._isOnline$.next(status.connected);
    } catch {
      this._isOnline$.next(navigator.onLine);
    }

    try {
      this.nativeListener = await Network.addListener(
        'networkStatusChange',
        (status: ConnectionStatus) => this._isOnline$.next(status.connected),
      );
    } catch {
      this.initWeb();
    }
  }

  private initWeb(): void {
    this._isOnline$.next(navigator.onLine);
    window.addEventListener('online', this.webOnline);
    window.addEventListener('offline', this.webOffline);
  }

  ngOnDestroy(): void {
    this.nativeListener?.remove();
    window.removeEventListener('online', this.webOnline);
    window.removeEventListener('offline', this.webOffline);
  }
}
