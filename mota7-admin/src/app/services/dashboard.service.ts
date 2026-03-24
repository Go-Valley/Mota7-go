import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  constructor(private firestore: Firestore) {}

  // جلب إجمالي عدد المستخدمين
  getUsersCount(): Observable<number> {
    const usersCol = collection(this.firestore, 'users');
    return collectionData(usersCol).pipe(
      map(users => users.length)
    );
  }

  // جلب إجمالي عدد الإعلانات
  getAdsCount(): Observable<number> {
    const adsCol = collection(this.firestore, 'ads');
    return collectionData(adsCol).pipe(
      map(ads => ads.length)
    );
  }
}