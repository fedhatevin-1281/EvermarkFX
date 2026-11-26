const BASE_URL = (process.env.MAKAMESCO_BASE_URL || 'https://makamescopay.com').replace(/\/$/, '');
const API_KEY = process.env.MAKAMESCO_API_KEY || '';
const B2C_URL = process.env.MAKAMESCO_B2C_URL || `${BASE_URL}/api/payments/b2c`;

function isConfigured() {
  return Boolean(API_KEY);
}

async function initiateStkPush({ phoneNumber, amount, accountReference, transactionDesc = 'EvermarkFX Deposit' }) {
  if (!API_KEY) {
    throw new Error('MAKAMESCO_API_KEY is not configured');
  }
  const res = await fetch(`${BASE_URL}/api/payments/stkpush`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phoneNumber,
      amount: Math.round(Number(amount)),
      accountReference,
      transactionDesc
    })
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || `MakamescoPay STK HTTP ${res.status}`);
  }
  return data;
}

async function initiateB2CPayout({ phoneNumber, amount, accountReference, transactionDesc = 'EvermarkFX Withdrawal' }) {
  if (!API_KEY) {
    throw new Error('MAKAMESCO_API_KEY is not configured');
  }
  const res = await fetch(B2C_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phoneNumber,
      amount: Math.round(Number(amount)),
      accountReference,
      transactionDesc
    })
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || `MakamescoPay B2C HTTP ${res.status}`);
  }
  return data;
}

module.exports = { isConfigured, initiateStkPush, initiateB2CPayout };
