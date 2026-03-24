import { Component, Input, OnInit, inject } from '@angular/core'; 
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { Mota7HeaderComponent } from '../../mota7-header/header';

@Component({
  selector: 'app-edit-ad-modal',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, Mota7HeaderComponent],
  templateUrl: './edit-ad.html',
  styleUrls: ['./edit-ad.scss']
})
export class EditAdModal implements OnInit {
  @Input() ad: any; 
  
  private modalCtrl = inject(ModalController);
  private firestore = inject(Firestore);
  private toastCtrl = inject(ToastController);

  editData: any = {};

  ngOnInit() {
    if (this.ad) {
      // نأخذ نسخة عميقة من البيانات لمنع التعديل المباشر
      this.editData = JSON.parse(JSON.stringify(this.ad));
      
      // تأمين وجود المصفوفات والكائنات لتجنب أخطاء undefined
      if (!this.editData.details) this.editData.details = {};
      if (!this.editData.details.images) this.editData.details.images = [];
    }
  }

  // حذف صورة من المصفوفة
  removeImage(index: number) {
    this.editData.details.images.splice(index, 1);
  }

  // إضافة صورة (يمكنك ربطها بـ File Picker أو Camera لاحقاً)
  async uploadImage() {
    // منطق الرفع هنا.. حالياً نضيف placeholder للتوضيح
    this.showToast('سيتم فتح اختيار الصور قريباً', 'primary');
  }

  async saveChanges() {
    try {
      const docId = this.ad.id || this.ad.ad_id;
      
      if (!docId) {
        this.showToast('عذراً، لم يتم العثور على معرف الإعلان', 'danger');
        return;
      }

      const adRef = doc(this.firestore, 'ads', docId);

      // البيانات الأساسية المشتركة
      const updatePayload: any = {
        "city": this.editData.city || '',
        "owner_phone": this.editData.owner_phone || '',
        "updated_at": serverTimestamp()
      };

      // 1. إعلانات التوصيل
      if (this.editData.ad_type === 'delivery') {
        updatePayload["category_id"] = this.editData.category_id || ''; 
        updatePayload["details.driver_name"] = this.editData.details.driver_name || '';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["details.can_travel"] = !!this.editData.details.can_travel;
        updatePayload["details.for_rent"] = !!this.editData.details.for_rent;
        updatePayload["details.is_available"] = !!this.editData.details.is_available;

        const categoryMap: any = {
          'private-car': 'ملاكي', 'taxi': 'تاكسي', 'delivery': 'دليڤري',
          'tricycle': 'تروسيكل', 'motorcycle': 'موتوسيكل', 'quarter-transport': 'ربع نقل',
          'half-transport': 'نص نقل', 'microbus': 'ميكروباص', 'loader': 'لودر',
          'agricultural-tractor': 'جرار زراعي'
        };
        const typeAr = categoryMap[this.editData.category_id] || 'توصيل';
        updatePayload["delivery_match_key"] = `${typeAr}_${this.editData.city}`;
      } 
      
      // 2. إعلانات التعليم
      else if (this.editData.ad_type === 'education') {
        updatePayload["details.teacher_name"] = this.editData.details.teacher_name || '';
        updatePayload["details.subject"] = this.editData.details.subject || '';
        updatePayload["category_id"] = this.editData.category_id || ''; 
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["is_available"] = !!this.editData.is_available;

        const stageAr = this.editData.category_id === 'kindergarten' ? 'مرحلة رياض الاطفال' : 
                        this.editData.category_id === 'primary' ? 'المرحلة الإبتدائية' :
                        this.editData.category_id === 'preparatory' ? 'المرحلة الإعدادية' : 'المرحلة الثانوية';
        
        updatePayload["education_match_key"] = `${stageAr}+${this.editData.details.subject}+${this.editData.city}`;
      }
      
      // 3. الخدمات الأخرى
      else if (this.editData.ad_type === 'other') {
        updatePayload["details.provider_name"] = this.editData.details.provider_name || '';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["is_available"] = !!this.editData.is_available;
        updatePayload["category_id"] = this.editData.category_id || '';

        const nameArMap: any = {
          'ac-maintenance': 'صيانة تكييفات', 'appliance-maintenance': 'صيانة غسالات وثلاجات',
          'cameras-electronics': 'كاميرات واليكترونيات', 'satellite-installation': 'صيانة دش ورسيفر',
          'electrician': 'كهربائي', 'plumbing': 'سباكة', 'carpentry': 'نجارة',
          'painting': 'نقاشة', 'plastering': 'محارة', 'metalworks': 'حدادة',
          'construction': 'اعمال بناء', 'ceramic-flooring': 'تركيب سيراميك وارضيات',
          'marble-installation': 'تركيب رخام', 'advertising-design': 'تصميم الاعلانات والبنرات',
          'screen-maintenance': 'صيانة شاشات', 'financing': 'تمويل و قروض',
          'aluminum-works': 'أعمال المونتال', 'gas-stove-maintenance': 'صيانة بوتاجازات',
          'contracting-supplies': 'مقاولات وتوريدات', 'car-towing': 'ونش رفع سيارات',
          'car-mechanic': 'ميكانيكي سيارات', 'motorcycle-mechanic': 'ميكانيكي موتوسيكلات',
          'vespa-mechanic': 'ميكانيكي فيسبا', 'shipping-companies': 'شركات الشحن'
        };

        const currentNameAr = nameArMap[this.editData.category_id] || 'خدمات أخرى';
        updatePayload["other_match_key"] = `${currentNameAr}_${this.editData.city}`;
      }

      // 4. المتاجر
      else if (this.editData.ad_type === 'store') {
        updatePayload["store_name"] = this.editData.store_name || '';
        updatePayload["owner_name"] = this.editData.owner_name || '';
        updatePayload["category_id"] = this.editData.category_id || '';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';

        const storeNameMap: any = {
          'supermarket': 'سوبر ماركت', 'pharmacy': 'صيدليات', 'restaurants': 'مطاعم وكافيهات',
          'clothing': 'ملابس وأحذية', 'electronics-stores': 'معارض إلكترونيات',
          'building-materials': 'موانئ ومواد بناء', 'furniture': 'موبيليات وأثاث'
        };

        const currentStoreAr = storeNameMap[this.editData.category_id] || 'متجر';
        updatePayload["store_match_key"] = `${currentStoreAr}_${this.editData.city}`;
      }

      // 5. المنتجات (التعديل بناءً على الحقول الكاملة)
      else if (this.editData.ad_type === 'product') {
        updatePayload["details.title"] = this.editData.details.title || '';
        updatePayload["details.short_desc"] = this.editData.details.short_desc || '';
        updatePayload["details.full_details"] = this.editData.details.full_details || '';
        updatePayload["details.price"] = Number(this.editData.details.price) || 0;
        updatePayload["details.condition"] = this.editData.details.condition || 'مستعمل';
        updatePayload["details.whatsapp_phone"] = this.editData.details.whatsapp_phone || '';
        updatePayload["details.images"] = this.editData.details.images || [];
        updatePayload["sub_category_name"] = this.editData.sub_category_name || '';
        updatePayload["category_id"] = this.editData.category_id || '';

        const productNameMap: any = {
          'cars-and-accessories': 'سيارات واكسسوار',
          'motorcycles-and-accessories': 'موتوسيكلات واكسسوار',
          'real-estate-shops-land': 'عقارات ومحلات واراضي',
          'mobiles-tablets-laptops': 'موبايلات وتابلت ولابتوب',
          'electrical-electronic-devices': 'اجهزة كهربائية واليكترونية',
          'home-tools-decoration-furniture': 'ادوات منزلية وديكور واثاث',
          'fashion-furnishings': 'الازياء والمفروشات',
          'accessories-children-supplies': 'اكسسوارات ومستلزمات اطفال',
          'other-products': 'منتجات أخرى'
        };

        const currentProductAr = productNameMap[this.editData.category_id] || 'منتجات';
        const subCat = this.editData.sub_category_name || '';
        
        updatePayload["product_match_key"] = `${currentProductAr}+${subCat}+${this.editData.city}`;
      }

      await updateDoc(adRef, updatePayload);

      this.showToast('تم حفظ التعديلات بنجاح', 'success');
      this.modalCtrl.dismiss(this.editData);
    } catch (error) {
      console.error("Update Error:", error);
      this.showToast('فشل في تحديث البيانات، يرجى المحاولة لاحقاً', 'danger');
    }
  }

  async showToast(msg: string, color: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      color: color,
      position: 'bottom',
      mode: 'ios'
    });
    toast.present();
  }

  close() {
    this.modalCtrl.dismiss();
  }
}