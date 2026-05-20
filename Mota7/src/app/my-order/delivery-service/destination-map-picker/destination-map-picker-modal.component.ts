import {
  AfterViewInit,
  Component,
  ChangeDetectorRef,
  ElementRef,
  Input,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Geolocation } from '@capacitor/geolocation';
import {
  Firestore,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  Timestamp,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { buildTrackingPointsFromOrder } from './destination-map-picker.presenter';
import { IonicModule, ModalController, Platform, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  carSportOutline,
  checkmarkCircle,
  locateOutline,
  mapOutline,
  navigateOutline,
  personOutline,
} from 'ionicons/icons';
import {
  formatNominatimAddress,
  looksLikeCoordinateLabel,
  resolveHumanLocationLabel,
  type NominatimReversePayload,
} from '../../../core/utils/mota7-reverse-geocode.util';

export const MOTA7_MAPS_RETURN_MESSAGE = 'MOTA7_MAPS_RETURN' as const;

export type TrackingMapDirectionsRole = 'provider' | 'customer';

@Component({
  selector: 'app-destination-map-picker-modal',
  templateUrl: './destination-map-picker-modal.component.html',
  styleUrls: ['./destination-map-picker-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class DestinationMapPickerModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() originLat = 0;
  @Input() originLng = 0;
  @Input() initialDestinationLat = 0;
  @Input() initialDestinationLng = 0;
  @Input() initialDestinationText = '';
  @Input() mode: 'destination' | 'tracking' = 'destination';
  /** عند mode === destination: اختيار نقطة الانطلاق أو الوجهة من الخريطة */
  @Input() pickRole: 'destination' | 'origin' = 'destination';
  /** إغلاق المودال يُسجّل مركز الخريطة كنقطة انطلاق (طلب التوصيل) */
  @Input() applyOriginCenterOnDismiss = false;
  /** تمييز بصري للمؤشر عند الفتح على الموقع الحالي */
  @Input() accentOriginGpsPick = false;
  @Input() directionsRole: TrackingMapDirectionsRole = 'customer';
  /** يُستخدم مع postMessage للتحقق من جلسة العودة من خرائط جوجل */
  @Input() trackingSessionId = '';
  /** معرّف طلب Firebase لمزامنة مواضع العلامات بعد السحب */
  @Input() trackingOrderId = '';
  @Input() providerPoint: { lat: number; lng: number; label: string } | null = null;
  @Input() customerPoint: { lat: number; lng: number; label: string } | null = null;
  @Input() destinationPoint: { lat: number; lng: number; label: string } | null = null;

  @ViewChild('mapHost', { static: true }) mapHost?: ElementRef<HTMLDivElement>;

  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private platform = inject(Platform);
  private firestore = inject(Firestore);
  private injector = inject(EnvironmentInjector);
  private cdr = inject(ChangeDetectorRef);
  private hardwareBackSub: { unsubscribe: () => void } | null = null;

  constructor() {
    addIcons({
      closeOutline,
      carSportOutline,
      checkmarkCircle,
      navigateOutline,
      personOutline,
      mapOutline,
      locateOutline,
    });
  }

  private map: any = null;
  private leaflet: typeof import('leaflet') | null = null;
  private baseLayer: any = null;
  private markersLayer: any = null;
  private providerMarker: any = null;
  private customerMarker: any = null;
  private destinationMarker: any = null;
  private trackingRouteLayer: any = null;
  private trackingRouteShadowLayer: any = null;
  private routeAbort: AbortController | null = null;
  private routeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private routeRequestGeneration = 0;
  private reverseGeocodeTimer: ReturnType<typeof setTimeout> | null = null;
  private geocodeInFlight: Promise<void> | null = null;
  private waitingGoogleReturn = false;
  private onVisibilityChangeRef: (() => void) | null = null;
  private onWindowMessageBound = (ev: MessageEvent) => this.onTrackingWindowMessage(ev);
  private appStateListener: PluginListenerHandle | null = null;
  private appUrlOpenListener: PluginListenerHandle | null = null;
  private static leafletAssetsPromise: Promise<typeof import('leaflet')> | null = null;

  isMapReady = false;
  selectedLat = 0;
  selectedLng = 0;
  selectedAddress = '';
  resolvingAddress = false;
  /** وضع التتبع: جاري جلب مسار الشوارع من OSRM */
  routeLoading = false;
  /** مزامنة لحظية مع مستند الطلب في Firestore */
  trackingLiveActive = false;
  private orderLiveUnsub: Unsubscribe | null = null;
  private trackingSnapshotDebounce: ReturnType<typeof setTimeout> | null = null;
  private trackingBoundsFittedOnce = false;

  ngOnInit(): void {
    this.registerHardwareBackToDismiss();
    if (this.mode === 'tracking') {
      if (!this.trackingSessionId?.trim()) {
        this.trackingSessionId = `trk_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      }
      this.initTrackingPoints();
      const start = this.firstTrackingCenter();
      this.selectedLat = start.lat;
      this.selectedLng = start.lng;
      this.selectedAddress =
        'عرض المسار المحدد عند الطلب — يمكنك فتح خرائط جوجل للتوجيه.';
      void this.setupTrackingReturnObservers();
      return;
    }

    const start = this.resolveStartPoint();
    this.selectedLat = start.lat;
    this.selectedLng = start.lng;
    const presetText = (this.initialDestinationText || '').trim();
    if (presetText && !looksLikeCoordinateLabel(presetText)) {
      this.selectedAddress = presetText;
    } else {
      this.selectedAddress = 'جاري تحديد العنوان...';
    }

    void this.setupVisibilityAndAppReturnForGoogle();
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.ensureLeafletLoaded();
      await this.createMap(this.selectedLat, this.selectedLng);
      this.isMapReady = true;
      void this.reverseGeocodeCenter();
      queueMicrotask(() => {
        setTimeout(() => {
          try {
            this.map?.invalidateSize();
          } catch {
            /* ignore */
          }
        }, 200);
        setTimeout(() => {
          try {
            this.map?.invalidateSize();
          } catch {
            /* ignore */
          }
        }, 600);
      });
    } catch (e) {
      console.error('destination-map-picker init error:', e);
      await this.presentToast('تعذر تحميل الخريطة الداخلية حالياً', 'warning');
      void this.modalCtrl.dismiss(null, 'cancel');
    }
  }

  ngOnDestroy(): void {
    if (this.hardwareBackSub) {
      this.hardwareBackSub.unsubscribe();
      this.hardwareBackSub = null;
    }
    if (this.reverseGeocodeTimer) {
      clearTimeout(this.reverseGeocodeTimer);
      this.reverseGeocodeTimer = null;
    }
    if (this.routeDebounceTimer) {
      clearTimeout(this.routeDebounceTimer);
      this.routeDebounceTimer = null;
    }
    if (this.trackingSnapshotDebounce) {
      clearTimeout(this.trackingSnapshotDebounce);
      this.trackingSnapshotDebounce = null;
    }
    this.stopTrackingOrderLiveSync();
    this.routeAbort?.abort();
    this.routeAbort = null;
    if (this.map) {
      try {
        this.removeTrackingRouteLayers();
        this.map.remove();
      } catch {
        /* ignore */
      }
      this.map = null;
    }
    if (this.onVisibilityChangeRef) {
      document.removeEventListener('visibilitychange', this.onVisibilityChangeRef);
      this.onVisibilityChangeRef = null;
    }
    window.removeEventListener('message', this.onWindowMessageBound);
    if (this.appStateListener) {
      void this.appStateListener.remove();
      this.appStateListener = null;
    }
    if (this.appUrlOpenListener) {
      void this.appUrlOpenListener.remove();
      this.appUrlOpenListener = null;
    }
  }

  dismiss(): void {
    if (
      this.applyOriginCenterOnDismiss &&
      this.mode === 'destination' &&
      this.pickRole === 'origin'
    ) {
      void this.dismissWithOriginCenterApply();
      return;
    }
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  private async dismissWithOriginCenterApply(): Promise<void> {
    let lat = this.selectedLat;
    let lng = this.selectedLng;
    try {
      if (this.map) {
        const c = this.map.getCenter();
        lat = c.lat;
        lng = c.lng;
        this.selectedLat = lat;
        this.selectedLng = lng;
      }
    } catch {
      /* keep selectedLat/Lng */
    }
    const locationLabel = await resolveHumanLocationLabel(lat, lng, this.selectedAddress);
    void this.modalCtrl.dismiss(
      {
        pickKind: 'origin' as const,
        fromLocation: locationLabel,
        lat,
        lng,
      },
      'confirm'
    );
  }

  async moveToMyLocation(): Promise<void> {
    try {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        perm = await Geolocation.requestPermissions();
      }
      if (perm.location !== 'granted') {
        await this.presentToast('فعّل صلاحية الموقع أولاً', 'warning');
        return;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 15000,
      });
      this.panTo(pos.coords.latitude, pos.coords.longitude, 16);
    } catch {
      await this.presentToast('تعذر تحديد موقعك الآن', 'warning');
    }
  }

  async confirmSelection(): Promise<void> {
    if (this.map) {
      try {
        const c = this.map.getCenter();
        this.selectedLat = c.lat;
        this.selectedLng = c.lng;
      } catch {
        /* keep */
      }
    }
    const locationLabel = await resolveHumanLocationLabel(
      this.selectedLat,
      this.selectedLng,
      this.selectedAddress
    );
    if (this.pickRole === 'origin') {
      void this.modalCtrl.dismiss(
        {
          pickKind: 'origin' as const,
          fromLocation: locationLabel,
          lat: this.selectedLat,
          lng: this.selectedLng,
        },
        'confirm'
      );
      return;
    }
    void this.modalCtrl.dismiss(
      {
        pickKind: 'destination' as const,
        toLocation: locationLabel,
        toLat: this.selectedLat,
        toLng: this.selectedLng,
      },
      'confirm'
    );
  }

  private resolveStartPoint(): { lat: number; lng: number } {
    const hasInitialDestination =
      Number.isFinite(this.initialDestinationLat) &&
      Number.isFinite(this.initialDestinationLng) &&
      !(this.initialDestinationLat === 0 && this.initialDestinationLng === 0);

    if (this.pickRole === 'destination') {
      if (hasInitialDestination) {
        return { lat: this.initialDestinationLat, lng: this.initialDestinationLng };
      }
      if (this.hasOriginCoordinates()) {
        return { lat: this.originLat, lng: this.originLng };
      }
      return { lat: 25.4374, lng: 30.5465 };
    }

    if (this.hasOriginCoordinates()) {
      return { lat: this.originLat, lng: this.originLng };
    }
    if (hasInitialDestination) {
      return { lat: this.initialDestinationLat, lng: this.initialDestinationLng };
    }
    return { lat: 25.4374, lng: 30.5465 };
  }

  private hasOriginCoordinates(): boolean {
    return (
      Number.isFinite(this.originLat) &&
      Number.isFinite(this.originLng) &&
      !(this.originLat === 0 && this.originLng === 0)
    );
  }

  private async ensureLeafletLoaded(): Promise<void> {
    if (this.leaflet) {
      return;
    }
    if (!DestinationMapPickerModalComponent.leafletAssetsPromise) {
      DestinationMapPickerModalComponent.leafletAssetsPromise = import('leaflet');
    }
    this.leaflet = await DestinationMapPickerModalComponent.leafletAssetsPromise;
  }

  private async createMap(lat: number, lng: number): Promise<void> {
    if (!this.mapHost?.nativeElement || !this.leaflet) {
      throw new Error('leaflet-map-host-missing');
    }
    const L = this.leaflet;
    this.map = L.map(this.mapHost.nativeElement, {
      zoomControl: false,
      attributionControl: true,
      center: [lat, lng],
      zoom: 16,
      /** Canvas renderer يتسبب أحياناً في عدم استقبال اللمس فوق المودال */
      preferCanvas: false,
    });
    this.markersLayer = L.layerGroup().addTo(this.map);

    if (this.mode === 'tracking') {
      const darkBasemap = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 20,
          subdomains: 'abcd',
          attribution: '© OSM © CARTO',
        }
      );
      this.baseLayer = darkBasemap;
      darkBasemap.addTo(this.map);
      L.control.zoom({ position: 'bottomright' }).addTo(this.map);
      this.renderTrackingMarkers();
      this.fitToTrackingPoints();
      this.trackingBoundsFittedOnce = true;
      this.scheduleTrackingRoadRoute(true);
      this.startTrackingOrderLiveSync();
      return;
    }

    /**
     * طبقات مجانية بدون مفاتيح: OSM الافتراضي يعرض غالباً تفاصيل/نقاط اهتمام أوضح من Voyager
     * في نفس بيانات OSM؛ CyclOSM يعزز وضوح الشبكة والممرات.
     */
    const osmDetailed = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    const cartoVoyager = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: '© OpenStreetMap © CARTO',
      }
    );
    const cyclOsm = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
      maxZoom: 20,
      subdomains: 'abc',
      attribution: '© OpenStreetMap — CyclOSM',
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles © Esri',
      }
    );

    this.baseLayer = osmDetailed;
    this.baseLayer.addTo(this.map);
    L.control.layers(
      {
        'تفصيلية (OSM)': osmDetailed,
        'شبكة طرق (CyclOSM)': cyclOsm,
        'طرق (Carto)': cartoVoyager,
        'صور قمر صناعي': satellite,
      },
      {},
      { position: 'topright' }
    ).addTo(this.map);

    L.control.zoom({ position: 'bottomleft' }).addTo(this.map);

    if (this.hasOriginCoordinates()) {
      const tip =
        this.pickRole === 'origin'
          ? 'آخر نقطة انطلاق محفوظة'
          : 'نقطة الانطلاق (طالب الخدمة)';
      L.circleMarker([this.originLat, this.originLng], {
        radius: 7,
        color: '#2563eb',
        fillColor: '#60a5fa',
        fillOpacity: 0.95,
        weight: 2,
      })
        .addTo(this.map)
        .bindTooltip(tip, { direction: 'top', offset: [0, -6] });
    }

    this.map.on('moveend', () => {
      const center = this.map.getCenter();
      this.selectedLat = center.lat;
      this.selectedLng = center.lng;
      if (!this.selectedAddress || looksLikeCoordinateLabel(this.selectedAddress)) {
        this.selectedAddress = 'جاري تحديد العنوان...';
      }
      this.queueReverseGeocode();
    });
  }

  private panTo(lat: number, lng: number, zoom: number): void {
    if (!this.map) {
      return;
    }
    this.map.flyTo([lat, lng], zoom, {
      animate: true,
      duration: 0.5,
    });
  }

  private normalizeTrackerPoint(
    p: { lat: number; lng: number; label: string } | null,
    defaultLabel: string
  ): { lat: number; lng: number; label: string } | null {
    if (!p) return null;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const ok =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;
    return ok ? { lat, lng, label: (p.label || defaultLabel).trim() } : null;
  }

  private initTrackingPoints(): void {
    this.providerPoint = this.normalizeTrackerPoint(this.providerPoint, 'كابتن التوصيل');
    this.customerPoint = this.normalizeTrackerPoint(this.customerPoint, 'العميل');
    this.destinationPoint = this.normalizeTrackerPoint(this.destinationPoint, 'جهة الوصول');
  }

  private static readonly FALLBACK_MAP_CENTER = { lat: 25.4374, lng: 30.5465 };

  private firstTrackingCenter(): { lat: number; lng: number } {
    const p =
      this.customerPoint ?? this.providerPoint ?? this.destinationPoint ?? null;
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      return { lat: p.lat, lng: p.lng };
    }
    const r = this.resolveStartPoint();
    if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
      return r;
    }
    return { ...DestinationMapPickerModalComponent.FALLBACK_MAP_CENTER };
  }

  private renderTrackingMarkers(): void {
    if (!this.leaflet || !this.map || !this.markersLayer) return;
    const L = this.leaflet;
    this.markersLayer.clearLayers();

    const makeIcon = (emoji: string, cssClass: string) =>
      L.divIcon({
        className: `trk-marker ${cssClass} trk-marker--mini`,
        html: `<div class="trk-pin-wrap-mini"><span class="trk-pin-mini">${emoji}</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 30],
      });

    const pointOk = (lat: number, lng: number): boolean =>
      Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

    if (this.providerPoint && pointOk(this.providerPoint.lat, this.providerPoint.lng)) {
      this.providerMarker = L.marker([this.providerPoint.lat, this.providerPoint.lng], {
        icon: makeIcon('🚗', 'trk-provider'),
        draggable: false,
        interactive: true,
      }).addTo(this.markersLayer);
      this.providerMarker.bindTooltip('كابتن التوصيل', {
        direction: 'top',
        offset: [0, -22],
        className: 'mota7-trk-tt',
      });
    }

    if (this.customerPoint && pointOk(this.customerPoint.lat, this.customerPoint.lng)) {
      this.customerMarker = L.marker([this.customerPoint.lat, this.customerPoint.lng], {
        icon: makeIcon('👤', 'trk-customer'),
        draggable: false,
        interactive: true,
      }).addTo(this.markersLayer);
      this.customerMarker.bindTooltip('العميل', {
        direction: 'top',
        offset: [0, -22],
        className: 'mota7-trk-tt',
      });
    }

    if (this.destinationPoint && pointOk(this.destinationPoint.lat, this.destinationPoint.lng)) {
      this.destinationMarker = L.marker([this.destinationPoint.lat, this.destinationPoint.lng], {
        icon: makeIcon('📍', 'trk-destination'),
        draggable: false,
        interactive: true,
      }).addTo(this.markersLayer);
      this.destinationMarker.bindTooltip('جهة الوصول', {
        direction: 'top',
        offset: [0, -22],
        className: 'mota7-trk-tt',
      });
    }

    this.scheduleTrackingRoadRoute(true);
  }

  private removeTrackingRouteLayers(): void {
    if (!this.map) {
      return;
    }
    for (const layer of [this.trackingRouteShadowLayer, this.trackingRouteLayer]) {
      if (!layer) {
        continue;
      }
      try {
        this.map.removeLayer(layer);
      } catch {
        /* ignore */
      }
    }
    this.trackingRouteShadowLayer = null;
    this.trackingRouteLayer = null;
  }

  /** نقاط المسار بترتيب التوصيل: مندوب → استلام عميل → تسليم. */
  private buildTrackingWaypointsLatLng(): [number, number][] {
    const latlngs: [number, number][] = [];
    const push = (lat: number, lng: number) => {
      if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
        latlngs.push([lat, lng]);
      }
    };
    if (this.providerPoint) push(this.providerPoint.lat, this.providerPoint.lng);
    if (this.customerPoint) push(this.customerPoint.lat, this.customerPoint.lng);
    if (this.destinationPoint) push(this.destinationPoint.lat, this.destinationPoint.lng);
    return latlngs;
  }

  /** OSRM يستخدم ترتيب lon,lat مفصول بفاصلة منقوطة. */
  private buildOsrmCoordinatesParam(): string | null {
    const parts: string[] = [];
    const push = (lat: number, lng: number) => {
      if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
        parts.push(`${lng},${lat}`);
      }
    };
    if (this.providerPoint) push(this.providerPoint.lat, this.providerPoint.lng);
    if (this.customerPoint) push(this.customerPoint.lat, this.customerPoint.lng);
    if (this.destinationPoint) push(this.destinationPoint.lat, this.destinationPoint.lng);
    return parts.length >= 2 ? parts.join(';') : null;
  }

  /** جلب مسار يتبع الشوارع (OSRM عمومي) مع احتياطي خط مستقيم. */
  private scheduleTrackingRoadRoute(immediate: boolean): void {
    if (this.mode !== 'tracking' || !this.map || !this.leaflet) {
      return;
    }
    if (this.routeDebounceTimer) {
      clearTimeout(this.routeDebounceTimer);
      this.routeDebounceTimer = null;
    }
    if (immediate) {
      void this.fetchAndDrawOsrmRoute();
      return;
    }
    this.routeDebounceTimer = setTimeout(() => {
      this.routeDebounceTimer = null;
      void this.fetchAndDrawOsrmRoute();
    }, 400);
  }

  private drawRoutePolylines(latlngs: [number, number][]): void {
    if (!this.leaflet || !this.map || latlngs.length < 2) {
      return;
    }
    const L = this.leaflet;
    this.removeTrackingRouteLayers();
    this.trackingRouteShadowLayer = L.polyline(latlngs, {
      color: '#0f172a',
      weight: 10,
      opacity: 0.55,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(this.map);
    this.trackingRouteLayer = L.polyline(latlngs, {
      color: '#2dd4bf',
      weight: 5,
      opacity: 0.95,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(this.map);
    try {
      this.markersLayer?.bringToFront?.();
    } catch {
      /* ignore */
    }
  }

  private drawStraightFallbackRoute(): void {
    const latlngs = this.buildTrackingWaypointsLatLng();
    this.drawRoutePolylines(latlngs);
  }

  private async fetchAndDrawOsrmRoute(): Promise<void> {
    if (!this.leaflet || !this.map || this.mode !== 'tracking') {
      return;
    }
    const coordParam = this.buildOsrmCoordinatesParam();
    const fallback = this.buildTrackingWaypointsLatLng();
    if (!coordParam || fallback.length < 2) {
      this.removeTrackingRouteLayers();
      return;
    }

    const gen = ++this.routeRequestGeneration;
    this.routeAbort?.abort();
    this.routeAbort = new AbortController();
    const { signal } = this.routeAbort;

    this.routeLoading = true;
    this.cdr.markForCheck();
    const url =
      'https://router.project-osrm.org/route/v1/driving/' +
      encodeURI(coordParam) +
      '?overview=full&geometries=geojson&steps=false';

    try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (gen !== this.routeRequestGeneration || !this.map || !this.leaflet) {
        return;
      }
      if (!res.ok) {
        this.drawStraightFallbackRoute();
        return;
      }
      const data = (await res.json()) as {
        code?: string;
        routes?: Array<{ geometry?: { type?: string; coordinates?: number[][] } }>;
      };
      if (gen !== this.routeRequestGeneration) {
        return;
      }
      const geom = data.routes?.[0]?.geometry;
      const coords = geom?.coordinates;
      if (data.code !== 'Ok' || !coords?.length || geom?.type !== 'LineString') {
        this.drawStraightFallbackRoute();
        return;
      }
      const latlngs: [number, number][] = coords.map((c) => [c[1], c[0]] as [number, number]);
      this.drawRoutePolylines(latlngs);
    } catch {
      if (gen === this.routeRequestGeneration && this.map && this.leaflet) {
        this.drawStraightFallbackRoute();
      }
    } finally {
      if (gen === this.routeRequestGeneration) {
        this.routeLoading = false;
        this.cdr.markForCheck();
      }
    }
  }

  private async persistDraggedTrackingPoint(
    dragTarget: 'provider' | 'customer' | 'destination',
    lat: number,
    lng: number
  ): Promise<void> {
    if (this.mode !== 'tracking') {
      return;
    }
    const orderId = (this.trackingOrderId ?? '').trim();
    if (!orderId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const lastUpdate = Timestamp.now();
    let patch: Record<string, unknown>;

    switch (dragTarget) {
      case 'provider':
        patch = {
          providerLat: lat,
          providerLng: lng,
          lastUpdate,
        };
        break;
      case 'customer':
        patch = {
          lat,
          lng,
          location_name: 'تم التعديل من خريطة التتبع',
          lastUpdate,
        };
        break;
      case 'destination':
        patch = {
          toLat: lat,
          toLng: lng,
          lastUpdate,
        };
        break;
      default:
        return;
    }

    try {
      await runInInjectionContext(this.injector, () =>
        updateDoc(doc(this.firestore, 'orders', orderId), patch)
      );
    } catch (e) {
      console.error('persistDraggedTrackingPoint', dragTarget, e);
      await this.presentToast('تعذّر حفظ الإحداثيات بعد السحب', 'warning');
    }
  }

  private startTrackingOrderLiveSync(): void {
    const orderId = (this.trackingOrderId ?? '').trim();
    if (!orderId || this.mode !== 'tracking') {
      return;
    }
    this.stopTrackingOrderLiveSync();
    this.trackingLiveActive = true;
    this.cdr.markForCheck();
    runInInjectionContext(this.injector, () => {
      this.orderLiveUnsub = onSnapshot(
        doc(this.firestore, 'orders', orderId),
        (snap) => {
          if (!snap.exists()) {
            return;
          }
          this.scheduleTrackingSnapshotApply(snap.data() as Record<string, unknown>);
        },
        (err) => console.error('[tracking-map] live order sync', err)
      );
    });
  }

  private stopTrackingOrderLiveSync(): void {
    if (this.orderLiveUnsub) {
      this.orderLiveUnsub();
      this.orderLiveUnsub = null;
    }
    this.trackingLiveActive = false;
  }

  private scheduleTrackingSnapshotApply(data: Record<string, unknown>): void {
    if (this.trackingSnapshotDebounce) {
      clearTimeout(this.trackingSnapshotDebounce);
    }
    this.trackingSnapshotDebounce = setTimeout(() => {
      this.trackingSnapshotDebounce = null;
      this.applyTrackingOrderSnapshot(data);
    }, 280);
  }

  private pointsEqual(
    a: { lat: number; lng: number } | null,
    b: { lat: number; lng: number } | null
  ): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
  }

  private applyTrackingOrderSnapshot(data: Record<string, unknown>): void {
    if (this.mode !== 'tracking' || !this.isMapReady) {
      return;
    }
    const built = buildTrackingPointsFromOrder(data);
    const same =
      this.pointsEqual(this.providerPoint, built.providerPoint) &&
      this.pointsEqual(this.customerPoint, built.customerPoint) &&
      this.pointsEqual(this.destinationPoint, built.destinationPoint);
    if (same) {
      return;
    }
    this.providerPoint = built.providerPoint;
    this.customerPoint = built.customerPoint;
    this.destinationPoint = built.destinationPoint;
    this.renderTrackingMarkers();
    this.cdr.markForCheck();
  }

  private fitToTrackingPoints(): void {
    if (!this.leaflet || !this.map) return;
    const L = this.leaflet;
    const bounds = L.latLngBounds([]);
    const extendIfValid = (lat: unknown, lng: unknown): void => {
      const la = Number(lat);
      const ln = Number(lng);
      if (Number.isFinite(la) && Number.isFinite(ln)) {
        bounds.extend([la, ln]);
      }
    };
    if (this.providerPoint) extendIfValid(this.providerPoint.lat, this.providerPoint.lng);
    if (this.customerPoint) extendIfValid(this.customerPoint.lat, this.customerPoint.lng);
    if (this.destinationPoint) extendIfValid(this.destinationPoint.lat, this.destinationPoint.lng);
    if (bounds.isValid()) {
      const outer = this.mode === 'tracking' ? 72 : 48;
      try {
        this.map.fitBounds(bounds, { padding: outer, maxZoom: 15 });
      } catch {
        const c = this.firstTrackingCenter();
        this.map.setView([c.lat, c.lng], 14);
      }
    } else {
      const c = this.firstTrackingCenter();
      if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        this.map.setView([c.lat, c.lng], 14);
      } else {
        const d = DestinationMapPickerModalComponent.FALLBACK_MAP_CENTER;
        this.map.setView([d.lat, d.lng], 13);
      }
    }
  }

  /** نفس منطق البطاقات: مقدم الخدمة = انطلاق من المندوب؛ طالب الخدمة = انطلاق من العميل. */
  private buildTrackingGoogleMapsUrl(): string {
    const hasProv = !!this.providerPoint;
    const hasCust = !!this.customerPoint;
    const hasDest = !!this.destinationPoint;

    const prov = hasProv ? `${this.providerPoint!.lat},${this.providerPoint!.lng}` : '';
    const cust = hasCust ? `${this.customerPoint!.lat},${this.customerPoint!.lng}` : '';
    const dest = hasDest ? `${this.destinationPoint!.lat},${this.destinationPoint!.lng}` : '';

    const params: string[] = ['api=1', 'travelmode=driving'];

    if (this.directionsRole === 'provider') {
      if (hasProv) params.push(`origin=${encodeURIComponent(prov)}`);
      if (hasDest) {
        params.push(`destination=${encodeURIComponent(dest)}`);
        if (hasCust) params.push(`waypoints=${encodeURIComponent(cust)}`);
      } else if (hasCust) {
        params.push(`destination=${encodeURIComponent(cust)}`);
      } else if (hasProv) {
        params.push(`destination=${encodeURIComponent(prov)}`);
      }
    } else {
      if (hasCust) params.push(`origin=${encodeURIComponent(cust)}`);
      if (hasDest) {
        params.push(`destination=${encodeURIComponent(dest)}`);
        if (hasProv) params.push(`waypoints=${encodeURIComponent(prov)}`);
      } else if (hasProv) {
        params.push(`destination=${encodeURIComponent(prov)}`);
      } else if (hasCust) {
        params.push(`destination=${encodeURIComponent(cust)}`);
      }
    }

    return `https://www.google.com/maps/dir/?${params.join('&')}`;
  }

  async openGoogleMapsMobile(): Promise<void> {
    try {
      let url = '';
      if (this.mode === 'tracking') {
        url = this.buildTrackingGoogleMapsUrl();
      } else {
        url =
          'https://www.google.com/maps/search/?api=1&query=' +
          encodeURIComponent(`${this.selectedLat},${this.selectedLng}`);
      }

      this.waitingGoogleReturn = true;
      if (Capacitor.isNativePlatform()) {
        await AppLauncher.openUrl({ url });
      } else {
        window.open(url, '_blank');
      }
    } catch {
      this.waitingGoogleReturn = false;
      await this.presentToast('تعذر فتح خرائط جوجل الآن', 'warning');
    }
  }

  private handleReturnFromExternalMaps(source: string): void {
    if (!this.waitingGoogleReturn) {
      return;
    }
    this.waitingGoogleReturn = false;
    if (this.mode === 'tracking') {
      const orderId = (this.trackingOrderId ?? '').trim();
      if (orderId) {
        void runInInjectionContext(this.injector, async () => {
          try {
            const snap = await getDoc(doc(this.firestore, 'orders', orderId));
            if (snap.exists()) {
              this.applyTrackingOrderSnapshot(snap.data() as Record<string, unknown>);
            }
          } catch {
            /* ignore */
          }
        });
      }
    }
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
        if (this.mode === 'tracking') {
          this.renderTrackingMarkers();
        } else {
          const z = this.map.getZoom();
          this.panTo(this.selectedLat, this.selectedLng, Math.max(14, z));
        }
      }, 120);
    }
    if (this.mode !== 'tracking') {
      void this.presentToast(`تمت العودة (${source}) — الخريطة جاهزة`, 'success');
    }
  }

  private tryParseLatLngFromExternalUrl(url: string): { lat: number; lng: number } | null {
    const s = String(url || '').trim();
    if (!s) return null;

    // نمط شائع في روابط خرائط جوجل: .../@lat,lng,zoom...
    const atMatch = s.match(/@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (atMatch) {
      const lat = Number(atMatch[1]);
      const lng = Number(atMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }

    const qMatch = s.match(/[?&](?:q|query|ll|sll)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (qMatch) {
      const lat = Number(qMatch[1]);
      const lng = Number(qMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    return null;
  }

  private applyExternalPickedCoordinates(point: { lat: number; lng: number }): void {
    if (this.mode !== 'destination') {
      return;
    }
    this.selectedLat = point.lat;
    this.selectedLng = point.lng;
    this.selectedAddress = 'جاري تحديد العنوان...';
    this.panTo(point.lat, point.lng, 16);
    void this.reverseGeocodeCenter();
  }

  private onTrackingWindowMessage(ev: MessageEvent): void {
    if (this.mode !== 'tracking') return;
    const d = ev.data;
    if (
      d &&
      typeof d === 'object' &&
      (d as { type?: string }).type === MOTA7_MAPS_RETURN_MESSAGE &&
      (d as { sessionId?: string }).sessionId === this.trackingSessionId
    ) {
      this.handleReturnFromExternalMaps('رسالة التطبيق');
    }
  }

  private setupVisibilityReturnListener(): void {
    if (this.onVisibilityChangeRef) return;
    this.onVisibilityChangeRef = () => {
      if (!document.hidden && this.waitingGoogleReturn) {
        this.handleReturnFromExternalMaps('التبويب / التطبيق');
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChangeRef);
  }

  private async setupVisibilityAndAppReturnForGoogle(): Promise<void> {
    this.setupVisibilityReturnListener();
    if (this.appStateListener) {
      return;
    }
    if (Capacitor.isNativePlatform()) {
      try {
        this.appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive && this.waitingGoogleReturn) {
            this.handleReturnFromExternalMaps('الواجهة الأمامية');
          }
        });
      } catch {
        /* يكفي visibility */
      }
    }
    if (Capacitor.isNativePlatform() && !this.appUrlOpenListener) {
      try {
        this.appUrlOpenListener = await App.addListener('appUrlOpen', ({ url }) => {
          const point = this.tryParseLatLngFromExternalUrl(String(url || ''));
          if (point) {
            this.applyExternalPickedCoordinates(point);
          }
          if (this.waitingGoogleReturn) {
            this.handleReturnFromExternalMaps('رابط موقع');
          }
        });
      } catch {
        /* ignore */
      }
    }
  }

  private async setupTrackingReturnObservers(): Promise<void> {
    await this.setupVisibilityAndAppReturnForGoogle();
    window.addEventListener('message', this.onWindowMessageBound);
  }

  private queueReverseGeocode(): void {
    if (this.reverseGeocodeTimer) {
      clearTimeout(this.reverseGeocodeTimer);
    }
    this.reverseGeocodeTimer = setTimeout(() => {
      void this.reverseGeocodeCenter();
    }, 350);
  }

  private async reverseGeocodeCenter(): Promise<void> {
    if (this.geocodeInFlight) {
      await this.geocodeInFlight;
      return;
    }
    this.geocodeInFlight = this.runReverseGeocode();
    try {
      await this.geocodeInFlight;
    } finally {
      this.geocodeInFlight = null;
    }
  }

  private async runReverseGeocode(): Promise<void> {
    this.resolvingAddress = true;
    this.cdr.markForCheck();
    try {
      const url =
        'https://nominatim.openstreetmap.org/reverse?format=jsonv2' +
        `&lat=${encodeURIComponent(String(this.selectedLat))}` +
        `&lon=${encodeURIComponent(String(this.selectedLng))}` +
        '&zoom=18&addressdetails=1';
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'ar,en',
        },
      });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as NominatimReversePayload;
      const formatted = formatNominatimAddress(data);
      if (formatted) {
        this.selectedAddress = formatted;
      } else if (looksLikeCoordinateLabel(this.selectedAddress)) {
        this.selectedAddress = 'موقع محدد — حرّك الخريطة لتحسين العنوان';
      }
    } catch {
      /* keep last readable label */
    } finally {
      this.resolvingAddress = false;
      this.cdr.markForCheck();
    }
  }

  private async presentToast(
    message: string,
    color: 'dark' | 'warning' | 'success' = 'dark'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
      mode: 'ios',
    });
    await toast.present();
  }

  /**
   * عند فتح مودال الخريطة: رجوع الموبايل يغلق المودال أولاً
   * بدل الخروج من شاشة الطلبات خلفه.
   */
  private registerHardwareBackToDismiss(): void {
    if (this.hardwareBackSub) {
      return;
    }
    this.hardwareBackSub = this.platform.backButton.subscribeWithPriority(10001, () => {
      this.dismiss();
    });
  }
}
