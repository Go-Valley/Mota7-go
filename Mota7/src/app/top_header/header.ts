import { Component, Input, Output, EventEmitter } from '@angular/core'; // أضفنا Output و EventEmitter
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-mota7-header',
  templateUrl: './header.html',
  styleUrls: ['./header.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class Mota7HeaderComponent {
  @Input() title: string = '';
  @Input() showBackButton: boolean = true;
  
  // ننشئ حدث جديد باسم backClick
  @Output() backClick = new EventEmitter<void>();

  goBack() {
    // بدلاً من navCtrl.back()، سنرسل إشارة للصفحة الأم
    this.backClick.emit();
  }
}