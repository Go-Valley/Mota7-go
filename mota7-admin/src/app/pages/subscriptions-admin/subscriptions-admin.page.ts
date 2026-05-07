import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonicModule,
  ItemReorderEventDetail,
  LoadingController,
  NavController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chevronBackOutline,
  createOutline,
  layersOutline,
  saveOutline,
  trashOutline,
  eyeOutline,
  eyeOffOutline,
  reorderThreeOutline,
} from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { SubscriptionService } from '../../services/subscription.service';
import {
  DEFAULT_SUBSCRIPTIONS_CONFIG,
  SubscriptionPlan,
  SubscriptionPlanTier,
  SubscriptionsConfig,
  sortPlansForDisplay,
} from '../../core/models/subscriptions-config.model';

@Component({
  selector: 'app-subscriptions-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, Mota7HeaderComponent],
  templateUrl: './subscriptions-admin.page.html',
  styleUrls: ['./subscriptions-admin.page.scss'],
})
export class SubscriptionsAdminPage implements OnInit {
  private readonly subService = inject(SubscriptionService);
  private readonly navCtrl = inject(NavController);
  private readonly toastCtrl = inject(ToastController);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly alertCtrl = inject(AlertController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  config: SubscriptionsConfig = { ...DEFAULT_SUBSCRIPTIONS_CONFIG };

  editOpen = false;
  draft: SubscriptionPlan | null = null;
  includedText = '';
  excludedText = '';

  tierOptions: { v: SubscriptionPlanTier; l: string }[] = [
    { v: 'trial', l: 'تجربة (Trial)' },
    { v: 'bronze', l: 'برونزي' },
    { v: 'silver', l: 'فضي' },
    { v: 'gold', l: 'ذهبي' },
    { v: 'diamond', l: 'ماسي' },
    { v: 'slate', l: 'محايد / رمادي' },
  ];

  constructor() {
    addIcons({
      addOutline,
      createOutline,
      trashOutline,
      saveOutline,
      layersOutline,
      'chevron-back-outline': chevronBackOutline,
      reorderThreeOutline,
      eyeOutline,
      eyeOffOutline,
    });
  }

  ngOnInit(): void {
    void this.subService.ensureDocExists();
    this.subService
      .watchConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => {
        this.config = c;
        this.cdr.markForCheck();
      });
  }

  get sortedPlans(): SubscriptionPlan[] {
    return sortPlansForDisplay([...this.config.plans]);
  }

  goBack(): void {
    void this.navCtrl.navigateBack(['/dashboard']);
  }

  private async toast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message: msg,
      duration: 2200,
      position: 'bottom',
      mode: 'ios',
    });
    await t.present();
  }

  async saveGlobals(): Promise<void> {
    const loader = await this.loadingCtrl.create({ message: 'جاري الحفظ...' });
    await loader.present();
    try {
      await this.subService.saveFullConfig({ ...this.config });
      await this.toast('تم حفظ الإعدادات العامة');
    } catch (e) {
      console.error('saveGlobals', e);
      const hint =
        e && typeof e === 'object' && 'message' in e
          ? ` (${String((e as { message?: string }).message).slice(0, 120)})`
          : '';
      await this.toast(`تعذر الحفظ — تحقق من الصلاحيات أو الحقول${hint}`);
    } finally {
      await loader.dismiss();
    }
  }

  async onReorder(ev: CustomEvent<ItemReorderEventDetail>): Promise<void> {
    const list = sortPlansForDisplay([...this.config.plans]);
    const moved = list.splice(ev.detail.from, 1)[0];
    list.splice(ev.detail.to, 0, moved);
    ev.detail.complete(true);
    list.forEach((p, i) => {
      p.order = (i + 1) * 10;
    });
    try {
      await this.subService.reorderPlans(list);
      await this.toast('تم تحديث الترتيب');
    } catch {
      await this.toast('تعذر حفظ الترتيب');
    }
  }

  async addPlan(): Promise<void> {
    const draft = await this.subService.createDraftPlan();
    this.draft = draft;
    this.includedText = '';
    this.excludedText = '';
    this.editOpen = true;
    this.cdr.markForCheck();
  }

  editPlan(p: SubscriptionPlan): void {
    this.draft = {
      ...p,
      tier: p.tier ?? 'slate',
      max_allowed_ads: p.max_allowed_ads,
      includedFeatures: [...p.includedFeatures],
      excludedFeatures: [...p.excludedFeatures],
    };
    this.includedText = p.includedFeatures.join('\n');
    this.excludedText = p.excludedFeatures.join('\n');
    this.editOpen = true;
  }

  closeEdit(): void {
    this.editOpen = false;
    this.draft = null;
  }

  async saveDraftPlan(): Promise<void> {
    if (!this.draft) {
      return;
    }
    const loader = await this.loadingCtrl.create({ message: 'جاري الحفظ...' });
    await loader.present();
    try {
      const d = this.draft;
      const rawMax = d.max_allowed_ads as unknown;
      if (rawMax === '' || rawMax === null || rawMax === undefined) {
        d.max_allowed_ads = undefined;
      } else {
        const n = Number(rawMax);
        d.max_allowed_ads =
          Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
      }
      d.includedFeatures = this.includedText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      d.excludedFeatures = this.excludedText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!d.name.trim()) {
        await this.toast('أدخل اسم الباقة');
        await loader.dismiss();
        return;
      }
      await this.subService.updatePlan(d);
      this.closeEdit();
      await this.toast('تم حفظ الباقة');
    } catch {
      await this.toast('تعذر حفظ الباقة');
    } finally {
      await loader.dismiss();
    }
  }

  async togglePlanVisible(p: SubscriptionPlan): Promise<void> {
    const next = { ...p, visible: !p.visible };
    try {
      await this.subService.updatePlan(next);
      await this.toast(next.visible ? 'ظاهرة للمستخدمين' : 'مخفية عن المستخدمين');
    } catch {
      await this.toast('تعذر التحديث');
    }
  }

  async confirmDelete(p: SubscriptionPlan): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'حذف الباقة',
      message: `حذف «${p.name}» نهائياً من الإعدادات؟`,
      mode: 'ios',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: () => {
            void this.runDelete(p.id);
          },
        },
      ],
    });
    await alert.present();
  }

  private async runDelete(id: string): Promise<void> {
    try {
      await this.subService.deletePlan(id);
      await this.toast('تم الحذف');
    } catch {
      await this.toast('تعذر الحذف');
    }
  }
}
