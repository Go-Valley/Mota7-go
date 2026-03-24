import { inject, Injectable } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, shareReplay } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  // بنحقن مكتبة الفايربيز عشان نستخدمها
  private firestore = inject(Firestore);

  constructor() {}

  // دالة لجلب المستخدمين من الفايربيز
  getUsers(): Observable<any[]> {
    const userCol = collection(this.firestore, 'users');
    return collectionData(userCol, { idField: 'id' }).pipe(
      shareReplay(1)
    );
  }
}