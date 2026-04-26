const crypto = require('crypto');

const SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const SPREADSHEET_ID = '1IWF5gZ_w0EqbMu5uAHMF4w3I6PAgxbKb_aMeRQNDXgE';

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = s => Buffer.from(typeof s === 'string' ? s : JSON.stringify(s)).toString('base64url');
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claim  = b64({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  const sig = sign.sign(SA.private_key).toString('base64url');
  const jwt = `${header}.${claim}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  return data.access_token;
}

async function getValues(range) {
  const token = await getToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.values || [];
}

async function appendToSheet(range, values) {
  const token = await getToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values], majorDimension: 'ROWS' })
    }
  );
  return res.json();
}

// ดึงมิเตอร์ครั้งล่าสุดจาก sheet
async function getLastMeters() {
  const rows = await getValues('น้ำไฟ_ห้อง3!A:J');
  // หาแถวสุดท้ายที่มีข้อมูลจริง (ไม่ใช่ header หรือตัวอย่าง)
  const dataRows = rows.filter(r => r[0] && r[0] !== 'เดือน/ปี' && r[0] !== 'ตัวอย่าง');
  if (dataRows.length === 0) return { wPrev: 597, ePrev: 4851 }; // fallback
  const last = dataRows[dataRows.length - 1];
  return {
    wPrev: parseInt(last[2]) || 597,   // มิเตอร์น้ำใหม่ของรอบก่อน
    ePrev: parseInt(last[6]) || 4851   // มิเตอร์ไฟใหม่ของรอบก่อน
  };
}

async function appendRent(values)      { return appendToSheet('รายรับ!A:F', values); }
async function appendWaterElec(values) { return appendToSheet('น้ำไฟ_ห้อง3!A:J', values); }

// ดึงรายรับล่าสุด N รายการ
async function getRecentIncome(n = 5) {
  const rows = await getValues('รายรับ!A:F');
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่');
  return data.slice(-n);
}

// สรุปรายรับเดือนนี้
async function getMonthlySummary() {
  const rows = await getValues('รายรับ!A:F');
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthRows = data.filter(r => r[0] && r[0].startsWith(thisMonth));
  const total = thisMonthRows.reduce((s, r) => s + (+r[3] || 0), 0);
  const byRoom = {};
  thisMonthRows.forEach(r => { byRoom[r[1]] = (byRoom[r[1]] || 0) + (+r[3] || 0); });
  return { total, byRoom, count: thisMonthRows.length };
}

module.exports = { appendRent, appendWaterElec, getLastMeters, getRecentIncome, getMonthlySummary };
