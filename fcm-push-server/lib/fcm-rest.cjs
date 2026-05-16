'use strict';

/**
 * FCM HTTP v1 — https://firebase.google.com/docs/reference/fcm/rest
 */
const { GoogleAuth } = require('google-auth-library');
const criteria = require('../config/recipient-criteria.cjs');

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let authClient = null;
let projectId = criteria.projectId;

function getCredentials() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw || !String(raw).trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required');
  }
  const cred = JSON.parse(String(raw));
  if (cred.private_key && typeof cred.private_key === 'string') {
    cred.private_key = cred.private_key.replace(/\\n/g, '\n');
  }
  return cred;
}

/** google-auth-library: JWT client returns { token }, GoogleAuth.getAccessToken() returns string */
function extractAccessToken(result) {
  if (!result) return null;
  if (typeof result === 'string') return result;
  if (typeof result === 'object' && typeof result.token === 'string') return result.token;
  return null;
}

async function getAccessToken() {
  if (!authClient) {
    const cred = getCredentials();
    projectId = cred.project_id || criteria.projectId;
    authClient = new GoogleAuth({
      credentials: cred,
      scopes: [FCM_SCOPE],
    });
  }
  const token = extractAccessToken(await authClient.getAccessToken());
  if (!token) throw new Error('Failed to obtain FCM access token');
  return token;
}

/**
 * @param {Record<string, unknown>} messageBody FCM v1 message object (token or topic set inside)
 */
async function sendFcmMessage(messageBody) {
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: messageBody }),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(json?.error?.message || text || `FCM HTTP ${res.status}`);
    /** @type {Record<string, unknown>} */ (err).fcmResponse = json;
    throw err;
  }
  return json;
}

/**
 * @param {string} token
 * @param {{ title: string; body: string }} notification
 * @param {Record<string, string>} data
 */
function stringifyData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

async function sendToDeviceToken(token, notification, data) {
  const cfg = criteria.notification;
  return sendFcmMessage({
    token,
    notification: {
      title: notification.title || 'Mota7',
      body: notification.body || '',
    },
    data: stringifyData(data),
    android: {
      priority: 'HIGH',
      notification: {
        channel_id: cfg.androidChannelId,
        sound: cfg.androidSound,
      },
    },
    apns: {
      payload: {
        aps: { sound: 'default' },
      },
    },
  });
}

/**
 * @param {string} topic
 * @param {{ title: string; body: string }} notification
 * @param {Record<string, string>} data
 */
async function sendToTopic(topic, notification, data) {
  return sendFcmMessage({
    topic,
    notification: {
      title: notification.title || 'Mota7',
      body: notification.body || '',
    },
    data: stringifyData(data),
    android: { priority: 'HIGH' },
    apns: {
      payload: {
        aps: { sound: 'default' },
      },
    },
  });
}

/**
 * @param {string[]} tokens
 * @param {{ title: string; body: string }} notification
 * @param {Record<string, string>} data
 */
async function sendToTokens(tokens, notification, data) {
  const uniq = [...new Set(tokens.map((t) => String(t || '').trim()).filter(Boolean))];
  const results = { sent: 0, failed: 0, errors: [] };

  for (const token of uniq) {
    try {
      await sendToDeviceToken(token, notification, data);
      results.sent += 1;
    } catch (e) {
      results.failed += 1;
      results.errors.push({ token: token.slice(0, 12) + '…', message: e?.message || String(e) });
      console.error('[fcm] send failed', e?.message || e);
    }
  }
  return results;
}

async function verifyFcmAuth() {
  const token = await getAccessToken();
  if (!token.startsWith('ya')) {
    throw new Error('Unexpected access token format');
  }
  return { projectId, tokenLength: token.length };
}

module.exports = {
  sendToDeviceToken,
  sendToTopic,
  sendToTokens,
  sendFcmMessage,
  verifyFcmAuth,
};
