import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const defaultConfig = {
  projectId: "horizontal-disk-2ds98",
  appId: "1:968222331530:web:c3c8996c7c417bc6601373",
  apiKey: "AIzaSyAMgfDYZ9vrFKbxfj3QzBKWRczSpvCWCbc",
  authDomain: "horizontal-disk-2ds98.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-estatemasterwebt-68079c9a-d004-4a14-abfd-07d4b87adab1",
  storageBucket: "horizontal-disk-2ds98.firebasestorage.app",
  messagingSenderId: "968222331530"
};

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


