import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, collection, collectionData, doc, getDoc, query, where, orderBy } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Governorate, City, GovernorateWithCities } from '../models/governorate.model';
import { FirestoreCacheService } from './firestore-cache.service';

@Injectable({
  providedIn: 'root'
})
export class GovernorateService {
  private firestore = inject(Firestore);
  private cache = inject(FirestoreCacheService);
  private envInjector = inject(EnvironmentInjector);

  private readonly CACHE_KEY_GOVERNORATES = 'governorates';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * جلب جميع المحافظات النشطة مرتبة حسب الترتيب
   */
  getActiveGovernorates(): Observable<Governorate[]> {
    const cached = this.cache.get<Governorate[]>(this.CACHE_KEY_GOVERNORATES);
    const isFresh = this.cache.isFresh(this.CACHE_KEY_GOVERNORATES, this.CACHE_TTL);

    if (isFresh && cached) {
      return of(cached);
    }

    return runInInjectionContext(this.envInjector, () => {
      const q = query(
        collection(this.firestore, 'city'),
        where('active', '==', true),
        orderBy('order', 'asc')
      );

      return collectionData(q, { idField: 'id' }).pipe(
        map((data: any[]) => {
          const governorates = data as Governorate[];
          this.cache.set(this.CACHE_KEY_GOVERNORATES, governorates);
          return governorates;
        }),
        catchError((error) => {
          console.error('Error fetching governorates:', error);
          return of(cached || []);
        })
      );
    });
  }

  /**
   * جلب مدينة محافظة معينة
   */
  async getGovernorateById(id: string): Promise<Governorate | null> {
    try {
      const docSnap = await runInInjectionContext(this.envInjector, () =>
        getDoc(doc(this.firestore, 'city', id))
      );
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Governorate;
      }
      return null;
    } catch (error) {
      console.error('Error fetching governorate:', error);
      return null;
    }
  }

  /**
   * جلب المدن النشطة لمحافظة معينة مرتبة حسب الترتيب
   */
  getCitiesByGovernorate(governorateId: string): Observable<City[]> {
    const cacheKey = `cities_${governorateId}`;
    const cached = this.cache.get<City[]>(cacheKey);
    const isFresh = this.cache.isFresh(cacheKey, this.CACHE_TTL);

    if (isFresh && cached) {
      return of(cached);
    }

    return runInInjectionContext(this.envInjector, () => {
      const q = query(
        collection(this.firestore, `city/${governorateId}/cities`),
        where('active', '==', true),
        orderBy('order', 'asc')
      );

      return collectionData(q, { idField: 'id' }).pipe(
        map((data: any[]) => {
          const cities = data.map((city: any) => ({
            ...city,
            governorateId
          })) as City[];
          this.cache.set(cacheKey, cities);
          return cities;
        }),
        catchError((error) => {
          console.error('Error fetching cities:', error);
          return of(cached || []);
        })
      );
    });
  }

  /**
   * جلب جميع المحافظات مع مدنها
   */
  getGovernoratesWithCities(): Observable<GovernorateWithCities[]> {
    return this.getActiveGovernorates().pipe(
      map((governorates) => {
        return governorates as GovernorateWithCities[];
      })
    );
  }

  /**
   * جلب مدينة بالـ ID
   */
  async getCityById(governorateId: string, cityId: string): Promise<City | null> {
    try {
      const docSnap = await runInInjectionContext(this.envInjector, () => {
        const citiesRef = collection(this.firestore, `city/${governorateId}/cities`);
        return getDoc(doc(citiesRef, cityId));
      });
      if (docSnap.exists()) {
        return { id: docSnap.id, governorateId, ...docSnap.data() } as City;
      }
      return null;
    } catch (error) {
      console.error('Error fetching city:', error);
      return null;
    }
  }

  /**
   * مسح الكاش عند تغيير المحافظات/المدن
   */
  clearCache(): void {
    this.cache.remove(this.CACHE_KEY_GOVERNORATES);
  }

  invalidateGovernorateCaches(): void {
    this.clearCache();
    this.cache.invalidatePrefix('cities_');
  }
}
