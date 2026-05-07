import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  DocumentReference,
  docData,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  DEFAULT_SUBSCRIPTIONS_CONFIG,
  SubscriptionPlan,
  SubscriptionsConfig,
  normalizeSubscriptionsConfig,
  SUBSCRIPTIONS_CONFIG_DOC_PATH,
  newEmptyPlan,
} from '../core/models/subscriptions-config.model';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly fs = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  private readonly ref: DocumentReference = doc(
    this.fs,
    SUBSCRIPTIONS_CONFIG_DOC_PATH[0],
    SUBSCRIPTIONS_CONFIG_DOC_PATH[1]
  );

  /** مزامنة حية مع لوحة الأدمن */
  watchConfig(): Observable<SubscriptionsConfig> {
    return runInInjectionContext(this.injector, () =>
      docData(this.ref).pipe(
        map((raw) =>
          normalizeSubscriptionsConfig(raw as Record<string, unknown> | undefined)
        )
      )
    );
  }

  async getConfig(): Promise<SubscriptionsConfig> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDoc(this.ref)
    );
    if (!snap.exists()) {
      return { ...DEFAULT_SUBSCRIPTIONS_CONFIG };
    }
    return normalizeSubscriptionsConfig(snap.data() as Record<string, unknown>);
  }

  /** حقول خالية من undefined لأن Firestore يرفضها أحياناً ضمن الكائنات المركّبة */
  private serializePlan(p: SubscriptionPlan): Record<string, unknown> {
    const row: Record<string, unknown> = {
      id: String(p.id ?? '').trim(),
      name: String(p.name ?? ''),
      priceLabel: String(p.priceLabel ?? ''),
      price: Number.isFinite(Number(p.price)) ? Number(p.price) : 0,
      includedFeatures: Array.isArray(p.includedFeatures)
        ? p.includedFeatures.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [],
      excludedFeatures: Array.isArray(p.excludedFeatures)
        ? p.excludedFeatures.map((x) => String(x ?? '').trim()).filter(Boolean)
        : [],
      visible: !!p.visible,
      section: p.section === 'swiper' ? 'swiper' : 'main',
      order: Number.isFinite(Number(p.order)) ? Number(p.order) : 0,
      highlight: !!p.highlight,
    };
    const sub = String(p.subtitle ?? '').trim();
    if (sub) {
      row['subtitle'] = sub;
    }
    const tag = String(p.tagline ?? '').trim();
    if (tag) {
      row['tagline'] = tag;
    }
    const fn = String(p.footerNote ?? '').trim();
    if (fn) {
      row['footerNote'] = fn;
    }
    const eh = String(p.expiryHint ?? '').trim();
    if (eh) {
      row['expiryHint'] = eh;
    }
    const bd = String(p.badge ?? '').trim();
    if (bd) {
      row['badge'] = bd;
    }
    if (p.tier) {
      row['tier'] = p.tier;
    }
    if (
      typeof p.max_allowed_ads === 'number' &&
      Number.isFinite(p.max_allowed_ads) &&
      p.max_allowed_ads >= 0
    ) {
      row['max_allowed_ads'] = Math.floor(p.max_allowed_ads);
    }
    return row;
  }

  async saveFullConfig(cfg: SubscriptionsConfig): Promise<void> {
    const def = DEFAULT_SUBSCRIPTIONS_CONFIG;
    const payload: Record<string, unknown> = {
      active: !!cfg.active,
      show_empty_message: !!cfg.show_empty_message,
      empty_message: String(cfg.empty_message ?? ''),
      plans: cfg.plans.map((p) => this.serializePlan(p)),
      addons_html: String(cfg.addons_html ?? ''),
      subscription_orders_whatsapp: String(
        cfg.subscription_orders_whatsapp ?? ''
      ),
      vip_pin_price_level_1:
        Number(cfg.vip_pin_price_level_1) || def.vip_pin_price_level_1!,
      vip_pin_price_level_2:
        Number(cfg.vip_pin_price_level_2) || def.vip_pin_price_level_2!,
      vip_pin_price_level_3:
        Number(cfg.vip_pin_price_level_3) || def.vip_pin_price_level_3!,
      vip_pin_price_level_4:
        Number(cfg.vip_pin_price_level_4) || def.vip_pin_price_level_4!,
      vip_pin_price_level_5:
        Number(cfg.vip_pin_price_level_5) || def.vip_pin_price_level_5!,
      banner_display_price:
        Number(cfg.banner_display_price) || def.banner_display_price!,
      banner_design_price:
        Number(cfg.banner_design_price) || def.banner_design_price!,
      updated_at: new Date().toISOString(),
    };
    await runInInjectionContext(this.injector, () =>
      setDoc(this.ref, payload, { merge: true })
    );
  }

  async updateConfig(patch: Partial<SubscriptionsConfig>): Promise<void> {
    const cur = await this.getConfig();
    const next: SubscriptionsConfig = {
      ...cur,
      ...patch,
      plans: patch.plans ?? cur.plans,
      addons_html:
        patch.addons_html !== undefined ? patch.addons_html : cur.addons_html,
    };
    await this.saveFullConfig(next);
  }

  async addPlan(plan: SubscriptionPlan): Promise<void> {
    const cur = await this.getConfig();
    const exists = cur.plans.some((p) => p.id === plan.id);
    const nextPlans = exists ? cur.plans : [...cur.plans, plan];
    await this.saveFullConfig({ ...cur, plans: nextPlans });
  }

  async updatePlan(plan: SubscriptionPlan): Promise<void> {
    const cur = await this.getConfig();
    const idx = cur.plans.findIndex((p) => p.id === plan.id);
    const nextPlans =
      idx >= 0
        ? cur.plans.map((p, i) => (i === idx ? { ...plan } : p))
        : [...cur.plans, plan];
    await this.saveFullConfig({ ...cur, plans: nextPlans });
  }

  async deletePlan(planId: string): Promise<void> {
    const cur = await this.getConfig();
    await this.saveFullConfig({
      ...cur,
      plans: cur.plans.filter((p) => p.id !== planId),
    });
  }

  async reorderPlans(plans: SubscriptionPlan[]): Promise<void> {
    const cur = await this.getConfig();
    await this.saveFullConfig({ ...cur, plans: [...plans] });
  }

  /** تهيئة أول مرة إذا لم يوجد المستند */
  async ensureDocExists(): Promise<void> {
    const snap = await runInInjectionContext(this.injector, () =>
      getDoc(this.ref)
    );
    if (!snap.exists()) {
      await runInInjectionContext(this.injector, () =>
        setDoc(this.ref, {
          ...DEFAULT_SUBSCRIPTIONS_CONFIG,
          plans: [],
          updated_at: new Date().toISOString(),
        })
      );
    }
  }

  async createDraftPlan(): Promise<SubscriptionPlan> {
    const cur = await this.getConfig();
    const maxOrder = cur.plans.reduce((m, p) => Math.max(m, p.order), 0);
    return { ...newEmptyPlan(), order: maxOrder + 10 };
  }
}
