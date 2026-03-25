import {
  AfterViewInit,
  Directive,
  ElementRef,
  EnvironmentInjector,
  Input,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  inject,
  isDevMode,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';
import {
  canRecordAdImpression,
  commitAdImpressionFirestore,
  markAdImpressionRecorded,
} from 'src/app/core/utils/ad-impression-tracking.util';

/** يعتبر الإعلان «مشاهداً» بعد بقاء الكارت ظاهراً بهذه النسبة لمدة dwellMs. */
const IO_THRESHOLD = 0.5;
const DWELL_MS = 1600;

@Directive({
  selector: '[appAdImpressionTrack]',
  standalone: true,
})
export class AdImpressionTrackDirective implements AfterViewInit, OnDestroy {
  @Input('appAdImpressionTrack') adId: string | null | undefined;

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private observer: IntersectionObserver | null = null;
  private dwellTimer: ReturnType<typeof setTimeout> | null = null;
  private committed = false;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const id = this.adId != null && this.adId !== '' ? String(this.adId) : '';
    if (!id) return;

    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        (entries) => this.handleEntries(entries, id),
        { threshold: IO_THRESHOLD, rootMargin: '0px' }
      );
      this.observer.observe(this.el.nativeElement);
    });
  }

  private handleEntries(entries: IntersectionObserverEntry[], id: string): void {
    const e = entries[0];
    const visible = !!e?.isIntersecting && e.intersectionRatio >= IO_THRESHOLD;
    if (!visible) {
      this.clearDwell();
      return;
    }
    if (this.committed || this.dwellTimer) return;
    this.dwellTimer = setTimeout(() => {
      this.dwellTimer = null;
      void this.tryCommit(id);
    }, DWELL_MS);
  }

  private clearDwell(): void {
    if (this.dwellTimer != null) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = null;
    }
  }

  private async tryCommit(id: string): Promise<void> {
    if (this.committed) return;
    if (!canRecordAdImpression(id)) {
      this.committed = true;
      this.disconnect();
      return;
    }
    try {
      await commitAdImpressionFirestore(this.firestore, this.injector, id);
      markAdImpressionRecorded(id);
      this.committed = true;
    } catch (err) {
      if (isDevMode()) console.warn('ad impression:', id, err);
    } finally {
      this.disconnect();
    }
  }

  private disconnect(): void {
    this.clearDwell();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
