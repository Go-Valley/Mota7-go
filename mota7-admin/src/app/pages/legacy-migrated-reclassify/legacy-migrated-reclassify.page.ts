import { Component, inject, Injector, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, LoadingController, ToastController, NavController } from '@ionic/angular';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { deleteField } from 'firebase/firestore';
import { addIcons } from 'ionicons';
import { refreshOutline, chevronBackOutline, informationCircleOutline } from 'ionicons/icons';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import {
  LEGACY_MIGRATED_AD_ID_PREFIX,
  planLegacyMigratedAdReclassify,
} from '../../core/utils/legacy-migrated-ads-reclassify.util';

@Component({
  selector: 'app-legacy-migrated-reclassify',
  templateUrl: './legacy-migrated-reclassify.page.html',
  styleUrls: ['./legacy-migrated-reclassify.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, Mota7HeaderComponent],
})
export class LegacyMigratedReclassifyPage {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private navCtrl = inject(NavController);

  dryRun = true;
  lastSummary: {
    scanned: number;
    updated: number;
    unchanged: number;
    skipUnresolved: number;
    skipNotMigrated: number;
  } | null = null;

  constructor() {
    addIcons({ refreshOutline, chevronBackOutline, informationCircleOutline });
  }

  goBack() {
    this.navCtrl.back();
  }

  async runReclassify() {
    const loading = await this.loadingCtrl.create({
      message: this.dryRun ? 'جاري المحاكاة…' : 'جاري التحديث…',
    });
    await loading.present();

    const summary = {
      scanned: 0,
      updated: 0,
      unchanged: 0,
      skipUnresolved: 0,
      skipNotMigrated: 0,
    };

    try {
      await runInInjectionContext(this.injector, async () => {
        const high = `${LEGACY_MIGRATED_AD_ID_PREFIX}\uf8ff`;
        const q = query(
          collection(this.firestore, 'ads'),
          where('ad_id', '>=', LEGACY_MIGRATED_AD_ID_PREFIX),
          where('ad_id', '<=', high)
        );
        const snap = await getDocs(q);

        let batch = writeBatch(this.firestore);
        let opsInBatch = 0;

        for (const d of snap.docs) {
          summary.scanned++;
          const data = d.data() as Record<string, unknown>;
          const plan = planLegacyMigratedAdReclassify(data);

          if (plan.status === 'skip_not_migrated') {
            summary.skipNotMigrated++;
            continue;
          }
          if (plan.status === 'skip_unresolved') {
            summary.skipUnresolved++;
            continue;
          }
          if (plan.status === 'unchanged') {
            summary.unchanged++;
            continue;
          }

          summary.updated++;
          if (this.dryRun) {
            continue;
          }

          const ref = doc(this.firestore, 'ads', d.id);
          const base = {
            category_id: plan.category_id,
            ad_type: plan.ad_type,
            updated_at: serverTimestamp(),
          };
          const payload =
            plan.ad_type === 'delivery'
              ? {
                  ...base,
                  delivery_match_key: plan.matchKeyValue,
                  other_match_key: deleteField(),
                }
              : {
                  ...base,
                  other_match_key: plan.matchKeyValue,
                  delivery_match_key: deleteField(),
                };

          batch.update(ref, payload as Record<string, unknown>);
          opsInBatch++;
          if (opsInBatch >= 500) {
            await batch.commit();
            batch = writeBatch(this.firestore);
            opsInBatch = 0;
          }
        }

        if (!this.dryRun && opsInBatch > 0) {
          await batch.commit();
        }
      });

      this.lastSummary = summary;
      const msg = this.dryRun
        ? `محاكاة: ${summary.updated} إعلان سيُحدَّث، ${summary.unchanged} بدون تغيير، ${summary.skipUnresolved} بدون بيانات كافية`
        : `تم تحديث ${summary.updated} إعلاناً`;
      await this.toast(msg, this.dryRun ? 'primary' : 'success');
    } catch (e) {
      console.error(e);
      await this.toast('فشل التنفيذ — راجع وحدة التحكم أو فهرس Firestore', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  private async toast(message: string, color: string) {
    const t = await this.toastCtrl.create({ message, duration: 4500, color, position: 'top' });
    await t.present();
  }
}
