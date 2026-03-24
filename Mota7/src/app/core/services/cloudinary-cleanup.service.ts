import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { environment } from '../../../environments/environment';

/**
 * حذف أصول Cloudinary عبر وسيط HTTP (Render/Railway/VPS) يتحقق من Firebase ID token.
 * لا يعتمد على Cloud Functions (Blaze). عيّن environment.cloudinaryDeleteProxyUrl بعد نشر الوسيط.
 */
@Injectable({ providedIn: 'root' })
export class CloudinaryCleanupService {
  private readonly auth = inject(Auth);

  async deletePublicIds(publicIds: string[]): Promise<void> {
    const unique = [...new Set(publicIds.map((s) => String(s || '').trim()).filter(Boolean))];
    if (!unique.length) {
      return;
    }

    const base = environment.cloudinaryDeleteProxyUrl?.trim();
    if (!base) {
      return;
    }

    const user = this.auth.currentUser;
    if (!user) {
      return;
    }

    let token: string;
    try {
      token = await user.getIdToken();
    } catch {
      return;
    }

    const url = `${base.replace(/\/$/, '')}/delete`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicIds: unique }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.warn('[cloudinary delete proxy]', res.status, t);
      }
    } catch (e) {
      console.warn('[cloudinary delete proxy]', e);
    }
  }
}
