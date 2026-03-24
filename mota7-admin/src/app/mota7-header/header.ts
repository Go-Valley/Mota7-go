import { Component, Input, Output, EventEmitter } from '@angular/core';
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
  
  @Output() backClick = new EventEmitter<void>();

  goBack() {
    this.backClick.emit();
  }
}