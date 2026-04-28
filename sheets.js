const crypto = require('crypto');

const SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const SPREADSHEET_ID        = '1IWF5gZ_w0EqbMu5uAHMF4w3I6PAgxbKb_aMeRQNDXgE'; // ห้องเช่า
const RUBBER_SPREADSHEET_ID = '12N5-WXFkoKg06K7F5rGA0bfjHJJZ06cIJ8oKy1WsmJ8'; // สวนยาง

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

// ── ห้องเช่า ──────────────────────────────────────────────────────────────────

async function getLastMeters() {
  const rows = await getValues('น้ำไฟ_ห้อง3!A:J');
  const dataRows = rows.filter(r => r[0] && r[0] !== 'เดือน/ปี' && r[0] !== 'ตัวอย่าง');
  if (dataRows.length === 0) return { wPrev: 597, ePrev: 4851 };
  const last = dataRows[dataRows.length - 1];
  return {
    wPrev: parseInt(last[2]) || 597,
    ePrev: parseInt(last[6]) || 4851
  };
}

async function appendRent(values)      { return appendToSheet('รายรับ!A:F', values); }
async function appendWaterElec(values) { return appendToSheet('น้ำไฟ_ห้อง3!A:J', values); }

async function isWaterBillPaid(month) {
  if (!month) return false;
  const rows = await getValues('รายรับ!A:F');
  return rows.some(r => r[2] === 'ค่าน้ำไฟ' && r[5] === month);
}

async function getRecentIncome(n = 5) {
  const rows = await getValues('รายรับ!A:F');
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่');
  return data.slice(-n);
}

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

async function getLastWaterElecBill() {
  const rows = await getValues('น้ำไฟ_ห้อง3!A:J');
  const data = rows.filter(r => r[0] && r[0] !== 'เดือน/ปี' && r[0] !== 'ตัวอย่าง');
  if (data.length === 0) return null;
  const last = data[data.length - 1];
  return { month: last[0], total: parseFloat(last[9]) || 0 };
}

// ── สวนยาง ────────────────────────────────────────────────────────────────────

async function appendRubberSale(values) {
  return appendToSheet('ชีต1!A:M', values, RUBBER_SPREADSHEET_ID);
}

async function getWorkerBalance() {
  const rows = await getValues('ติดตามหนี้!A:F', RUBBER_SPREADSHEET_ID);
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่');
  let balance = 0;
  for (const r of data) {
    balance += (parseFloat(r[2]) || 0) - (parseFloat(r[3]) || 0);
  }
  return +balance.toFixed(2);
}

async function appendDebtRecord(date, label, advance, repay, note = '') {
  const prevBal = await getWorkerBalance();
  const newBal  = +(prevBal + advance - repay).toFixed(2);
  return appendToSheet('ติดตามหนี้!A:F', [date, label, advance > 0 ? advance : 0, repay > 0 ? repay : 0, newBal, note], RUBBER_SPREADSHEET_ID);
}

async function getRubberSummary() {
  const rows = await getValues('ชีต1!A:M', RUBBER_SPREADSHEET_ID);
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่' && r[1]);
  const thisYear = new Date().getFullYear().toString();
  const yearRows = data.filter(r => r[0] && r[0].startsWith(thisYear));
  const totalKgNet = yearRows.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);
  const totalBaht  = yearRows.reduce((s, r) => s + (parseFloat(r[4]) || 0), 0);
  const ownerBaht  = yearRows.reduce((s, r) => s + (parseFloat(r[5]) || 0), 0);
  const recent = data.slice(-3).reverse().map(r => ({
    date: r[0], net: parseFloat(r[2]) || 0,
    price: parseFloat(r[3]) || 0, total: parseFloat(r[4]) || 0
  }));
  return { totalKgNet, totalBaht, ownerBaht, count: yearRows.length, recent, year: thisYear };
}

async function getRecentRubber(n = 5) {
  const rows = await getValues('ชีต1!A:M', RUBBER_SPREADSHEET_ID);
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่' && r[1]);
  return data.slice(-n).reverse();
}

// ── หนี้ธนาคาร ธอส. ──────────────────────────────────────────────────────────
// หนี้_รับเงิน!A:E  → วันที่ | เดือน | ชื่อ | ยอดรับ | หมายเหตุ
// หนี้_ส่งธนาคาร!A:D → วันที่ | เดือน | ยอด  | หมายเหตุ

const BANK_START   = '2026-05'; // เดือนแรกที่เริ่มบันทึก
const BANK_MONTHLY = 3575;
const BANK_MEMBERS = ['พี่หมา', 'พี่แมว', 'พี่อ๊อด', 'อู๊ด'];

function monthsCount(start, end) {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

async function appendBankPayment(name, amount, note = '') {
  const date  = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  return appendToSheet('หนี้_รับเงิน!A:E', [date, month, name, amount, note]);
}

async function appendBankSent(amount, note = '') {
  const date  = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  return appendToSheet('หนี้_ส่งธนาคาร!A:D', [date, month, amount, note]);
}

async function getBankStatus() {
  const [payRows, sentRows] = await Promise.all([
    getValues('หนี้_รับเงิน!A:E'),
    getValues('หนี้_ส่งธนาคาร!A:D')
  ]);
  const payments = payRows.filter(r => r[0] && r[0] !== 'วันที่');
  const sentData = sentRows.filter(r => r[0] && r[0] !== 'วันที่');

  const currentMonth = new Date().toISOString().slice(0, 7);
  const elapsed      = monthsCount(BANK_START, currentMonth);
  const totalOwed    = elapsed * BANK_MONTHLY;

  const members = {};
  for (const name of BANK_MEMBERS) {
    const allPaid  = payments.filter(r => r[2] === name).reduce((s, r) => s + (parseFloat(r[3]) || 0), 0);
    const thisPaid = payments.filter(r => r[2] === name && r[1] === currentMonth).reduce((s, r) => s + (parseFloat(r[3]) || 0), 0);
    const balance  = +(totalOwed - allPaid).toFixed(2);
    members[name]  = { allPaid, thisPaid, balance };
  }

  const sentThisMonth  = sentData.filter(r => r[1] === currentMonth);
  const bankSent       = sentThisMonth.length > 0;
  const bankSentAmount = sentThisMonth.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);
  const totalCollected = Object.values(members).reduce((s, m) => s + m.thisPaid, 0);

  return { members, bankSent, bankSentAmount, totalCollected, currentMonth };
}

async function getBankHistory(n = 3) {
  const rows = await getValues('หนี้_รับเงิน!A:E');
  const data = rows.filter(r => r[0] && r[0] !== 'วันที่');
  const byMonth = {};
  for (const r of data) {
    if (!byMonth[r[1]]) byMonth[r[1]] = {};
    byMonth[r[1]][r[2]] = (byMonth[r[1]][r[2]] || 0) + (parseFloat(r[3]) || 0);
  }
  const months = Object.keys(byMonth).sort().reverse().slice(0, n);
  return months.map(m => ({ month: m, payments: byMonth[m] }));
}

async function getBankOverdue() {
  const status = await getBankStatus();
  const overdues = [];
  for (const [name, info] of Object.entries(status.members)) {
    if (info.balance > 0) overdues.push(`  ${name}: ค้าง ฿${info.balance.toLocaleString('th-TH')}`);
  }
  if (!status.bankSent) overdues.push('  ⚠️ ยังไม่ได้ส่งธนาคาร');
  return overdues;
}

// ── ค่าน้ำพ่วง ────────────────────────────────────────────────────────────────
// น้ำ_พ่วง!A:I     → เดือน | ผู้เช่า | มิเตอร์เก่า | มิเตอร์ใหม่ | หน่วย | ราคา/หน่วย | ยอด | วันออกบิล | วันครบกำหนด
// น้ำ_รับเงิน!A:E  → วันที่ | ผู้เช่า | เดือน | ยอด | หมายเหตุ
// น้ำ_บิลหลัก!A:F  → วันที่ | เดือน | หน่วยรวม | ยอดรวม | สถานะ | วันจ่ายหมี่

const WATER_TENANTS = ['อารี', 'ไข่ดำ'];

async function getLastWaterSubMeter(tenant) {
  const rows = await getValues('น้ำ_พ่วง!A:I');
  const data = rows.filter(r => r[0] && r[0] !== 'เดือน' && r[1] === tenant);
  if (data.length === 0) return 0;
  return parseInt(data[data.length - 1][3]) || 0; // col D: มิเตอร์ใหม่
}

async function appendWaterBill(month, tenant, meterOld, meterNew, ratePerUnit, billDate, dueDate) {
  const units  = meterNew - meterOld;
  const amount = +(units * ratePerUnit).toFixed(2);
  return appendToSheet('น้ำ_พ่วง!A:I', [month, tenant, meterOld, meterNew, units, +ratePerUnit.toFixed(4), amount, billDate, dueDate]);
}

async function appendWaterMainBill(month, totalUnits, totalAmount) {
  const date        = new Date().toISOString().slice(0, 10);
  const ratePerUnit = +(totalAmount / totalUnits).toFixed(4);
  await appendToSheet('น้ำ_บิลหลัก!A:F', [date, month, totalUnits, totalAmount, 'ยังไม่จ่าย', '']);
  return ratePerUnit;
}

async function appendWaterPayment(tenant, month, amount) {
  const date = new Date().toISOString().slice(0, 10);
  return appendToSheet('น้ำ_รับเงิน!A:E', [date, tenant, month, amount, '']);
}

async function appendWaterMainPaid(amount) {
  const date  = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  return appendToSheet('น้ำ_บิลหลัก!A:F', [date, month + '_paid', 0, amount, 'จ่ายแล้ว', date]);
}

async function getWaterStatus() {
  const [billRows, payRows, mainRows] = await Promise.all([
    getValues('น้ำ_พ่วง!A:I'),
    getValues('น้ำ_รับเงิน!A:E'),
    getValues('น้ำ_บิลหลัก!A:F')
  ]);
  const bills    = billRows.filter(r => r[0] && r[0] !== 'เดือน');
  const payments = payRows.filter(r => r[0] && r[0] !== 'วันที่');
  const mains    = mainRows.filter(r => r[0] && r[0] !== 'วันที่' && !String(r[1]).includes('_paid'));

  const tenants = {};
  for (const tenant of WATER_TENANTS) {
    const billed   = bills.filter(r => r[1] === tenant).reduce((s, r) => s + (parseFloat(r[6]) || 0), 0);
    const paid     = payments.filter(r => r[1] === tenant).reduce((s, r) => s + (parseFloat(r[3]) || 0), 0);
    const balance  = +(billed - paid).toFixed(2);
    const lastBill = bills.filter(r => r[1] === tenant).slice(-1)[0] || null;
    tenants[tenant] = { billed, paid, balance, lastBill };
  }

  // สถานะบิลหลัก (จ่ายหมี่แล้วไหม)
  const lastMain   = mains.slice(-1)[0] || null;
  const paidRows   = mainRows.filter(r => r[4] === 'จ่ายแล้ว');
  const mainPaid   = lastMain ? paidRows.some(r => String(r[1]).startsWith(lastMain[1])) : false;

  return {
    tenants,
    lastMain: lastMain ? {
      month:       lastMain[1],
      totalUnits:  parseFloat(lastMain[2]) || 0,
      totalAmount: parseFloat(lastMain[3]) || 0,
      rate:        +((parseFloat(lastMain[3]) || 0) / Math.max(parseFloat(lastMain[2]) || 1, 1)).toFixed(4),
      paid:        mainPaid
    } : null
  };
}

async function getWaterHistory(tenant, n = 3) {
  const [billRows, payRows] = await Promise.all([
    getValues('น้ำ_พ่วง!A:I'),
    getValues('น้ำ_รับเงิน!A:E')
  ]);
  const bills    = billRows.filter(r => r[0] && r[0] !== 'เดือน' && r[1] === tenant);
  const payments = payRows.filter(r => r[0] && r[0] !== 'วันที่' && r[1] === tenant);
  return bills.slice(-n).reverse().map(b => ({
    month:   b[0],
    meterOld: parseInt(b[2]) || 0,
    meterNew: parseInt(b[3]) || 0,
    units:    parseInt(b[4]) || 0,
    rate:     parseFloat(b[5]) || 0,
    amount:   parseFloat(b[6]) || 0,
    billDate: b[7],
    dueDate:  b[8],
    paid:     payments.some(p => p[2] === b[0])
  }));
}

async function getWaterOverdue() {
  const status = await getWaterStatus();
  const overdues = [];
  for (const [tenant, info] of Object.entries(status.tenants)) {
    if (info.balance > 0) overdues.push(`  ${tenant}: ค้าง ฿${info.balance.toLocaleString('th-TH')}`);
  }
  if (status.lastMain && !status.lastMain.paid) {
    const owedHere = Object.values(status.tenants).reduce((s, t) => s + t.balance, 0);
    if (owedHere > 0) overdues.push('  ⚠️ ยังไม่ได้จ่ายหมี่');
  }
  return overdues;
}

module.exports = {
  // ห้องเช่า
  appendRent, appendWaterElec, getLastMeters, getRecentIncome,
  getMonthlySummary, getLastWaterElecBill, isWaterBillPaid,
  // สวนยาง
  appendRubberSale, getWorkerBalance, appendDebtRecord, getRubberSummary, getRecentRubber,
  // หนี้ธนาคาร
  BANK_MEMBERS, BANK_MONTHLY,
  appendBankPayment, appendBankSent, getBankStatus, getBankHistory, getBankOverdue,
  // ค่าน้ำพ่วง
  WATER_TENANTS,
  getLastWaterSubMeter, appendWaterBill, appendWaterMainBill,
  appendWaterPayment, appendWaterMainPaid, getWaterStatus, getWaterHistory, getWaterOverdue,
};
