import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';

function getFirebaseConfig() {
  if (typeof process !== 'undefined' && process.env?.FIREBASE_CONFIG) {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG);
    } catch {}
  }

  if (typeof process !== 'undefined' && (process.env?.FIREBASE_PROJECT_ID || process.env?.FIREBASE_API_KEY)) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || defaultConfig.projectId,
      apiKey: process.env.FIREBASE_API_KEY || defaultConfig.apiKey,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || defaultConfig.authDomain,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || defaultConfig.firestoreDatabaseId || '(default)',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || defaultConfig.storageBucket,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || defaultConfig.messagingSenderId,
      appId: process.env.FIREBASE_APP_ID || defaultConfig.appId
    };
  }

  return defaultConfig;
}

const firebaseConfig = getFirebaseConfig();

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);


