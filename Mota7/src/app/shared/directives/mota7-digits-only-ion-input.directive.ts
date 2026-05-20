import {
  AfterViewInit,
  Directive,
  HostListener,
  Input,
  inject,
} from '@angular/core';
import { IonInput } from '@ionic/angular';
import {
  applyMota7DigitsOnlyNativeKeyboard,
  blockDigitsOnlyBeforeInput,
  blockDigitsOnlyKeyDown,
  type Mota7DigitsOnlyInputMode,
} from '../../core/utils/mota7-digits-only-input.util';
import { ORDER_PHONE_DIGITS_ONLY_MSG } from '../../core/utils/egyptian-phone-order.util';

/**
 * حقول الهاتف والمبلغ: لوحة أرقام على الموبايل + منع الحروف أثناء الكتابة.
 * يُكمّل مع (ngModelChange) / applyOrderPhoneInputState في المكوّن الأب.
 */
@Directive({
  selector: 'ion-input[mota7DigitsOnly]',
  standalone: true,
})
export class Mota7DigitsOnlyIonInputDirective implements AfterViewInit {
  private readonly ionInput = inject(IonInput, { host: true });

  @Input('mota7DigitsOnly') mode: Mota7DigitsOnlyInputMode = 'phone';

  /** اختياري: تحذير فوري تحت الحقل عند محاولة كتابة حرف */
  @Input() mota7DigitsOnlyOnWarn?: (message: string) => void;

  async ngAfterViewInit(): Promise<void> {
    await this.applyNativeKeyboard();
  }

  @HostListener('ionFocus')
  async onIonFocus(): Promise<void> {
    await this.applyNativeKeyboard();
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    blockDigitsOnlyKeyDown(ev, () => this.emitWarn());
  }

  @HostListener('beforeinput', ['$event'])
  onBeforeInput(ev: InputEvent): void {
    blockDigitsOnlyBeforeInput(ev, () => this.emitWarn());
  }

  private async applyNativeKeyboard(): Promise<void> {
    await applyMota7DigitsOnlyNativeKeyboard(this.ionInput, this.mode);
  }

  private emitWarn(): void {
    this.mota7DigitsOnlyOnWarn?.(ORDER_PHONE_DIGITS_ONLY_MSG);
  }
}
