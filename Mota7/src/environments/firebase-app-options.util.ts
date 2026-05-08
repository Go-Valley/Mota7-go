import type { FirebaseOptions } from 'firebase/app';
import { Capacitor } from '@capacitor/core';

/** الحقول الاختيارية لتهيئة Firebase حسب المنصّة في Capacitor */
export interface Mota7FirebaseEnvSlice {
  firebaseConfig: FirebaseOptions;
  firebaseConfigAndroid?: FirebaseOptions;
  firebaseConfigIos?: FirebaseOptions;
}

export function resolvePrimaryFirebaseConfig(env: Mota7FirebaseEnvSlice): FirebaseOptions {
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  if (platform === 'android' && env.firebaseConfigAndroid) {
    return env.firebaseConfigAndroid;
  }
  if (platform === 'ios' && env.firebaseConfigIos) {
    return env.firebaseConfigIos;
  }
  return env.firebaseConfig;
}
