import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

@Injectable({
  providedIn: 'root',
})
export class ImageService {
  private cloudName = 'dizjsif73';
  private uploadPreset = 'Mota7-App';

  /**
   * رفع إلى Cloudinary داخل المجلد المحدد مع ضغط محلي (WebP) ثم تحسين عبر تحويلات التسليم.
   */
  async uploadToCloudinary(file: File, folderName: 'products' | 'stores'): Promise<CloudinaryUploadResult> {
    const options = {
      maxWidthOrHeight: 1600,
      maxSizeMB: 0.45,
      fileType: 'image/webp' as const,
      useWebWorker: true,
      initialQuality: 0.82,
    };

    const compressedFile = await imageCompression(file, options);

    const formData = new FormData();
    formData.append('file', compressedFile);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', folderName);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const result = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(result.error?.message || 'فشل الرفع');
    }

    const secureUrl = String(result.secure_url || '');
    const publicId = String(result.public_id || '');
    const url = secureUrl.replace('/upload/', '/upload/c_limit,w_1200,h_1200,q_auto:good,f_auto/');

    return { url, publicId };
  }

  generateThumbnail(url: string): string {
    if (!url) return '';
    return url.replace('w_1200,h_1200', 'w_200,h_200');
  }
}
