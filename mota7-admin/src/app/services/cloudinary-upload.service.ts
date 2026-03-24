import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

@Injectable({ providedIn: 'root' })
export class CloudinaryUploadService {
  private readonly cloudName = 'dizjsif73';
  private readonly uploadPreset = 'Mota7-App';

  async uploadImage(file: File, folder: 'banners' | 'products' | 'stores'): Promise<CloudinaryUploadResult> {
    /** ضغط أقوى مع الحفاظ على وضوح مقبول (WebP) — دون رفع جودة تُفرغ التفاصيل */
    const options = {
      maxWidthOrHeight: 1400,
      maxSizeMB: 0.34,
      fileType: 'image/webp' as const,
      useWebWorker: true,
      initialQuality: 0.78,
    };
    const compressedFile = await imageCompression(file, options);

    const formData = new FormData();
    formData.append('file', compressedFile);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = (await response.json()) as { secure_url?: string; public_id?: string; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(result.error?.message || 'فشل الرفع');
    }

    const secureUrl = String(result.secure_url || '');
    const publicId = String(result.public_id || '');
    const url = secureUrl.replace('/upload/', '/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto/');

    return { url, publicId };
  }
}
