'use strict';

const admin = require('firebase-admin');

let ready = false;

function parseServiceAccountJson() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw || !String(raw).trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required');
  }
  return JSON.parse(String(raw));
}

function initFirestore() {
  if (ready) return admin.firestore();

  const cred = parseServiceAccountJson();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId: cred.project_id,
    });
  }
  ready = true;
  return admin.firestore();
}

module.exports = { initFirestore, getAdmin: () => admin };
