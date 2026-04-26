const crypto = require('crypto');

const SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const SPREADSHEET_ID        = '1IWF5gZ_w0EqbMu5uAHMF4w3I6PAgxbKb_aMeRQNDXgE'; // ห้องเช่า
const RUBBER_SPREADSHEET_ID = '12N5-WXFkoKg06K7F5rGA0bfjHJJJZ06cIJ8oKy1WsmJ8'; // สวนยาง

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

async function getValues(range, spreadsheetId = SPREADSHEET_ID) {
  const token = await getToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.values || [];
}

async function appendToSheet(range, values, spreadsheetId = SPREADSHEET_ID) {
  const token = await getToken();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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

// ดึงบิลค่าน้ำไฟล่าสุด (สำหรับกด "รับเงินแล้ว" ทีหลัง)
async function getLastWaterElecBill() {
  const rows = await getValues('น้ำไฟ_ห้อง3!A:J');
  const data = rows.filter(r => r[0] && r[0] !== 'เดือน/ปี' && r[0] !== 'ตัวอย่าง');
  if (data.length === 0) return null;
  const last = data[data.length - 1];
  return { month: last[0], total: parseFloat(last[9]) || 0 };
}

// ── สวนยาง (ชีต1 — 13 คอลัมน์ A-M) ──────────────────────────────────────────
// A:วันที่ B:น้ำหนักรวม_กก C:น้ำหนักสุทธิ_กก D:ราคา_บาทต่อกก E:ยอดขายรวม_บาท
// F:ส่วนแบ่งเจ้าของ_บาท G:ส่วนแบ่งคนตัด_บาท H:ชำระคืน_บาท
// I:โอนให้เจ้าของ_บาท J:คนตัดรับสุทธิ_บาท K:ความชื้น_เปอร์เซ็นต์
// L:หมายเหตุ M:เบิกใหม่_บาท

async function appendRubberSale(values) {
  return appendToSheet('ชีต1!A:M', values, RUBBER_SPREADSHEET_ID);
}

async function getWorkerBalance() {
  const rows = await getValues('ชีต1!A:M', RUBBER_SPREADSHEET_ID);
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่');
  let balance = 0;
  for (const r of data) {
    const repay   = parseFloat(r[7])  || 0; // H: ชำระคืน
    const advance = parseFloat(r[12]) || 0; // M: เบิกใหม่
    balance += advance - repay;
  }
  return balance; // บวก = ไทค้างอยู่, ลบ = จ่ายเกินหรือเครดิต
}

async function getRubberSummary() {
  const rows = await getValues('ชีต1!A:M', RUBBER_SPREADSHEET_ID);
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthRows = data.filter(r => r[0] && r[0].startsWith(thisMonth));
  const totalKgGross = thisMonthRows.reduce((s, r) => s + (parseFloat(r[1]) || 0), 0);
  const totalKgNet   = thisMonthRows.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);
  const totalBaht    = thisMonthRows.reduce((s, r) => s + (parseFloat(r[4]) || 0), 0);
  const ownerBaht    = thisMonthRows.reduce((s, r) => s + (parseFloat(r[5]) || 0), 0);
  return { totalKgGross, totalKgNet, totalBaht, ownerBaht, count: thisMonthRows.length };
}

module.exports = { appendRent, appendWaterElec, getLastMeters, getRecentIncome, getMonthlySummary, getLastWaterElecBill, appendRubberSale, getWorkerBalance, getRubberSummary };
