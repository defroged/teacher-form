import admin from 'firebase-admin';

function getServiceAccount() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawServiceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured.');
  }

  try {
    return JSON.parse(rawServiceAccount);
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON: ${error.message}`);
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    storageBucket: 'bs-class-database.firebasestorage.app'
  });
}

const adminDb = admin.firestore();
const storageBucket = admin.storage().bucket();

export { admin, adminDb, storageBucket };
