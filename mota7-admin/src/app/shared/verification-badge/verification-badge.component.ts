import { CommonModule } from '@angular/common';
import { Component, Input, inject, DOCUMENT } from '@angular/core';
import {
  effectiveTierForAdFields,
  verificationBadgeAssetPath,
} from '../../core/utils/verification-tiers.util';

@Component({
  selector: 'app-verification-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verification-badge.component.html',
  styleUrls: ['./verification-badge.component.scss'],
})
export class VerificationBadgeComponent {
  private readonly document = inject(DOCUMENT);

  @Input() tier: string | null | undefined;
  @Input() verified: string | null | undefined;
  @Input() validFrom: unknown;
  @Input() validUntil: unknown;

  resolvedHref(): string | null {
    const eff = effectiveTierForAdFields(
      this.tier,
      this.verified ?? this.tier,
      this.validFrom,
      this.validUntil
    );
    const rel = verificationBadgeAssetPath(eff);
    if (!rel) {
      return null;
    }
    try {
      const base = this.document.baseURI || '/';
      return new URL(rel, base).href;
    } catch {
      return rel;
    }
  }
}
