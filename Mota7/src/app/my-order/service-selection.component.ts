import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-service-selection',
  templateUrl: './service-selection.component.html',
  styleUrls: ['./service-selection.component.scss'],
  standalone: false
})
export class ServiceSelectionComponent implements OnInit {

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {}

  openServiceForm(category: 'delivery' | 'education' | 'other') {
    this.modalCtrl.dismiss({
      selectedCategory: category
    }, 'confirm');
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}