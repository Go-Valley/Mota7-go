import { Component, OnInit, inject, EnvironmentInjector, ChangeDetectorRef, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ActionSheetController,
  NavController,
  ToastController,
  AlertController,
} from '@ionic/angular';
import {
  Firestore,
  collection,
  doc,
  deleteDoc,
  updateDoc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  addOutline,
  createOutline,
  trashOutline,
  eyeOutline,
  eyeOffOutline,
  chevronDownOutline,
  chevronUpOutline,
  saveOutline,
  closeOutline,
} from 'ionicons/icons';

interface Governorate {
  id: string;
  name: string;
  active: boolean;
  order: number;
  createdAt: Timestamp;
}

interface City {
  id: string;
  governorateId: string;
  name: string;
  active: boolean;
  order: number;
  createdAt: Timestamp;
}

@Component({
  selector: 'app-governorates',
  templateUrl: './governorates.page.html',
  styleUrls: ['./governorates.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, Mota7HeaderComponent, FormsModule]
})
export class GovernoratesPage implements OnInit {
  private firestore = inject(Firestore);
  private envInjector = inject(EnvironmentInjector);
  private actionSheetCtrl = inject(ActionSheetController);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);

  governorates: Governorate[] = [];
  cities: Map<string, City[]> = new Map();
  expandedGovernorates: Set<string> = new Set();

  // Form data
  editingGovernorate: Governorate = {
    id: '',
    name: '',
    active: true,
    order: 0,
    createdAt: Timestamp.now()
  };
  editingCity: City = {
    id: '',
    governorateId: '',
    name: '',
    active: true,
    order: 0,
    createdAt: Timestamp.now()
  };
  showGovernorateForm = false;
  showCityForm = false;

  constructor() {
    addIcons({
      'location-outline': locationOutline,
      'add-outline': addOutline,
      'create-outline': createOutline,
      'trash-outline': trashOutline,
      'eye-outline': eyeOutline,
      'eye-off-outline': eyeOffOutline,
      'chevron-down-outline': chevronDownOutline,
      'chevron-up-outline': chevronUpOutline,
      'save-outline': saveOutline,
      'close-outline': closeOutline
    });
  }

  ngOnInit() {
    this.loadGovernorates();
  }

  private loadGovernorates() {
    runInInjectionContext(this.envInjector, () => {
      const q = query(
        collection(this.firestore, 'city'),
        orderBy('order', 'asc')
      );

      onSnapshot(q, (snapshot) => {
        runInInjectionContext(this.envInjector, () => {
          this.governorates = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Governorate));

          // Load cities for each governorate
          this.governorates.forEach(gov => {
            this.loadCities(gov.id);
          });

          this.cdr.detectChanges();
        });
      });
    });
  }

  private loadCities(governorateId: string) {
    runInInjectionContext(this.envInjector, () => {
      const citiesColRef = collection(this.firestore, `city/${governorateId}/cities`);
      const q = query(citiesColRef, orderBy('order', 'asc'));

      onSnapshot(q, (snapshot) => {
        runInInjectionContext(this.envInjector, () => {
          const cities = snapshot.docs.map(doc => ({
            id: doc.id,
            governorateId,
            ...doc.data()
          } as City));
          this.cities.set(governorateId, cities);
          this.cdr.detectChanges();
        });
      });
    });
  }

  toggleGovernorate(governorateId: string) {
    if (this.expandedGovernorates.has(governorateId)) {
      this.expandedGovernorates.delete(governorateId);
    } else {
      this.expandedGovernorates.add(governorateId);
    }
    this.expandedGovernorates = new Set(this.expandedGovernorates);
  }

  // Governorate actions
  async addGovernorate() {
    this.editingGovernorate = {
      id: '',
      name: '',
      active: true,
      order: this.governorates.length + 1,
      createdAt: Timestamp.now()
    };
    this.showGovernorateForm = true;
  }

  async editGovernorate(governorate: Governorate) {
    this.editingGovernorate = { ...governorate };
    this.showGovernorateForm = true;
  }

  async saveGovernorate() {
    if (!this.editingGovernorate || !this.editingGovernorate.name.trim()) {
      this.showToast('يرجى إدخال اسم المحافظة');
      return;
    }

    try {
      const data = {
        name: this.editingGovernorate.name.trim(),
        active: this.editingGovernorate.active,
        order: this.editingGovernorate.order,
        createdAt: this.editingGovernorate.createdAt || Timestamp.now()
      };

      if (this.editingGovernorate.id) {
        // Update existing
        await updateDoc(doc(this.firestore, 'city', this.editingGovernorate.id), data);
        this.showToast('تم تحديث المحافظة بنجاح');
      } else {
        // Create new
        const newId = this.generateEnglishId(this.editingGovernorate.name);
        await setDoc(doc(this.firestore, 'city', newId), data);
        this.showToast('تم إضافة المحافظة بنجاح');
      }

      this.showGovernorateForm = false;
      this.editingGovernorate = {
        id: '',
        name: '',
        active: true,
        order: 0,
        createdAt: Timestamp.now()
      };
    } catch (error) {
      console.error('Error saving governorate:', error);
      this.showToast('حدث خطأ أثناء الحفظ');
    }
  }

  async toggleGovernorateActive(governorate: Governorate) {
    try {
      await updateDoc(doc(this.firestore, 'city', governorate.id), {
        active: !governorate.active
      });
      this.showToast(governorate.active ? 'تم إخفاء المحافظة' : 'تم إظهار المحافظة');
    } catch (error) {
      console.error('Error toggling governorate:', error);
      this.showToast('حدث خطأ أثناء التحديث');
    }
  }

  async deleteGovernorate(governorate: Governorate) {
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: `هل أنت متأكد من حذف محافظة "${governorate.name}"؟ سيتم حذف جميع cities التابعة لها.`,
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: async () => {
            try {
              // Delete all cities first
              const cities = this.cities.get(governorate.id) || [];
              for (const city of cities) {
                await deleteDoc(doc(this.firestore, `city/${governorate.id}/cities`, city.id));
              }
              // Delete governorate
              await deleteDoc(doc(this.firestore, 'city', governorate.id));
              this.showToast('تم حذف المحافظة ومدنها بنجاح');
            } catch (error) {
              console.error('Error deleting governorate:', error);
              this.showToast('حدث خطأ أثناء الحذف');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  // City actions
  async addCity(governorateId: string) {
    const cities = this.cities.get(governorateId) || [];
    this.editingCity = {
      id: '',
      governorateId,
      name: '',
      active: true,
      order: cities.length + 1,
      createdAt: Timestamp.now()
    };
    this.showCityForm = true;
  }

  async editCity(city: City) {
    this.editingCity = { ...city };
    this.showCityForm = true;
  }

  async saveCity() {
    if (!this.editingCity || !this.editingCity.name.trim()) {
      this.showToast('يرجى إدخال اسم المدينة');
      return;
    }

    try {
      const data = {
        name: this.editingCity.name.trim(),
        active: this.editingCity.active,
        order: this.editingCity.order,
        createdAt: this.editingCity.createdAt || Timestamp.now()
      };

      if (this.editingCity.id) {
        // Update existing
        await updateDoc(
          doc(this.firestore, `city/${this.editingCity.governorateId}/cities`, this.editingCity.id),
          data
        );
        this.showToast('تم تحديث المدينة بنجاح');
      } else {
        // Create new
        const newId = this.generateEnglishId(this.editingCity.name);
        await setDoc(
          doc(this.firestore, `city/${this.editingCity.governorateId}/cities`, newId),
          data
        );
        this.showToast('تم إضافة المدينة بنجاح');
      }

      this.showCityForm = false;
      this.editingCity = {
        id: '',
        governorateId: '',
        name: '',
        active: true,
        order: 0,
        createdAt: Timestamp.now()
      };
    } catch (error) {
      console.error('Error saving city:', error);
      this.showToast('حدث خطأ أثناء الحفظ');
    }
  }

  async toggleCityActive(city: City) {
    try {
      await updateDoc(
        doc(this.firestore, `city/${city.governorateId}/cities`, city.id),
        { active: !city.active }
      );
      this.showToast(city.active ? 'تم إخفاء المدينة' : 'تم إظهار المدينة');
    } catch (error) {
      console.error('Error toggling city:', error);
      this.showToast('حدث خطأ أثناء التحديث');
    }
  }

  async deleteCity(city: City) {
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الحذف',
      message: `هل أنت متأكد من حذف مدينة "${city.name}"؟`,
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'حذف',
          role: 'destructive',
          handler: async () => {
            try {
              await deleteDoc(doc(this.firestore, `city/${city.governorateId}/cities`, city.id));
              this.showToast('تم حذف المدينة بنجاح');
            } catch (error) {
              console.error('Error deleting city:', error);
              this.showToast('حدث خطأ أثناء الحذف');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  // Reorder
  async moveGovernorateUp(index: number) {
    if (index === 0) return;
    const temp = this.governorates[index].order;
    this.governorates[index].order = this.governorates[index - 1].order;
    this.governorates[index - 1].order = temp;

    await this.saveGovernorateOrder(this.governorates[index]);
    await this.saveGovernorateOrder(this.governorates[index - 1]);
  }

  async moveGovernorateDown(index: number) {
    if (index === this.governorates.length - 1) return;
    const temp = this.governorates[index].order;
    this.governorates[index].order = this.governorates[index + 1].order;
    this.governorates[index + 1].order = temp;

    await this.saveGovernorateOrder(this.governorates[index]);
    await this.saveGovernorateOrder(this.governorates[index + 1]);
  }

  async saveGovernorateOrder(governorate: Governorate) {
    await updateDoc(doc(this.firestore, 'city', governorate.id), { order: governorate.order });
  }

  async moveCityUp(governorateId: string, index: number) {
    const cities = this.cities.get(governorateId);
    if (!cities || index === 0) return;
    const temp = cities[index].order;
    cities[index].order = cities[index - 1].order;
    cities[index - 1].order = temp;

    await this.saveCityOrder(cities[index]);
    await this.saveCityOrder(cities[index - 1]);
  }

  async moveCityDown(governorateId: string, index: number) {
    const cities = this.cities.get(governorateId);
    if (!cities || index === cities.length - 1) return;
    const temp = cities[index].order;
    cities[index].order = cities[index + 1].order;
    cities[index + 1].order = temp;

    await this.saveCityOrder(cities[index]);
    await this.saveCityOrder(cities[index + 1]);
  }

  async saveCityOrder(city: City) {
    await updateDoc(
      doc(this.firestore, `city/${city.governorateId}/cities`, city.id),
      { order: city.order }
    );
  }

  // Utility
  private generateEnglishId(arabicName: string): string {
    // Simple transliteration - you might want to improve this
    const map: Record<string, string> = {
      'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa',
      'ب': 'b', 'ت': 't', 'ث': 'th',
      'ج': 'j', 'ح': 'h', 'خ': 'kh',
      'د': 'd', 'ذ': 'dh', 'ر': 'r',
      'ز': 'z', 'س': 's', 'ش': 'sh',
      'ص': 's', 'ض': 'd', 'ط': 't',
      'ظ': 'z', 'ع': 'a', 'غ': 'gh',
      'ف': 'f', 'ق': 'q', 'ك': 'k',
      'ل': 'l', 'م': 'm', 'ن': 'n',
      'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
      ' ': '_', 'ة': 'a'
    };

    let id = arabicName.toLowerCase().split('').map(char => map[char] || char).join('');
    return id.replace(/[^a-z0-9_]/g, '');
  }

  getCities(governorateId: string): City[] {
    return this.cities.get(governorateId) || [];
  }

  cancelGovernorateForm() {
    this.showGovernorateForm = false;
    this.editingGovernorate = {
      id: '',
      name: '',
      active: true,
      order: 0,
      createdAt: Timestamp.now()
    };
  }

  cancelCityForm() {
    this.showCityForm = false;
    this.editingCity = {
      id: '',
      governorateId: '',
      name: '',
      active: true,
      order: 0,
      createdAt: Timestamp.now()
    };
  }

  goBack() {
    this.navCtrl.navigateBack('/dashboard');
  }

  async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000
    });
    await toast.present();
  }

  // Seed functionality
  private governoratesSeedData = [
    {
      id: 'cairo',
      name: 'محافظة القاهرة',
      active: true,
      order: 1,
      cities: [
        { id: 'nasr_city', name: 'مدينة نصر', order: 1 },
        { id: 'new_cairo', name: 'مصر الجديدة', order: 2 },
        { id: 'maadi', name: 'المعادي', order: 3 },
        { id: 'helwan', name: 'حلوان', order: 4 },
        { id: 'shubra', name: 'شبرا', order: 5 },
        { id: 'new_cairo_city', name: 'القاهرة الجديدة', order: 6 },
        { id: 'fifth_settlement', name: 'التجمع الخامس', order: 7 },
        { id: 'ain_shams', name: 'عين شمس', order: 8 },
        { id: 'mataria', name: 'المطرية', order: 9 },
        { id: 'zeitoun', name: 'الزيتون', order: 10 },
        { id: 'merge', name: 'المرج', order: 11 },
        { id: 'salam', name: 'السلام', order: 12 },
        { id: 'sahel', name: 'الساحل', order: 13 },
        { id: 'za_hamra', name: 'الزاوية الحمراء', order: 14 },
        { id: 'bassatin', name: 'البساتين', order: 15 },
        { id: 'dar_salam', name: 'دار السلام', order: 16 },
        { id: 'mokattam', name: 'المقطم', order: 17 },
        { id: 'downtown', name: 'وسط البلد', order: 18 },
        { id: 'zamalek', name: 'الزمالك', order: 19 }
      ]
    },
    {
      id: 'giza',
      name: 'محافظة الجيزة',
      active: true,
      order: 2,
      cities: [
        { id: 'giza_city', name: 'الجيزة', order: 1 },
        { id: 'october', name: '6 أكتوبر', order: 2 },
        { id: 'sheikh_zayed', name: 'الشيخ زايد', order: 3 },
        { id: 'dokki', name: 'الدقي', order: 4 },
        { id: 'giza_pyramids', name: 'الهرم', order: 5 },
        { id: 'bolak', name: 'بولاق الدكرور', order: 6 },
        { id: 'faisal', name: 'فيصل', order: 7 },
        { id: 'embaba', name: 'إمبابة', order: 8 },
        { id: 'agouza', name: 'العجوزة', order: 9 },
        { id: 'kerdasa', name: 'كرداسة', order: 10 },
        { id: 'saft', name: 'الصف', order: 11 },
        { id: 'atfih', name: 'أطفيح', order: 12 },
        { id: 'bahariya', name: 'الواحات البحرية', order: 13 },
        { id: 'badrashin', name: 'البدرشين', order: 14 },
        { id: 'abu_nomros', name: 'أبو النمرس', order: 15 }
      ]
    },
    {
      id: 'alexandria',
      name: 'محافظة الإسكندرية',
      active: true,
      order: 3,
      cities: [
        { id: 'alexandria_city', name: 'الإسكندرية', order: 1 },
        { id: 'borg_el_arab', name: 'برج العرب', order: 2 },
        { id: 'ajami', name: 'العجمي', order: 3 },
        { id: 'miami', name: 'ميامي', order: 4 },
        { id: 'sidi_bishr', name: 'سيدي بشر', order: 5 },
        { id: 'montaza', name: 'المنتزه', order: 6 },
        { id: 'smouha', name: 'سموحة', order: 7 },
        { id: 'moharam_bek', name: 'محرم بك', order: 8 },
        { id: 'asafra', name: 'العصافرة', order: 9 },
        { id: 'abu_qir', name: 'أبو قير', order: 10 },
        { id: 'amriya', name: 'العامرية', order: 11 }
      ]
    },
    {
      id: 'new_valley',
      name: 'محافظة الوادي الجديد',
      active: true,
      order: 4,
      cities: [
        { id: 'kharga', name: 'الخارجة', order: 1 },
        { id: 'dakhla', name: 'الداخلة', order: 2 },
        { id: 'farafra', name: 'الفرافرة', order: 3 },
        { id: 'paris', name: 'باريس', order: 4 },
        { id: 'balat', name: 'بلاط', order: 5 }
      ]
    },
    {
      id: 'assiut',
      name: 'محافظة أسيوط',
      active: true,
      order: 5,
      cities: [
        { id: 'assiut_city', name: 'أسيوط', order: 1 },
        { id: 'assiut_new', name: 'أسيوط الجديدة', order: 2 },
        { id: 'dirout', name: 'ديروط', order: 3 },
        { id: 'qusiya', name: 'القوصية', order: 4 },
        { id: 'manflout', name: 'منفلوط', order: 5 },
        { id: 'abnub', name: 'أبنوب', order: 6 },
        { id: 'elfath', name: 'الفتح', order: 7 },
        { id: 'sahel_selim', name: 'ساحل سليم', order: 8 },
        { id: 'el_badari', name: 'البداري', order: 9 },
        { id: 'sodfa', name: 'صدفا', order: 10 },
        { id: 'abu_tig', name: 'أبو تيج', order: 11 },
        { id: 'el_ghannam', name: 'الغنايم', order: 12 }
      ]
    },
    {
      id: 'sohag',
      name: 'محافظة سوهاج',
      active: true,
      order: 6,
      cities: [
        { id: 'sohag_city', name: 'سوهاج', order: 1 },
        { id: 'akhmim', name: 'أخميم', order: 2 },
        { id: 'balina', name: 'البلينا', order: 3 },
        { id: 'girga', name: 'جرجا', order: 4 },
        { id: 'juhaina', name: 'جهينة', order: 5 },
        { id: 'dar_salah', name: 'دار السلام', order: 6 },
        { id: 'maragha', name: 'المراغة', order: 7 },
        { id: 'munsha', name: 'المنشأة', order: 8 },
        { id: 'sakulta', name: 'ساقلتة', order: 9 },
        { id: 'tahta', name: 'طهطا', order: 10 },
        { id: 'tama', name: 'طما', order: 11 }
      ]
    },
    {
      id: 'qena',
      name: 'محافظة قنا',
      active: true,
      order: 7,
      cities: [
        { id: 'qena_city', name: 'قنا', order: 1 },
        { id: 'qus', name: 'قوص', order: 2 },
        { id: 'naqada', name: 'نقادة', order: 3 },
        { id: 'dishna', name: 'دشنا', order: 4 },
        { id: 'naga_hammadi', name: 'نجع حمادي', order: 5 },
        { id: 'waqf', name: 'الوقف', order: 6 },
        { id: 'farshout', name: 'فرشوط', order: 7 },
        { id: 'abu_tesht', name: 'أبو تشت', order: 8 }
      ]
    },
    {
      id: 'luxor',
      name: 'محافظة الأقصر',
      active: true,
      order: 8,
      cities: [
        { id: 'luxor_city', name: 'الأقصر', order: 1 },
        { id: 'esna', name: 'إسنا', order: 2 },
        { id: 'armant', name: 'أرمنت', order: 3 },
        { id: 'qurna', name: 'القرنة', order: 4 },
        { id: 'bayadiya', name: 'البياضية', order: 5 },
        { id: 'tiba_new', name: 'طيبة الجديدة', order: 6 }
      ]
    },
    {
      id: 'aswan',
      name: 'محافظة أسوان',
      active: true,
      order: 9,
      cities: [
        { id: 'aswan_city', name: 'أسوان', order: 1 },
        { id: 'edfu', name: 'إدفو', order: 2 },
        { id: 'kom_ombo', name: 'كوم أمبو', order: 3 },
        { id: 'daraw', name: 'دراو', order: 4 },
        { id: 'abu_simbel', name: 'أبو سمبل', order: 5 },
        { id: 'nasr_nubia', name: 'نصر النوبة', order: 6 }
      ]
    },
    {
      id: 'red_sea',
      name: 'محافظة البحر الأحمر',
      active: true,
      order: 10,
      cities: [
        { id: 'hurghada', name: 'الغردقة', order: 1 },
        { id: 'safaga', name: 'سفاجا', order: 2 },
        { id: 'qusayr', name: 'القصير', order: 3 },
        { id: 'marsa_alam', name: 'مرسى علم', order: 4 },
        { id: 'ras_gharib', name: 'رأس غارب', order: 5 },
        { id: 'shalatin', name: 'الشلاتين', order: 6 },
        { id: 'halaib', name: 'حلايب', order: 7 }
      ]
    },
    {
      id: 'north_sinai',
      name: 'محافظة شمال سيناء',
      active: true,
      order: 11,
      cities: [
        { id: 'arish', name: 'العريش', order: 1 },
        { id: 'sheikh_zuwaid', name: 'الشيخ زويد', order: 2 },
        { id: 'rafah', name: 'رفح', order: 3 },
        { id: 'bir_abd', name: 'بئر العبد', order: 4 },
        { id: 'hasana', name: 'الحسنة', order: 5 },
        { id: 'nakhl', name: 'نخل', order: 6 }
      ]
    },
    {
      id: 'south_sinai',
      name: 'محافظة جنوب سيناء',
      active: true,
      order: 12,
      cities: [
        { id: 'sharm_el_sheikh', name: 'شرم الشيخ', order: 1 },
        { id: 'dahab', name: 'دهب', order: 2 },
        { id: 'nuweiba', name: 'نويبع', order: 3 },
        { id: 'taba', name: 'طابا', order: 4 },
        { id: 'tor', name: 'الطور', order: 5 },
        { id: 'ras_sedr', name: 'رأس سدر', order: 6 },
        { id: 'saint_catherine', name: 'سانت كاترين', order: 7 },
        { id: 'abu_redis', name: 'أبو رديس', order: 8 },
        { id: 'abu_zenima', name: 'أبو زنيمة', order: 9 }
      ]
    },
    {
      id: 'sharqia',
      name: 'محافظة الشرقية',
      active: true,
      order: 13,
      cities: [
        { id: 'zagazig', name: 'الزقازيق', order: 1 },
        { id: 'tenth_ramadan', name: 'العاشر من رمضان', order: 2 },
        { id: 'belbeis', name: 'بلبيس', order: 3 },
        { id: 'minya_qamh', name: 'منيا القمح', order: 4 },
        { id: 'abu_hammad', name: 'أبو حماد', order: 5 },
        { id: 'faqus', name: 'فاقوس', order: 6 },
        { id: 'husseiniya', name: 'الحسينية', order: 7 },
        { id: 'kafr_sakr', name: 'كفر صقر', order: 8 },
        { id: 'derb_negm', name: 'ديرب نجم', order: 9 },
        { id: 'mash_tul_souk', name: 'مشتول السوق', order: 10 },
        { id: 'ibrahimiya', name: 'الإبراهيمية', order: 11 },
        { id: 'hahya', name: 'ههيا', order: 12 }
      ]
    },
    {
      id: 'dakahlia',
      name: 'محافظة الدقهلية',
      active: true,
      order: 14,
      cities: [
        { id: 'mansoura', name: 'المنصورة', order: 1 },
        { id: 'talkha', name: 'طلخا', order: 2 },
        { id: 'mit_ghamr', name: 'ميت غمر', order: 3 },
        { id: 'sinnblawin', name: 'السنبلاوين', order: 4 },
        { id: 'bilqas', name: 'بلقاس', order: 5 },
        { id: 'dikirnis', name: 'دكرنس', order: 6 },
        { id: 'aja', name: 'أجا', order: 7 },
        { id: 'shirbin', name: 'شربين', order: 8 },
        { id: 'manzala', name: 'المنزلة', order: 9 },
        { id: 'matariya', name: 'المطرية', order: 10 },
        { id: 'bani_obeid', name: 'بني عبيد', order: 11 }
      ]
    },
    {
      id: 'gharbia',
      name: 'محافظة الغربية',
      active: true,
      order: 15,
      cities: [
        { id: 'tanta', name: 'طنطا', order: 1 },
        { id: 'mahalla_kubra', name: 'المحلة الكبرى', order: 2 },
        { id: 'kafr_zayat', name: 'كفر الزيات', order: 3 },
        { id: 'zefta', name: 'زفتى', order: 4 },
        { id: 'santa', name: 'السنطة', order: 5 },
        { id: 'basyoun', name: 'بسيون', order: 6 },
        { id: 'qutur', name: 'قطور', order: 7 },
        { id: 'saminoud', name: 'سمنود', order: 8 }
      ]
    },
    {
      id: 'monufia',
      name: 'محافظة المنوفية',
      active: true,
      order: 16,
      cities: [
        { id: 'shibin_el_kom', name: 'شبين الكوم', order: 1 },
        { id: 'sadat_city', name: 'السادات', order: 2 },
        { id: 'menouf', name: 'منوف', order: 3 },
        { id: 'ashmun', name: 'أشمون', order: 4 },
        { id: 'quwisna', name: 'قويسنا', order: 5 },
        { id: 'bagour', name: 'الباجور', order: 6 },
        { id: 'tala', name: 'تلا', order: 7 },
        { id: 'berket_saba', name: 'بركة السبع', order: 8 },
        { id: 'shuhada', name: 'الشهداء', order: 9 }
      ]
    },
    {
      id: 'beheira',
      name: 'محافظة البحيرة',
      active: true,
      order: 17,
      cities: [
        { id: 'damanhur', name: 'دمنهور', order: 1 },
        { id: 'kafr_el_dawwar', name: 'كفر الدوار', order: 2 },
        { id: 'rashid', name: 'رشيد', order: 3 },
        { id: 'edku', name: 'إدكو', order: 4 },
        { id: 'abu_homs', name: 'أبو حمص', order: 5 },
        { id: 'abu_matamir', name: 'أبو المطامير', order: 6 },
        { id: 'delengat', name: 'الدلنجات', order: 7 },
        { id: 'mahmoudiya', name: 'المحمودية', order: 8 },
        { id: 'itay_al_barud', name: 'إيتاي البارود', order: 9 },
        { id: 'rahmaniya', name: 'الرحمانية', order: 10 },
        { id: 'wadi_natrun', name: 'وادي النطرون', order: 11 }
      ]
    },
    {
      id: 'kafr_el_sheikh',
      name: 'محافظة كفر الشيخ',
      active: true,
      order: 18,
      cities: [
        { id: 'kafr_el_sheikh_city', name: 'كفر الشيخ', order: 1 },
        { id: 'desouk', name: 'دسوق', order: 2 },
        { id: 'fuwwah', name: 'فوه', order: 3 },
        { id: 'metoubes', name: 'مطوبس', order: 4 },
        { id: 'balteem', name: 'بلطيم', order: 5 },
        { id: 'bila', name: 'بيلا', order: 6 },
        { id: 'hamoul', name: 'الحامول', order: 7 },
        { id: 'sidi_salem', name: 'سيدي سالم', order: 8 },
        { id: 'riyad', name: 'الرياض', order: 9 }
      ]
    },
    {
      id: 'damietta',
      name: 'محافظة دمياط',
      active: true,
      order: 19,
      cities: [
        { id: 'damietta_city', name: 'دمياط', order: 1 },
        { id: 'ras_el_bar', name: 'رأس البر', order: 2 },
        { id: 'faraskur', name: 'فارسكور', order: 3 },
        { id: 'zarqa', name: 'الزرقا', order: 4 },
        { id: 'kafr_saad', name: 'كفر سعد', order: 5 },
        { id: 'rawda', name: 'الروضة', order: 6 },
        { id: 'ezbet_el_borg', name: 'عزبة البرج', order: 7 },
        { id: 'new_damietta', name: 'دمياط الجديدة', order: 8 }
      ]
    },
    {
      id: 'port_said',
      name: 'محافظة بورسعيد',
      active: true,
      order: 20,
      cities: [
        { id: 'port_said_city', name: 'بورسعيد', order: 1 },
        { id: 'port_fouad', name: 'بورفؤاد', order: 2 },
        { id: 'south', name: 'الجنوب', order: 3 },
        { id: 'east', name: 'الشرق', order: 4 },
        { id: 'zohour', name: 'الزهور', order: 5 },
        { id: 'suburbs', name: 'الضواحي', order: 6 }
      ]
    },
    {
      id: 'ismailia',
      name: 'محافظة الإسماعيلية',
      active: true,
      order: 21,
      cities: [
        { id: 'ismailia_city', name: 'الإسماعيلية', order: 1 },
        { id: 'fayed', name: 'فايد', order: 2 },
        { id: 'qantara_sharq', name: 'القنطرة شرق', order: 3 },
        { id: 'qantara_gharb', name: 'القنطرة غرب', order: 4 },
        { id: 'tel_el_kebir', name: 'التل الكبير', order: 5 },
        { id: 'qasasin', name: 'القصاصين', order: 6 },
        { id: 'abu_suwair', name: 'أبو صوير', order: 7 }
      ]
    },
    {
      id: 'suez',
      name: 'محافظة السويس',
      active: true,
      order: 22,
      cities: [
        { id: 'suez_city', name: 'السويس', order: 1 },
        { id: 'arbaeen', name: 'الأربعين', order: 2 },
        { id: 'faisal', name: 'فيصل', order: 3 },
        { id: 'ganayen', name: 'الجناين', order: 4 },
        { id: 'ataqa', name: 'عتاقة', order: 5 }
      ]
    },
    {
      id: 'fayoum',
      name: 'محافظة الفيوم',
      active: true,
      order: 23,
      cities: [
        { id: 'fayoum_city', name: 'الفيوم', order: 1 },
        { id: 'snurus', name: 'سنورس', order: 2 },
        { id: 'itsa', name: 'إطسا', order: 3 },
        { id: 'abshway', name: 'أبشواي', order: 4 },
        { id: 'youssef_sedik', name: 'يوسف الصديق', order: 5 },
        { id: 'tamiya', name: 'طامية', order: 6 }
      ]
    },
    {
      id: 'beni_suef',
      name: 'محافظة بني سويف',
      active: true,
      order: 24,
      cities: [
        { id: 'beni_suef_city', name: 'بني سويف', order: 1 },
        { id: 'al_wasta', name: 'الواسطى', order: 2 },
        { id: 'nasser', name: 'ناصر', order: 3 },
        { id: 'ihnasiya', name: 'إهناسيا', order: 4 },
        { id: 'biba', name: 'ببا', order: 5 },
        { id: 'samasta', name: 'سمسطا', order: 6 },
        { id: 'fashn', name: 'الفشن', order: 7 }
      ]
    },
    {
      id: 'minya',
      name: 'محافظة المنيا',
      active: true,
      order: 25,
      cities: [
        { id: 'minya_city', name: 'المنيا', order: 1 },
        { id: 'mallawi', name: 'ملوي', order: 2 },
        { id: 'samalut', name: 'سمالوط', order: 3 },
        { id: 'maghagha', name: 'مغاغة', order: 4 },
        { id: 'bani_mazar', name: 'بني مزار', order: 5 },
        { id: 'matay', name: 'مطاي', order: 6 },
        { id: 'deir_mawas', name: 'دير مواس', order: 7 },
        { id: 'abu_qirqas', name: 'أبو قرقاص', order: 8 },
        { id: 'adwa', name: 'العدوة', order: 9 }
      ]
    },
    {
      id: 'matrouh',
      name: 'محافظة مطروح',
      active: true,
      order: 26,
      cities: [
        { id: 'marsa_matrouh', name: 'مرسى مطروح', order: 1 },
        { id: 'hamam', name: 'الحمام', order: 2 },
        { id: 'el_alamein', name: 'العلمين', order: 3 },
        { id: 'dabaa', name: 'الضبعة', order: 4 },
        { id: 'sidi_barrani', name: 'سيدي براني', order: 5 },
        { id: 'sallum', name: 'السلوم', order: 6 },
        { id: 'negaila', name: 'النجيلة', order: 7 },
        { id: 'siwa', name: 'سيوة', order: 8 }
      ]
    }
  ];

  async seedAllGovernorates() {
    const alert = await this.alertCtrl.create({
      header: 'تأكيد الإضافة',
      message: 'هل أنت متأكد من إضافة جميع المحافظات والمدن؟ سيتم إضافة البيانات فقط إذا لم تكن موجودة.',
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'إضافة',
          handler: async () => {
            try {
              const timestamp = Timestamp.now();
              let addedCount = 0;
              let skippedCount = 0;

              for (const govData of this.governoratesSeedData) {
                const govDocRef = doc(this.firestore, 'city', govData.id);
                const govDocSnap = await getDoc(govDocRef);

                if (!govDocSnap.exists()) {
                  await setDoc(govDocRef, {
                    name: govData.name,
                    active: govData.active,
                    order: govData.order,
                    createdAt: timestamp
                  });
                  addedCount++;
                } else {
                  skippedCount++;
                }

                for (const cityData of govData.cities) {
                  const cityDocRef = doc(this.firestore, `city/${govData.id}/cities`, cityData.id);
                  const cityDocSnap = await getDoc(cityDocRef);

                  if (!cityDocSnap.exists()) {
                    await setDoc(cityDocRef, {
                      name: cityData.name,
                      active: true,
                      order: cityData.order,
                      createdAt: timestamp
                    });
                  }
                }
              }

              this.showToast(`تم الإضافة: ${addedCount} محافظة، تم التخطي: ${skippedCount}`);
            } catch (error) {
              console.error('Error seeding governorates:', error);
              this.showToast('حدث خطأ أثناء الإضافة');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async seedCitiesForGovernorate(governorate: Governorate) {
    const govData = this.governoratesSeedData.find(g => g.id === governorate.id);
    if (!govData) {
      this.showToast('لا توجد بيانات لهذه المحافظة');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'تأكيد الإضافة',
      message: `هل تريد إضافة جميع مدن "${governorate.name}"؟`,
      buttons: [
        { text: 'إلغاء', role: 'cancel' },
        {
          text: 'إضافة',
          handler: async () => {
            try {
              const timestamp = Timestamp.now();
              let addedCount = 0;

              for (const cityData of govData.cities) {
                const cityDocRef = doc(this.firestore, `city/${governorate.id}/cities`, cityData.id);
                const cityDocSnap = await getDoc(cityDocRef);

                if (!cityDocSnap.exists()) {
                  await setDoc(cityDocRef, {
                    name: cityData.name,
                    active: true,
                    order: cityData.order,
                    createdAt: timestamp
                  });
                  addedCount++;
                }
              }

              this.showToast(`تم إضافة ${addedCount} مدينة`);
            } catch (error) {
              console.error('Error seeding cities:', error);
              this.showToast('حدث خطأ أثناء الإضافة');
            }
          }
        }
      ]
    });
    await alert.present();
  }
}
