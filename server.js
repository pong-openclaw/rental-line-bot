const express = require('express');
const crypto  = require('crypto');
const {
  appendRent, appendWaterElec, getLastMeters, getRecentIncome, getAllIncome,
  getMonthlySummary, getLastWaterElecBill, getAllWaterElecBills, isWaterBillPaid,
  appendRubberSale, getWorkerBalance, appendDebtRecord, getRubberSummary, getRecentRubber,
  BANK_MEMBERS, BANK_MONTHLY,
  appendBankPayment, appendBankSent, getBankStatus, getBankHistory, getBankOverdue,
  WATER_TENANTS,
  getLastWaterSubMeter, appendWaterBill, appendWaterMainBill,
  appendWaterPayment, appendWaterMainPaid, getWaterStatus, getWaterHistory, getWaterOverdue,
} = require('./sheets');

const app  = express();
const PORT = process.env.PORT || 3000;
const TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const SECRET = process.env.LINE_CHANNEL_SECRET;

app.use('/webhook', express.raw({ type: '*/*' }));
app.use(express.json());

// ── LINE helpers ──────────────────────────────────────────────────────────────
function verifySig(body, sig) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64') === sig;
}
let _lastReply = null;
const QR_RENTAL = { items: [
  { type:'action', action:{ type:'message', label:'💰 รับเงิน',   text:'รับเงิน' } },
  { type:'action', action:{ type:'message', label:'💧 น้ำ/ไฟ',    text:'บันทึกมิเตอร์' } },
  { type:'action', action:{ type:'message', label:'⏰ ยอดค้าง',   text:'ยอดค้าง' } },
  { type:'action', action:{ type:'message', label:'📊 สรุป',      text:'สรุป' } },
  { type:'action', action:{ type:'message', label:'📋 ประวัติ',   text:'ประวัติรายรับ' } },
]};
const QR_INCOME = { items: [
  { type:'action', action:{ type:'message', label:'🏠 ค่าเช่า',   text:'ค่าเช่า' } },
  { type:'action', action:{ type:'message', label:'💧 ค่าน้ำ/ไฟ', text:'ค่าน้ำไฟ' } },
  { type:'action', action:{ type:'message', label:'📋 ประวัติ',   text:'ประวัติรายรับ' } },
  { type:'action', action:{ type:'message', label:'↩️ กลับ',      text:'ห้องเช่า' } },
]};
const QR_ROOMS = { items: [
  { type:'action', action:{ type:'message', label:'ห้อง 1 ฿3,500',  text:'รับค่าเช่าห้อง 1 3500' } },
  { type:'action', action:{ type:'message', label:'ห้อง 2 ฿1,000',  text:'รับค่าเช่าห้อง 2 1000' } },
  { type:'action', action:{ type:'message', label:'ห้อง 3 ฿8,000',  text:'รับค่าเช่าห้อง 3 8000' } },
  { type:'action', action:{ type:'message', label:'คอนโด ฿10,000',  text:'รับค่าเช่าคอนโด 10000' } },
  { type:'action', action:{ type:'message', label:'↩️ กลับ',        text:'รับเงิน' } },
]};
const QR_RUBBER = { items: [
  { type:'action', action:{ type:'message', label:'🌿 ขายยาง',     text:'ขายยาง' } },
  { type:'action', action:{ type:'message', label:'👷 เบิกเงิน',   text:'เบิกเงิน' } },
  { type:'action', action:{ type:'message', label:'💵 คืนเงิน',    text:'คืนเงิน' } },
  { type:'action', action:{ type:'message', label:'💳 ยอดค้างไท',  text:'ยอดค้างไท' } },
  { type:'action', action:{ type:'message', label:'📜 ประวัติยาง', text:'ประวัติยาง' } },
]};
const QR_GUIDED = { items: [
  { type:'action', action:{ type:'message', label:'❌ ยกเลิก', text:'ยกเลิก' } },
]};
const QR_BANK = { items: [
  { type:'action', action:{ type:'message', label:'💵 รับเงิน',     text:'รับเงินหนี้บ้าน' } },
  { type:'action', action:{ type:'message', label:'⏰ ยอดค้าง',     text:'ยอดค้างบ้าน' } },
  { type:'action', action:{ type:'message', label:'🏦 ส่งธนาคาร',   text:'ส่งธนาคารแล้ว' } },
  { type:'action', action:{ type:'message', label:'📜 ประวัติ',     text:'ประวัติหนี้บ้าน' } },
]};
const QR_WATER = { items: [
  { type:'action', action:{ type:'message', label:'📋 ออกบิลประปา',  text:'ออกบิลประปา' } },
  { type:'action', action:{ type:'message', label:'💧 น้ำอารี',       text:'น้ำอารี' } },
  { type:'action', action:{ type:'message', label:'💧 น้ำไข่ดำ',      text:'น้ำไข่ดำ' } },
  { type:'action', action:{ type:'message', label:'⏰ ยอดค้าง',       text:'ยอดค้างน้ำ' } },
  { type:'action', action:{ type:'message', label:'💰 จ่ายหมี่แล้ว',  text:'จ่ายหมี่แล้ว' } },
  { type:'action', action:{ type:'message', label:'📜 ประวัติอารี',   text:'ประวัติน้ำอารี' } },
  { type:'action', action:{ type:'message', label:'📜 ประวัติไข่ดำ',  text:'ประวัติน้ำไข่ดำ' } },
]};

// เก็บ userId เจ้าของเพื่อส่ง push notification
let OWNER_ID = process.env.LINE_OWNER_ID || null;

async function push(userId, text, qr = null) {
  const message = { type: 'text', text };
  if (qr) message.quickReply = qr;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: userId, messages: [message] })
  });
}

async function reply(replyToken, text, qr = QR_RENTAL) {
  const message = { type: 'text', text, quickReply: qr };
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [message] })
  });
  const data = await res.json();
  _lastReply = { status: res.status, ok: res.ok, data, time: new Date().toISOString() };
  if (!res.ok) console.log('❌ Reply error:', JSON.stringify(data));
  else console.log('✅ Reply sent');
}

// ── Parsers ───────────────────────────────────────────────────────────────────
const ROOMS = {
  'คอนโด':  { key: 'คอนโด',  rent: 10000, pattern: /คอนโด|kiara|10[,.]?000/i },
  'ห้อง 3': { key: 'ห้อง 3', rent: 8000,  pattern: /ห้อง\s*3|สานิตย์|8[,.]?000/i },
  'ห้อง 1': { key: 'ห้อง 1', rent: 3500,  pattern: /ห้อง\s*1|3[,.]?500/i },
  'ห้อง 2': { key: 'ห้อง 2', rent: 1000,  pattern: /ห้อง\s*2(?!0)|(?<!\d)1[,.]?000(?!\d)/i },
};

function detectRoom(text) {
  for (const [name, info] of Object.entries(ROOMS)) {
    if (info.pattern.test(text)) return name;
  }
  return null;
}

function detectAmount(text) {
  const m = text.match(/(\d[\d,]*)/);
  return m ? parseInt(m[1].replace(/,/g, '')) : null;
}

function detectDate(text) {
  const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function detectMeters(text) {
  const w = text.match(/น้ำ\s*(\d+)/);
  const e = text.match(/ไฟ\s*(\d+)/);
  if (w && e) return { water: parseInt(w[1]), elec: parseInt(e[1]) };
  return null;
}

// ── Date formatters ───────────────────────────────────────────────────────────
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function thaiMonth(iso) {
  const d = new Date(iso);
  return `${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function thaiDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function fmt(n) { return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Webhook ───────────────────────────────────────────────────────────────────
// ── Session state (guided input) ─────────────────────────────────────────────
const SESSION = new Map(); // userId → { step, data }
const SECTION = new Map(); // userId → 'rental'|'rubber'|'bank'|'water' (คงอยู่ข้ามคำสั่ง)

function sectionQR(userId) {
  const s = SECTION.get(userId);
  if (s === 'bank')   return QR_BANK;
  if (s === 'water')  return QR_WATER;
  if (s === 'rubber') return QR_RUBBER;
  return QR_RENTAL;
}

let _lastHook = null;

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const sig = req.headers['x-line-signature'];
  const computed = SECRET ? crypto.createHmac('sha256', SECRET).update(req.body).digest('base64') : 'NO_SECRET';
  _lastHook = { time: new Date().toISOString(), sig, computed, match: sig === computed, body: req.body.toString().slice(0, 300) };
  let sigOk = false;
  try { sigOk = verifySig(req.body, sig); } catch(e) { console.log('❌ verifySig threw:', e.message); }
  if (!sigOk) {
    console.log('❌ Signature mismatch — sig:', sig);
    return;
  }
  console.log('✅ Webhook received');

  const events = JSON.parse(req.body.toString()).events || [];

  for (const ev of events) {
    if (ev.type !== 'message' || ev.message.type !== 'text') continue;
    const text   = ev.message.text.trim();
    const rt     = ev.replyToken;
    const userId = ev.source?.userId || 'unknown';
    // เก็บ userId เจ้าของ
    if (!OWNER_ID) OWNER_ID = userId;
    // คำสั่งหลัก — ล้าง session ทิ้งก่อนเสมอ
    const MAIN_CMDS = /^(ห้องเช่า|สวนยาง|ภาพรวม|ค่าเช่า|เช่า|รับเงิน|ค่าน้ำไฟ|ประวัติรายรับ|สรุป|รายรับ|มิเตอร์|ยอดค้าง|ยอดค้างไท|ประวัติยาง|สรุปยาง|ขายยาง|เบิกเงิน|คืนเงิน|บันทึกมิเตอร์|รับเงินแล้ว|หนี้บ้าน|รับเงินหนี้บ้าน|ยอดค้างบ้าน|ส่งธนาคารแล้ว|ประวัติหนี้บ้าน|น้ำพ่วง|ออกบิลประปา|น้ำอารี|น้ำไข่ดำ|บันทึกน้ำพ่วง|ยอดค้างน้ำ|จ่ายหมี่แล้ว|ประวัติน้ำอารี|ประวัติน้ำไข่ดำ|ยอดค้างทั้งหมด|สรุปทั้งหมด|help|ช่วย|วิธีใช้|menu|เมนู)$/i;
    if (MAIN_CMDS.test(text)) SESSION.delete(userId);
    let sess = SESSION.get(userId);

    try {
      // ── ยกเลิก guided flow ───────────────────────────────────────────────
      if (/^ยกเลิก$/i.test(text)) {
        SESSION.delete(userId);
        await reply(rt, '↩️ ยกเลิกแล้วครับ', QR_RENTAL);
        continue;
      }

      // ── Guided: รอมิเตอร์น้ำ ─────────────────────────────────────────────
      if (sess?.step === 'water') {
        const w = parseInt(text.replace(/,/g,''));
        if (isNaN(w)) { await reply(rt, '❌ ใส่แค่ตัวเลขครับ เช่น 603', QR_GUIDED); continue; }
        SESSION.set(userId, { step: 'elec', water: w, wPrev: sess.wPrev, ePrev: sess.ePrev });
        await reply(rt, `⚡ มิเตอร์ไฟ = ? (ครั้งก่อน: ${sess.ePrev})`, QR_GUIDED);
        continue;
      }

      // ── Guided: รอมิเตอร์ไฟ ─────────────────────────────────────────────
      if (sess?.step === 'elec') {
        const e = parseInt(text.replace(/,/g,''));
        if (isNaN(e)) { await reply(rt, '❌ ใส่แค่ตัวเลขครับ เช่น 4900', QR_GUIDED); continue; }
        SESSION.delete(userId);
        const wPrev = sess.wPrev, ePrev = sess.ePrev;
        const wUnits = sess.water - wPrev;
        const eUnits = e - ePrev;
        const wCost  = +(wUnits * 19.3 * 1.07).toFixed(2);
        const eCost  = +(eUnits * 3.85 * 1.32).toFixed(2);
        const total  = +(wCost + eCost).toFixed(2);
        const date   = new Date().toISOString().slice(0, 10);
        const month  = thaiMonth(date);
        await appendWaterElec([month, wPrev, sess.water, wUnits, wCost, ePrev, e, eUnits, eCost, total]);
        // เก็บยอดไว้รอกด "รับเงินแล้ว"
        SESSION.set(userId, { step: 'pending_payment', total, date, room: 'ห้อง 3' });
        const billUrl = `https://pong-openclaw.github.io/farm-dashboard/bill.html`
          + `?wPrev=${wPrev}&wCurr=${sess.water}&ePrev=${ePrev}&eCurr=${e}`
          + `&date=${date}&status=original`
          + `&tenant=%E0%B8%99%E0%B8%B2%E0%B8%A2+%E0%B8%AA%E0%B8%B2%E0%B8%99%E0%B8%B4%E0%B8%95%E0%B8%A2%E0%B9%8C+%E0%B8%9A%E0%B8%B1%E0%B8%A7%E0%B8%AA%E0%B8%87%E0%B8%84%E0%B9%8C`;
        const qr = { items: [
          { type:'action', action:{ type:'message', label:`✅ รับเงินแล้ว ฿${fmt(total)}`, text:'รับเงินแล้ว' } },
          ...QR_RENTAL.items
        ]};
        const msg = { type:'text', quickReply: qr, text:
          `✅ บันทึกค่าน้ำไฟแล้ว\n\n`
          + `💧 น้ำ: ${wPrev}→${sess.water} = ${wUnits} หน่วย → ฿${fmt(wCost)}\n`
          + `⚡ ไฟ: ${ePrev}→${e} = ${eUnits} หน่วย → ฿${fmt(eCost)}\n`
          + `💰 รวม: ฿${fmt(total)}\n\n`
          + `🖨️ บิล:\n${billUrl}`
        };
        await fetch('https://api.line.me/v2/bot/message/reply',{
          method:'POST', headers:{'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json'},
          body: JSON.stringify({ replyToken: rt, messages: [msg] })
        });
        continue;
      }

      // ── รับเงินค่าน้ำไฟแล้ว (ใช้ได้ตลอด ดึงยอดจาก Sheets) ───────────────
      if (/รับเงินแล้ว/i.test(text)) {
        const bill = await getLastWaterElecBill();
        if (!bill) { await reply(rt, '❌ ไม่พบข้อมูลบิลครับ'); continue; }
        const date = new Date().toISOString().slice(0, 10);
        await appendRent([date, 'ห้อง 3', 'ค่าน้ำไฟ', bill.total, 'รับแล้ว', bill.month]);
        SESSION.delete(userId);
        await reply(rt, `✅ บันทึกรับเงิน ฿${fmt(bill.total)} ค่าน้ำไฟ ห้อง 3 (${bill.month}) แล้วครับ`);
        continue;
      }

      // ── มิเตอร์น้ำไฟ ──────────────────────────────────────────────────────
      const meters = detectMeters(text);
      if (meters) {
        const { wPrev, ePrev } = await getLastMeters();
        const wUnits = meters.water - wPrev;
        const eUnits = meters.elec  - ePrev;
        const wCost  = +(wUnits * 19.3 * 1.07).toFixed(2);
        const eCost  = +(eUnits * 3.85 * 1.32).toFixed(2);
        const total  = +(wCost + eCost).toFixed(2);
        const date   = detectDate(text);
        const month  = thaiMonth(date);

        await appendWaterElec([month, wPrev, meters.water, wUnits, wCost, ePrev, meters.elec, eUnits, eCost, total]);

        const billUrl = `https://pong-openclaw.github.io/farm-dashboard/bill.html`
          + `?wPrev=${wPrev}&wCurr=${meters.water}&ePrev=${ePrev}&eCurr=${meters.elec}`
          + `&date=${date}&status=original`
          + `&tenant=%E0%B8%99%E0%B8%B2%E0%B8%A2+%E0%B8%AA%E0%B8%B2%E0%B8%99%E0%B8%B4%E0%B8%95%E0%B8%A2%E0%B9%8C+%E0%B8%9A%E0%B8%B1%E0%B8%A7%E0%B8%AA%E0%B8%87%E0%B8%84%E0%B9%8C`;

        await reply(rt,
          `✅ บันทึกค่าน้ำไฟแล้ว\n\n`
          + `💧 น้ำ: ${wPrev}→${meters.water} = ${wUnits} หน่วย → ฿${fmt(wCost)}\n`
          + `⚡ ไฟ: ${ePrev}→${meters.elec} = ${eUnits} หน่วย → ฿${fmt(eCost)}\n`
          + `💰 รวม: ฿${fmt(total)}\n\n`
          + `🖨️ บิล (กดพิมพ์ได้เลย):\n${billUrl}`
        );
        continue;
      }

      // ── ตั้ง section ตามเมนูที่กด ────────────────────────────────────────────
      if (/^ห้องเช่า|รับเงิน|ค่าเช่า|ยอดค้าง|สรุป|ประวัติรายรับ|บันทึกมิเตอร์$/i.test(text)) SECTION.set(userId, 'rental');
      else if (/^สวนยาง|ขายยาง|เบิกเงิน|คืนเงิน|ยอดค้างไท|ประวัติยาง|สรุปยาง$/i.test(text)) SECTION.set(userId, 'rubber');
      else if (/^หนี้บ้าน|รับเงินหนี้บ้าน|เลือกรับเงิน|ยอดค้างบ้าน|ส่งธนาคารแล้ว|ประวัติหนี้บ้าน$/i.test(text)) SECTION.set(userId, 'bank');
      else if (/^น้ำพ่วง|ออกบิลประปา|น้ำอารี|น้ำไข่ดำ|บันทึกน้ำพ่วง|ยอดค้างน้ำ|จ่ายหมี่แล้ว|ประวัติน้ำอารี|ประวัติน้ำไข่ดำ$/i.test(text)) SECTION.set(userId, 'water');
      else if (/^ยอดค้างทั้งหมด|สรุปทั้งหมด$/i.test(text)) SECTION.set(userId, 'rental');

      // ── Rich Menu: ห้องเช่า ──────────────────────────────────────────────
      if (/^ห้องเช่า$/i.test(text)) {
        const qr = { items: [
          { type:'action', action:{ type:'message', label:'💰 รับเงิน',   text:'รับเงิน' } },
          { type:'action', action:{ type:'message', label:'💧 น้ำ/ไฟ',    text:'บันทึกมิเตอร์' } },
          { type:'action', action:{ type:'message', label:'⏰ ยอดค้าง',   text:'ยอดค้าง' } },
          { type:'action', action:{ type:'message', label:'📊 สรุป',      text:'สรุป' } },
          { type:'action', action:{ type:'message', label:'📋 ประวัติ',   text:'ประวัติรายรับ' } },
        ]};
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text', text:'🏠 ห้องเช่า — เลือกได้เลยครับ', quickReply: qr }] })
        });
        continue;
      }

      // ── รับเงิน (sub-menu หลัก) ──────────────────────────────────────────
      if (/^รับเงิน$/i.test(text)) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text', text:'💰 รายรับ — เลือกประเภทครับ', quickReply: QR_INCOME }] })
        });
        continue;
      }

      // ── ค่าน้ำไฟ → รับเงินแล้วทันที ─────────────────────────────────────
      if (/^ค่าน้ำไฟ$/i.test(text)) {
        const bill = await getLastWaterElecBill();
        if (!bill) { await reply(rt, '❌ ยังไม่มีบิลค่าน้ำไฟครับ', QR_INCOME); continue; }
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text',
            text: `💧 ค่าน้ำ/ไฟ บิลล่าสุด\n\n📅 ${bill.month}\n💰 ฿${fmt(bill.total)}\n\nรับเงินแล้วหรือยัง?`,
            quickReply: { items: [
              { type:'action', action:{ type:'message', label:`✅ รับแล้ว ฿${fmt(bill.total)}`, text:'รับเงินแล้ว' } },
              { type:'action', action:{ type:'message', label:'↩️ กลับ', text:'รับเงิน' } },
            ]}
          }] })
        });
        continue;
      }

      // ── ประวัติรายรับ ─────────────────────────────────────────────────────
      if (/^ประวัติรายรับ$/i.test(text)) {
        const rows = await getRecentIncome(8);
        if (rows.length === 0) { await reply(rt, 'ยังไม่มีรายรับครับ', QR_RENTAL); continue; }
        const lines = rows.map(r => {
          const type = r[2] === 'ค่าน้ำไฟ' ? ' · 💧น้ำ/ไฟ' : '';
          return `  ${r[0]} · ${r[1]}${type} · ฿${(+r[3]).toLocaleString('th-TH')}`;
        }).join('\n');
        await reply(rt, `📋 ประวัติรายรับล่าสุด\n\n${lines}`, QR_RENTAL);
        continue;
      }

      // ── Rich Menu: สวนยาง ─────────────────────────────────────────────────
      if (/^สวนยาง$/i.test(text)) {
        const qr = { items: [
          { type:'action', action:{ type:'message', label:'🌿 ขายยาง',    text:'ขายยาง' } },
          { type:'action', action:{ type:'message', label:'👷 ไท เบิกเงิน', text:'เบิกเงิน' } },
          { type:'action', action:{ type:'message', label:'💵 ไท คืนเงิน',  text:'คืนเงิน' } },
          { type:'action', action:{ type:'message', label:'📋 ยอดค้างไท',  text:'ยอดค้างไท' } },
          { type:'action', action:{ type:'message', label:'📜 ประวัติยาง',  text:'ประวัติยาง' } },
        ]};
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text', text:'🌿 สวนยาง — เลือกได้เลยครับ', quickReply: qr }] })
        });
        continue;
      }

      // ── สวนยาง: ขายยาง (guided 4 ขั้น) ──────────────────────────────────
      if (/^ขายยาง$/i.test(text)) {
        SESSION.set(userId, { step: 'rubber_gross' });
        await reply(rt, '🌿 ขายยาง\n\n⚖️ น้ำหนักรวม (กก.)? เช่น 365', QR_GUIDED);
        continue;
      }
      if (sess?.step === 'rubber_gross') {
        const gross = parseFloat(text.replace(/,/g, ''));
        if (isNaN(gross) || gross <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ เช่น 365', QR_GUIDED); continue; }
        SESSION.set(userId, { ...sess, step: 'rubber_moisture', gross });
        await reply(rt, `✅ รวม ${gross} กก.\n\n💧 ความชื้น (%)? เช่น 20`, QR_GUIDED);
        continue;
      }
      if (sess?.step === 'rubber_moisture') {
        const moisture = parseFloat(text.replace(/,/g, '').replace(/%/g, ''));
        if (isNaN(moisture) || moisture < 0 || moisture > 60) { await reply(rt, '❌ ใส่ตัวเลข % ครับ เช่น 20', QR_GUIDED); continue; }
        const net = +((sess.gross * (1 - moisture / 100)).toFixed(1));
        SESSION.set(userId, { ...sess, step: 'rubber_price', moisture, net });
        await reply(rt, `✅ หัก ${moisture}% → สุทธิ ${net} กก.\n\n💵 ราคา/กก.? เช่น 38`, QR_GUIDED);
        continue;
      }
      if (sess?.step === 'rubber_price') {
        const price = parseFloat(text.replace(/,/g, ''));
        if (isNaN(price) || price <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ เช่น 38', QR_GUIDED); continue; }
        const total      = +(sess.net * price).toFixed(2);
        const halfOwner  = +(total / 2).toFixed(2);
        const halfWorker = +(total - halfOwner).toFixed(2);
        SESSION.set(userId, { ...sess, step: 'rubber_repay', price, total, halfOwner, halfWorker });
        await reply(rt,
          `✅ ยอดขาย ฿${fmt(total)}\n`
          + `  🏠 เจ้าของ ฿${fmt(halfOwner)}\n`
          + `  👷 ไท ฿${fmt(halfWorker)}\n\n`
          + `💳 ไทคืนเงินรอบนี้? (บาท หรือ 0)`,
          QR_GUIDED
        );
        continue;
      }
      if (sess?.step === 'rubber_repay') {
        const repay = parseFloat(text.replace(/,/g, '')) || 0;
        if (isNaN(repay) || repay < 0) { await reply(rt, '❌ ใส่ตัวเลขครับ หรือ 0', QR_GUIDED); continue; }
        SESSION.set(userId, { ...sess, step: 'rubber_advance', repay });
        await reply(rt, `✅ คืน ฿${fmt(repay)}\n\n📥 ไทเบิกใหม่รอบนี้? (บาท หรือ 0)`, QR_GUIDED);
        continue;
      }
      if (sess?.step === 'rubber_advance') {
        const advance = parseFloat(text.replace(/,/g, '')) || 0;
        if (isNaN(advance) || advance < 0) { await reply(rt, '❌ ใส่ตัวเลขครับ หรือ 0', QR_GUIDED); continue; }
        SESSION.delete(userId);
        const { gross, moisture, net, price, total, halfOwner, halfWorker, repay } = sess;
        const toOwner    = +(halfOwner + repay).toFixed(2);
        const workerNet  = +(halfWorker - repay).toFixed(2); // J = ส่วนแบ่งคนตัด - ชำระคืน (advance แยกต่างหาก)
        const date       = new Date().toISOString().slice(0, 10);
        const note       = `หัก ${moisture}% ความชื้น`;
        // A-M: วันที่, รวม, สุทธิ, ราคา, ยอดขาย, เจ้าของ, คนตัด, คืน, โอนเจ้าของ, คนตัดสุทธิ, ความชื้น, หมายเหตุ, เบิกใหม่
        await appendRubberSale([date, gross, net, price, total, halfOwner, halfWorker, repay, toOwner, workerNet, moisture, note, advance || '']);
        // อัปเดต ติดตามหนี้
        if (repay > 0) await appendDebtRecord(date, `คืนหนี้ รอบ ${date}`, 0, repay, '');
        if (advance > 0) await appendDebtRecord(date, `เบิกใหม่ รอบ ${date}`, advance, 0, '');
        const bal = await getWorkerBalance();
        await reply(rt,
          `✅ บันทึกขายยางแล้ว\n\n`
          + `⚖️ ${gross} กก. (สุทธิ ${net} กก.)\n`
          + `💵 ฿${price}/กก. = ฿${fmt(total)}\n`
          + `🏠 โอนเจ้าของ: ฿${fmt(toOwner)}\n`
          + `👷 ไทได้รับ: ฿${fmt(workerNet)}\n\n`
          + `💳 ยอดค้างไท: ฿${fmt(bal)}`,
          QR_RUBBER
        );
        continue;
      }

      // ── สวนยาง: เบิกเงินไท (กลางรอบ) ───────────────────────────────────
      if (/^เบิกเงิน$/i.test(text)) {
        SESSION.set(userId, { step: 'worker_draw' });
        await reply(rt, '👷 ไท เบิกเงินเท่าไหร่? (บาท)', QR_GUIDED);
        continue;
      }
      if (sess?.step === 'worker_draw') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ', QR_GUIDED); continue; }
        SESSION.delete(userId);
        const date = new Date().toISOString().slice(0, 10);
        await appendRubberSale([date, '', '', '', '', '', '', '', '', '', '', 'เบิกกลางรอบ', amt]);
        await appendDebtRecord(date, 'เบิกกลางรอบ', amt, 0, 'คนงานเบิกเงิน (ระหว่างรอบ)');
        const bal = await getWorkerBalance();
        await reply(rt, `✅ ไท เบิก ฿${fmt(amt)} แล้ว\n💳 ยอดค้างไท: ฿${fmt(bal)}`, QR_RUBBER);
        continue;
      }

      // ── สวนยาง: คืนเงินไท (กลางรอบ) ─────────────────────────────────────
      if (/^คืนเงิน$/i.test(text)) {
        SESSION.set(userId, { step: 'worker_repay' });
        await reply(rt, '💵 ไท คืนเงินเท่าไหร่? (บาท)', QR_GUIDED);
        continue;
      }
      if (sess?.step === 'worker_repay') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ', QR_GUIDED); continue; }
        SESSION.delete(userId);
        const date = new Date().toISOString().slice(0, 10);
        await appendRubberSale([date, '', '', '', '', '', '', amt, '', '', '', 'คืนกลางรอบ', '']);
        await appendDebtRecord(date, 'คืนกลางรอบ', 0, amt, '');
        const bal = await getWorkerBalance();
        await reply(rt, `✅ ไท คืน ฿${fmt(amt)} แล้ว\n💳 ยอดค้างไท: ฿${fmt(bal)}`, QR_RUBBER);
        continue;
      }

      // ── สวนยาง: ยอดค้างไท ────────────────────────────────────────────────
      if (/^ยอดค้างไท$/i.test(text)) {
        const bal = await getWorkerBalance();
        await reply(rt,
          `💳 ยอดค้างไท\n\n`
          + (bal > 0 ? `❌ ไท ค้างอยู่: ฿${fmt(bal)}`
            : bal < 0 ? `✅ จ่ายเกิน ฿${fmt(Math.abs(bal))} (ไท ยังมีเครดิต)`
            : `✅ ไม่มียอดค้าง`),
          QR_RUBBER
        );
        continue;
      }

      // ── สวนยาง: ประวัติยาง ───────────────────────────────────────────────
      if (/^ประวัติยาง$/i.test(text)) {
        const rows = await getRecentRubber(5);
        if (rows.length === 0) { await reply(rt, '🌿 ยังไม่มีประวัติขายยางครับ', QR_RUBBER); continue; }
        const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        const lines = rows.map(r => {
          const d = new Date(r[0]);
          return `📅 ${d.getDate()} ${TH_M[d.getMonth()]} ${d.getFullYear()+543}\n   ⚖️ ${r[2]} กก. × ฿${r[3]} = ฿${fmt(r[4])}`;
        });
        const bal = await getWorkerBalance();
        await reply(rt, `📜 ประวัติขายยางล่าสุด\n\n${lines.join('\n\n')}\n\n💳 ยอดค้างไท: ฿${fmt(bal)}`, QR_RUBBER);
        continue;
      }

      // ── สวนยาง: สรุปยาง ──────────────────────────────────────────────────
      if (/^สรุปยาง$/i.test(text)) {
        const [sum, bal] = await Promise.all([getRubberSummary(), getWorkerBalance()]);
        const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        const recentLines = sum.recent.map(r => {
          const d = new Date(r.date);
          return `  • ${d.getDate()} ${TH_M[d.getMonth()]} ${d.getFullYear()+543}: ${r.net} กก. ฿${fmt(r.total)}`;
        }).join('\n');
        await reply(rt,
          `🌿 สรุปสวนยาง ปี ${sum.year}\n\n`
          + `📦 ขาย ${sum.count} รอบ\n`
          + `⚖️ น้ำยางสุทธิ ${sum.totalKgNet.toLocaleString('th-TH')} กก.\n`
          + `💰 ยอดขายรวม ฿${fmt(sum.totalBaht)}\n`
          + `🏠 เจ้าของได้รับ ฿${fmt(sum.ownerBaht)}\n`
          + (recentLines ? `\n📅 รอบล่าสุด:\n${recentLines}\n` : '')
          + `\n💳 ยอดค้างไท: ฿${fmt(bal)}`,
          QR_RUBBER
        );
        continue;
      }

      // ── ยอดค้างเดือนนี้ (ห้องเช่า) ───────────────────────────────────────
      if (/^ยอดค้าง$/i.test(text)) {
        const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const now = new Date();
        const monthName = THAI_MONTHS[now.getMonth() + 1];
        const [summary, bill] = await Promise.all([getMonthlySummary(), getLastWaterElecBill()]);
        const paid = summary.byRoom || {};
        const expected = { 'ห้อง 1': 3500, 'ห้อง 2': 1000, 'ห้อง 3': 8000, 'คอนโด': 10000 };
        const lines = Object.entries(expected).map(([room, amt]) => {
          const p = paid[room] || 0;
          return p >= amt ? `✅ ${room} — ฿${amt.toLocaleString('th-TH')} รับแล้ว`
                          : `❌ ${room} — ฿${amt.toLocaleString('th-TH')} ยังไม่ได้รับ`;
        });
        let unpaid = Object.entries(expected).filter(([r, a]) => (paid[r] || 0) < a).reduce((s, [, a]) => s + a, 0);
        // ตรวจสอบบิลค่าน้ำไฟ
        let waterLine = '';
        if (bill) {
          const waterPaid = await isWaterBillPaid(bill.month);
          if (waterPaid) {
            waterLine = `✅ น้ำ/ไฟ (${bill.month}) — ฿${bill.total.toLocaleString('th-TH')} รับแล้ว`;
          } else {
            waterLine = `❌ น้ำ/ไฟ (${bill.month}) — ฿${bill.total.toLocaleString('th-TH')} ยังไม่ได้รับ`;
            unpaid += bill.total;
          }
        }
        await reply(rt,
          `⏰ ยอดค้างเดือน${monthName}\n\n`
          + lines.join('\n')
          + (waterLine ? '\n' + waterLine : '')
          + (unpaid > 0 ? `\n\n💰 รอรับอีก: ฿${unpaid.toLocaleString('th-TH')}` : '\n\n🎉 รับครบแล้ว!'),
          QR_RENTAL
        );
        continue;
      }

      // ── Rich Menu: ภาพรวม ─────────────────────────────────────────────────
      if (/^ภาพรวม$/i.test(text)) {
        const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const monthName = THAI_MONTHS[new Date().getMonth() + 1];
        const [sum, bankStatus, wStatus, rubberRows, rubBal, weBill] = await Promise.all([
          getMonthlySummary(), getBankStatus(), getWaterStatus(), getRecentRubber(2), getWorkerBalance(),
          getLastWaterElecBill()
        ]);
        const wePaid = weBill ? await isWaterBillPaid(weBill.month) : false;

        // 🏠 ห้องเช่า
        const expected = { 'ห้อง 1': 3500, 'ห้อง 2': 1000, 'ห้อง 3': 8000, 'คอนโด': 10000 };
        const rentLines = Object.entries(expected).map(([r, a]) =>
          (sum.byRoom[r] || 0) >= a ? `  ✅ ${r} ฿${a.toLocaleString('th-TH')}` : `  ❌ ${r} ยังไม่รับ`
        ).join('\n');

        // 🌿 สวนยาง
        const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        const rubLines = rubberRows.length > 0
          ? rubberRows.map(r => {
              const d = new Date(r[0]);
              return `  • ${d.getDate()} ${TH_M[d.getMonth()]} — ${r[2]} กก. × ฿${r[3]} = ฿${fmt(r[4])}`;
            }).join('\n')
          : '  ยังไม่มีข้อมูล';

        // 🏦 หนี้บ้าน
        const bankLines = BANK_MEMBERS.map(n => {
          const b = bankStatus.members[n].balance;
          return b <= 0 ? `✅ ${n}` : `❌ ${n}`;
        }).join(' | ');
        const bankSentLine = bankStatus.bankSent ? `  ✅ ส่งธนาคารแล้ว` : `  ⏳ ยังไม่ส่งธนาคาร`;

        // 💧 ค่าน้ำพ่วง
        const waterLines = WATER_TENANTS.map(t => {
          const b = wStatus.tenants[t]?.balance || 0;
          return b <= 0 ? `  ✅ ${t} — จ่ายแล้ว` : `  ❌ ${t} — ค้าง ฿${fmt(b)}`;
        }).join('\n');
        const mainLine = wStatus.lastMain
          ? (wStatus.lastMain.paid ? `  ✅ จ่ายหมี่แล้ว` : `  ⏳ ยังไม่จ่ายหมี่ (฿${fmt(wStatus.lastMain.totalAmount)})`)
          : `  📋 ยังไม่มีบิล`;

        const weLine = weBill
          ? (wePaid
              ? `  💡 น้ำ/ไฟ ${weBill.month}: ฿${fmt(weBill.wCost)}+฿${fmt(weBill.eCost)} = ฿${fmt(weBill.total)} ✅รับแล้ว`
              : `  💡 น้ำ/ไฟ ${weBill.month}: ฿${fmt(weBill.wCost)}+฿${fmt(weBill.eCost)} = ฿${fmt(weBill.total)} ⏳ยังไม่รับ`)
          : `  💡 น้ำ/ไฟ: ยังไม่มีบิล`;

        await reply(rt,
          `📊 ภาพรวม — ${monthName}\n`
          + `━━━━━━━━━━━━━━━━━━━━\n`
          + `🏠 ห้องเช่า\n${rentLines}\n`
          + `${weLine}\n`
          + `  💰 รวม ฿${sum.total.toLocaleString('th-TH')}\n`
          + `\n🌿 สวนยาง (${rubberRows.length} รอบล่าสุด)\n${rubLines}\n`
          + `  💳 ยอดค้างไท: ฿${fmt(rubBal)}\n`
          + `\n🏦 หนี้บ้าน\n  ${bankLines}\n${bankSentLine}\n`
          + `\n💧 ค่าน้ำพ่วง\n${waterLines}\n${mainLine}`
        );
        continue;
      }

      // ── ค่าเช่า → แสดงปุ่มห้อง ──────────────────────────────────────────
      if (/^ค่าเช่า$|^เช่า$/i.test(text)) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text', text:'🏠 เลือกห้องที่รับเงินครับ', quickReply: QR_ROOMS }] })
        });
        continue;
      }

      // ── ค่าเช่า ────────────────────────────────────────────────────────────
      if (/ค่าเช่า|จ่ายแล้ว|รับค่า|โอนแล้ว/i.test(text) || (/รับเงิน/i.test(text) && !/หนี้|น้ำ|พี่หมา|พี่แมว|พี่อ๊อด|อู๊ด/i.test(text))) {
        const room   = detectRoom(text);
        const amount = detectAmount(text);
        const date   = detectDate(text);

        if (room && amount) {
          await appendRent([date, room, 'ค่าเช่า', amount, 'รับแล้ว', '']);
          await reply(rt, `✅ บันทึกค่าเช่า${room} ฿${amount.toLocaleString('th-TH')} วันที่ ${thaiDate(date)} แล้วครับ`, QR_INCOME);
        } else {
          await reply(rt,
            `⚠️ ระบุห้องหรือจำนวนไม่ได้ ลองใหม่ครับ เช่น:\n`
            + `"รับค่าเช่าคอนโด 10000 วันที่ 22/04/26"\n`
            + `"รับค่าเช่าห้อง3 8000 5/4/26"`,
            QR_ROOMS
          );
        }
        continue;
      }

      // ── Help ───────────────────────────────────────────────────────────────
      if (/help|ช่วย|วิธีใช้|menu|เมนู/i.test(text)) {
        await reply(rt,
          `📋 ระบบบัญชีห้องเช่า\n\n`
          + `📊 ดูข้อมูล:\n`
          + `"สรุป" → รายรับเดือนนี้ + มิเตอร์\n`
          + `"รายรับ" → รายการล่าสุด 5 รายการ\n`
          + `"มิเตอร์" → มิเตอร์น้ำ/ไฟปัจจุบัน\n\n`
          + `💰 บันทึกค่าเช่า:\n`
          + `"รับค่าเช่าคอนโด 10000 22/04/26"\n`
          + `"รับค่าเช่าห้อง3 8000 5/4/26"\n\n`
          + `🔢 บันทึกมิเตอร์ + สร้างบิล:\n`
          + `"น้ำ 603 ไฟ 4900"\n\n`
          + `🏠 ห้องทั้งหมด:\n`
          + `• ห้อง 1 → 3,500/เดือน\n`
          + `• ห้อง 2 → 1,000/เดือน\n`
          + `• ห้อง 3 (สานิตย์) → 8,000/เดือน\n`
          + `• คอนโด (KIARA) → 10,000/เดือน`
        );
        continue;
      }

      // ── เริ่ม guided มิเตอร์ ─────────────────────────────────────────────
      if (/บันทึกมิเตอร์|ใส่มิเตอร์|มิเตอร์ใหม่/i.test(text)) {
        const { wPrev, ePrev } = await getLastMeters();
        SESSION.set(userId, { step: 'water', wPrev, ePrev });
        await reply(rt, `💧 มิเตอร์น้ำ = ? (ครั้งก่อน: ${wPrev})`, QR_GUIDED);
        continue;
      }

      // ── สรุปเดือนนี้ ──────────────────────────────────────────────────────
      if (/สรุป|summary|ภาพรวม/i.test(text)) {
        const [sum, meters] = await Promise.all([getMonthlySummary(), getLastMeters()]);
        const roomLines = Object.entries(sum.byRoom).map(([r, a]) => `  • ${r}: ฿${a.toLocaleString('th-TH')}`).join('\n');
        await reply(rt,
          `📊 สรุปเดือนนี้\n\n`
          + `💰 รายรับ: ฿${sum.total.toLocaleString('th-TH')} (${sum.count} รายการ)\n`
          + (roomLines ? roomLines + '\n' : '')
          + `\n💧 มิเตอร์น้ำปัจจุบัน: ${meters.wPrev}\n`
          + `⚡ มิเตอร์ไฟปัจจุบัน: ${meters.ePrev}`
        );
        continue;
      }

      // ── รายรับล่าสุด ──────────────────────────────────────────────────────
      if (/รายรับ|ล่าสุด/i.test(text) || (/ประวัติ/i.test(text) && !/น้ำ|ยาง|หนี้/i.test(text))) {
        const rows = await getRecentIncome(5);
        if (rows.length === 0) { await reply(rt, 'ยังไม่มีรายรับครับ'); continue; }
        const lines = rows.map(r => `  ${r[0]} · ${r[1]} · ฿${(+r[3]).toLocaleString('th-TH')}`).join('\n');
        await reply(rt, `💰 รายรับล่าสุด 5 รายการ:\n\n${lines}`);
        continue;
      }

      // ── มิเตอร์ ───────────────────────────────────────────────────────────
      if (/มิเตอร์|meter/i.test(text)) {
        const m = await getLastMeters();
        await reply(rt, `🔢 มิเตอร์ปัจจุบัน\n\n💧 น้ำ: ${m.wPrev}\n⚡ ไฟ: ${m.ePrev}`);
        continue;
      }

      // ══════════════════════════════════════════════════════════════════════
      // ── หนี้ธนาคาร ธอส. ────────────────────────────────────────────────
      // ══════════════════════════════════════════════════════════════════════

      if (/^หนี้บ้าน$/i.test(text)) {
        const status = await getBankStatus();
        const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const now = new Date();
        const monthName = THAI_MONTHS[now.getMonth() + 1];
        const lines = BANK_MEMBERS.map(name => {
          const m = status.members[name];
          const thisMon = m.thisPaid;
          if (thisMon >= BANK_MONTHLY) return `✅ ${name} — ฿${fmt(thisMon)} ครบแล้ว`;
          if (thisMon > 0)             return `⚠️ ${name} — ฿${fmt(thisMon)} / ${fmt(BANK_MONTHLY)} (ค้าง ฿${fmt(BANK_MONTHLY - thisMon)})`;
          return `❌ ${name} — ยังไม่จ่าย (ค้าง ฿${fmt(m.balance)})`;
        });
        const totalUnpaid = Object.values(status.members).filter(m => m.balance > 0).reduce((s, m) => s + m.balance, 0);
        await reply(rt,
          `🏦 หนี้ธนาคาร ธอส. — ${monthName}\n\n`
          + lines.join('\n')
          + `\n\n💰 รวมได้เดือนนี้: ฿${fmt(status.totalCollected)} / ฿${fmt(BANK_MONTHLY * 4)}`
          + (status.bankSent ? `\n✅ ส่งธนาคารแล้ว ฿${fmt(status.bankSentAmount)}` : '\n⏳ ยังไม่ได้ส่งธนาคาร')
          + (totalUnpaid > 0 ? `\n\n💳 ยอดค้างสะสมทั้งหมด: ฿${fmt(totalUnpaid)}` : ''),
          QR_BANK
        );
        continue;
      }

      // รับเงินหนี้บ้าน → เลือกชื่อ
      if (/^รับเงินหนี้บ้าน$/i.test(text)) {
        const qr = { items: BANK_MEMBERS.map(n => ({
          type:'action', action:{ type:'message', label:n, text:`เลือกรับเงิน ${n}` }
        })).concat([{ type:'action', action:{ type:'message', label:'↩️ กลับ', text:'หนี้บ้าน' } }]) };
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text', text:'💵 เลือกคนที่รับเงินครับ', quickReply: qr }] })
        });
        continue;
      }

      // กดชื่อสมาชิก → แสดงตัวเลือก จ่ายครบ / ระบุจำนวน
      {
        const mBankName = text.match(/^เลือกรับเงิน\s*(พี่หมา|พี่แมว|พี่อ๊อด|อู๊ด)$/i);
        if (mBankName) {
          const name = mBankName[1];
          SECTION.set(userId, 'bank');
          const status = await getBankStatus();
          const balance = status.members[name].balance;
          SESSION.set(userId, { step: 'bank_pay_name', name });
          const qr = { items: [
            { type:'action', action:{ type:'message', label:`✅ จ่ายครบ ฿${fmt(BANK_MONTHLY)}`, text:'จ่ายเต็ม' } },
            { type:'action', action:{ type:'message', label:'✏️ ระบุจำนวน', text:'ระบุจำนวน' } },
            { type:'action', action:{ type:'message', label:'❌ ยกเลิก', text:'ยกเลิก' } },
          ]};
          await reply(rt, `💵 รับเงิน${name}\n💳 ยอดค้าง: ฿${fmt(balance)}\n\nเลือกได้เลยครับ`, qr);
          continue;
        }
      }

      // กด "จ่ายเต็ม" → บันทึกเต็มจำนวนทันที
      if (/^จ่ายเต็ม$/i.test(text) && sess?.step === 'bank_pay_name') {
        SESSION.delete(userId);
        const { name } = sess;
        await appendBankPayment(name, BANK_MONTHLY);
        const status = await getBankStatus();
        const balance = status.members[name].balance;
        await reply(rt,
          `✅ รับเงิน${name} ฿${fmt(BANK_MONTHLY)} แล้วครับ\n`
          + (balance <= 0 ? `🎉 ${name} ไม่มียอดค้างแล้ว` : `💳 ${name} ยังค้างอยู่: ฿${fmt(balance)}`),
          QR_BANK
        );
        continue;
      }

      // กด "ระบุจำนวน" → ถามตัวเลข
      if (/^ระบุจำนวน$/i.test(text) && sess?.step === 'bank_pay_name') {
        SESSION.set(userId, { step: 'bank_pay_amount', name: sess.name });
        await reply(rt, `✏️ พิมพ์จำนวนที่รับครับ (บาท)`, QR_GUIDED);
        continue;
      }

      // guided: รอจำนวนเงิน
      if (sess?.step === 'bank_pay_amount') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ เช่น 2000', QR_GUIDED); continue; }
        SESSION.delete(userId);
        const { name } = sess;
        await appendBankPayment(name, amt);
        const status = await getBankStatus();
        const balance = status.members[name].balance;
        await reply(rt,
          `✅ รับเงิน${name} ฿${fmt(amt)} แล้วครับ\n`
          + (balance <= 0 ? `🎉 ${name} ไม่มียอดค้างแล้ว` : `💳 ${name} ยังค้างอยู่: ฿${fmt(balance)}`),
          QR_BANK
        );
        continue;
      }

      // พิมพ์เองตรงๆ: "รับเงินพี่หมา 3575"
      {
        const mBank = text.match(/^รับเงิน(พี่หมา|พี่แมว|พี่อ๊อด|อู๊ด)\s+(\d[\d,]*)/i);
        if (mBank) {
          const name   = mBank[1];
          const amount = parseInt(mBank[2].replace(/,/g, ''));
          SECTION.set(userId, 'bank');
          await appendBankPayment(name, amount);
          const status = await getBankStatus();
          const balance = status.members[name].balance;
          await reply(rt,
            `✅ รับเงิน${name} ฿${fmt(amount)} แล้วครับ\n`
            + (balance <= 0 ? `🎉 ${name} ไม่มียอดค้างแล้ว` : `💳 ${name} ยังค้างอยู่: ฿${fmt(balance)}`),
            QR_BANK
          );
          continue;
        }
      }

      if (/^ยอดค้างบ้าน$/i.test(text)) {
        const status = await getBankStatus();
        const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const monthName = THAI_MONTHS[new Date().getMonth() + 1];
        const lines = BANK_MEMBERS.map(name => {
          const b = status.members[name].balance;
          return b <= 0 ? `✅ ${name} — ไม่มียอดค้าง` : `❌ ${name} — ค้าง ฿${fmt(b)}`;
        });
        await reply(rt,
          `⏰ ยอดค้างหนี้บ้าน — ${monthName}\n\n` + lines.join('\n')
          + (status.bankSent ? `\n\n✅ ส่งธนาคารแล้ว` : `\n\n⏳ ยังไม่ส่งธนาคาร`),
          QR_BANK
        );
        continue;
      }

      if (/^ส่งธนาคารแล้ว$/i.test(text)) {
        const status = await getBankStatus();
        if (status.bankSent) {
          await reply(rt, `✅ บันทึกส่งธนาคารเดือนนี้แล้วครับ (฿${fmt(status.bankSentAmount)})`, QR_BANK);
          continue;
        }
        SESSION.set(userId, { step: 'bank_sent_amount' });
        await reply(rt, `🏦 ส่งธนาคารเท่าไหร่ครับ? (ปกติ ฿${fmt(BANK_MONTHLY * 4)})`, QR_GUIDED);
        continue;
      }
      if (sess?.step === 'bank_sent_amount') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ', QR_GUIDED); continue; }
        SESSION.delete(userId);
        await appendBankSent(amt);
        await reply(rt, `✅ บันทึกส่งธนาคาร ฿${fmt(amt)} แล้วครับ`, QR_BANK);
        continue;
      }

      if (/^ประวัติหนี้บ้าน$/i.test(text)) {
        const history = await getBankHistory(3);
        if (history.length === 0) { await reply(rt, '📜 ยังไม่มีประวัติครับ', QR_BANK); continue; }
        const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const lines = history.map(h => {
          const [y, m] = h.month.split('-');
          const mName = THAI_MONTHS[parseInt(m)];
          const entries = BANK_MEMBERS.map(name => {
            const p = h.payments[name] || 0;
            return p > 0 ? `  ${name}: ฿${fmt(p)}` : `  ${name}: ❌`;
          }).join('\n');
          return `📅 ${mName} ${parseInt(y)+543}\n${entries}`;
        });
        await reply(rt, `📜 ประวัติหนี้บ้าน\n\n` + lines.join('\n\n'), QR_BANK);
        continue;
      }

      // ══════════════════════════════════════════════════════════════════════
      // ── ค่าน้ำพ่วง ─────────────────────────────────────────────────────
      // ══════════════════════════════════════════════════════════════════════

      if (/^น้ำพ่วง$/i.test(text)) {
        const wStatus = await getWaterStatus();
        const lines = WATER_TENANTS.map(t => {
          const b = wStatus.tenants[t]?.balance || 0;
          return b <= 0 ? `✅ ${t} — ไม่มียอดค้าง` : `❌ ${t} — ค้าง ฿${fmt(b)}`;
        });
        const mainInfo = wStatus.lastMain
          ? (wStatus.lastMain.paid ? `✅ จ่ายหมี่แล้ว` : `⏳ ยังไม่จ่ายหมี่ (฿${fmt(wStatus.lastMain.totalAmount)})`)
          : `📋 ยังไม่มีบิล`;
        await reply(rt,
          `💧 ค่าน้ำพ่วง\n\n` + lines.join('\n') + `\n\n${mainInfo}`,
          QR_WATER
        );
        continue;
      }

      // ── ออกบิลประปา (step 1/2: ยอดบิล) ──────────────────────────────────
      if (/^ออกบิลประปา$|^บันทึกน้ำพ่วง$/i.test(text)) {
        SESSION.set(userId, { step: 'water_bill_amount' });
        await reply(rt, `💧 ออกบิลประปา\n\nขั้นที่ 1/2\n💰 ยอดรวมบิลประปา (฿)?\nเช่น 492.20`, QR_GUIDED);
        continue;
      }
      if (sess?.step === 'water_bill_amount') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ เช่น 492.20', QR_GUIDED); continue; }
        SESSION.set(userId, { step: 'water_bill_units', mainAmount: amt });
        await reply(rt, `✅ ยอดบิล ฿${fmt(amt)}\n\nขั้นที่ 2/2\n🔢 หน่วยรวมในบิล?\nเช่น 24`, QR_GUIDED);
        continue;
      }
      if (sess?.step === 'water_bill_units') {
        const units = parseInt(text.replace(/,/g, ''));
        if (isNaN(units) || units <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ เช่น 24', QR_GUIDED); continue; }
        const rate  = +(sess.mainAmount / units).toFixed(4);
        const month = new Date().toISOString().slice(0, 7);
        SESSION.delete(userId);
        await appendWaterMainBill(month, units, sess.mainAmount);
        await reply(rt,
          `✅ บันทึกบิลประปาแล้วครับ\n\n`
          + `📋 ${month}\n💰 ฿${fmt(sess.mainAmount)} / ${units} หน่วย\n📊 ฿${fmt(rate)}/หน่วย\n\n`
          + `กดปุ่ม 💧 น้ำอารี หรือ 💧 น้ำไข่ดำ เพื่อบันทึกมิเตอร์แต่ละคนได้เลยครับ`,
          QR_WATER
        );
        continue;
      }

      // ── น้ำอารี / น้ำไข่ดำ — บันทึกมิเตอร์แยกรายคน ─────────────────────
      {
        const mSub = text.match(/^น้ำ(อารี|ไข่ดำ)$/i);
        if (mSub) {
          const tenant = mSub[1];
          const wStatus = await getWaterStatus();
          if (!wStatus.lastMain) {
            await reply(rt, `❌ ยังไม่มีบิลประปาเดือนนี้\nกรุณากด 📋 ออกบิลประปา ก่อนครับ`, QR_WATER);
            continue;
          }
          const { rate, month } = wStatus.lastMain;
          const prev = await getLastWaterSubMeter(tenant);
          SESSION.set(userId, { step: 'water_sub_meter', tenant, rate, month, prev });
          await reply(rt,
            `💧 มิเตอร์${tenant} — ${month}\n(ครั้งก่อน: ${prev})\n\nใส่มิเตอร์ครั้งนี้ครับ`,
            QR_GUIDED
          );
          continue;
        }
      }
      if (sess?.step === 'water_sub_meter') {
        const m = parseInt(text.replace(/,/g, ''));
        if (isNaN(m) || m < (sess.prev || 0)) {
          await reply(rt, `❌ ต้องมากกว่า ${sess.prev} ครับ`, QR_GUIDED); continue;
        }
        SESSION.delete(userId);
        const { tenant, rate, month, prev } = sess;
        const units   = m - prev;
        const amount  = +(units * rate).toFixed(2);
        const today   = new Date().toISOString().slice(0, 10);
        const dueD    = new Date(today);
        dueD.setDate(dueD.getDate() + 7);
        const dueDateStr = dueD.toISOString().slice(0, 10);

        await appendWaterBill(month, tenant, prev, m, rate, today, dueDateStr);

        const TH_M = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const [my, mm] = month.split('-');
        const monthThai = TH_M[parseInt(mm)] + ' ' + (parseInt(my) + 543);
        const dueThai   = `${dueD.getDate()} ${TH_M[dueD.getMonth()+1]} ${dueD.getFullYear()+543}`;

        const bill = `━━━━━━━━━━━━━━━━━━━━\n💧 ใบแจ้งค่าน้ำประปา\n━━━━━━━━━━━━━━━━━━━━\nเดือน: ${monthThai}\nผู้เช่า: ${tenant}\n\n📊 การใช้น้ำ\nมิเตอร์ครั้งก่อน : ${prev}\nมิเตอร์ครั้งนี้  : ${m}\nหน่วยที่ใช้      : ${units} หน่วย\nราคาต่อหน่วย     : ฿${fmt(rate)}\n\n💰 ยอดชำระ: ฿${fmt(amount)}\n\n📅 ชำระภายใน: ${dueThai}\n📍 ชำระที่: หมี่ (ห้องด้านหน้า)\n━━━━━━━━━━━━━━━━━━━━`;

        await reply(rt,
          `✅ บันทึกน้ำ${tenant} แล้วครับ\n\n📋 บิล${tenant} (ส่ง Messenger):\n${bill}`,
          QR_WATER
        );
        continue;
      }

      // รับเงินน้ำ: "รับเงินน้ำอารี 164"
      {
        const mWater = text.match(/^รับเงินน้ำ(อารี|ไข่ดำ)\s+(\d[\d,]*)/i);
        if (mWater) {
          const tenant = mWater[1];
          const amount = parseInt(mWater[2].replace(/,/g, ''));
          const month  = new Date().toISOString().slice(0, 7);
          await appendWaterPayment(tenant, month, amount);
          const wStatus = await getWaterStatus();
          const balance = wStatus.tenants[tenant]?.balance || 0;
          await reply(rt,
            `✅ รับเงินน้ำ${tenant} ฿${fmt(amount)} แล้วครับ\n`
            + (balance <= 0 ? `🎉 ${tenant} ไม่มียอดค้างแล้ว` : `💳 ${tenant} ยังค้างอยู่: ฿${fmt(balance)}`),
            QR_WATER
          );
          continue;
        }
      }

      if (/^จ่ายหมี่แล้ว$/i.test(text)) {
        const wStatus = await getWaterStatus();
        if (wStatus.lastMain?.paid) {
          await reply(rt, `✅ บันทึกจ่ายหมี่แล้วครับ`, QR_WATER); continue;
        }
        SESSION.set(userId, { step: 'water_main_paid' });
        const owing = wStatus.lastMain?.totalAmount || 0;
        await reply(rt, `💧 จ่ายหมี่เท่าไหร่ครับ?${owing > 0 ? ` (บิลล่าสุด ฿${fmt(owing)})` : ''}`, QR_GUIDED);
        continue;
      }
      if (sess?.step === 'water_main_paid') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ', QR_GUIDED); continue; }
        SESSION.delete(userId);
        await appendWaterMainPaid(amt);
        await reply(rt, `✅ บันทึกจ่ายหมี่ ฿${fmt(amt)} แล้วครับ`, QR_WATER);
        continue;
      }

      if (/^ยอดค้างน้ำ$/i.test(text)) {
        const wStatus = await getWaterStatus();
        const lines = WATER_TENANTS.map(t => {
          const b = wStatus.tenants[t]?.balance || 0;
          return b <= 0 ? `✅ ${t} — ไม่มียอดค้าง` : `❌ ${t} — ค้าง ฿${fmt(b)}`;
        });
        const mainLine = wStatus.lastMain
          ? (wStatus.lastMain.paid ? `✅ จ่ายหมี่แล้ว` : `❌ ยังไม่จ่ายหมี่ (฿${fmt(wStatus.lastMain.totalAmount)})`)
          : '';
        await reply(rt,
          `💧 ยอดค้างค่าน้ำพ่วง\n\n` + lines.join('\n') + (mainLine ? '\n' + mainLine : ''),
          QR_WATER
        );
        continue;
      }

      if (/^ประวัติน้ำ(อารี|ไข่ดำ)$/i.test(text)) {
        const tenant  = text.match(/^ประวัติน้ำ(อารี|ไข่ดำ)$/i)[1];
        const history = await getWaterHistory(tenant, 3);
        if (history.length === 0) { await reply(rt, `📜 ยังไม่มีประวัติค่าน้ำ${tenant}ครับ`, QR_WATER); continue; }
        const lines = history.map(h =>
          `📅 ${h.month}\n  มิเตอร์: ${h.meterOld}→${h.meterNew} (${h.units} หน่วย)\n  ฿${fmt(h.amount)} ${h.paid ? '✅ จ่ายแล้ว' : '❌ ค้าง'}`
        );
        await reply(rt, `📜 ประวัติค่าน้ำ${tenant}\n\n` + lines.join('\n\n'), QR_WATER);
        continue;
      }

      // ── ยอดค้างทั้งหมด ─────────────────────────────────────────────────────────
      if (/^ยอดค้างทั้งหมด$|^สรุปทั้งหมด$/i.test(text)) {
        const THAI_MONTHS_F = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const today     = new Date();
        const todayDay  = today.getDate();
        const todayStr  = today.toISOString().slice(0,10);
        const monthName = THAI_MONTHS_F[today.getMonth() + 1];

        const [allIncome, bankStatus, rubBal, areeHist, kaidamHist, weBills] = await Promise.all([
          getAllIncome(), getBankStatus(), getWorkerBalance(),
          getWaterHistory('อารี', 12), getWaterHistory('ไข่ดำ', 12),
          getAllWaterElecBills()
        ]);

        // ── 🏠 ห้องเช่า: ตรวจ 3 เดือนย้อนหลัง ────────────────────────────────
        const RENT_EXP = { 'ห้อง 1': 3500, 'ห้อง 2': 1000, 'ห้อง 3': 8000, 'คอนโด': 10000 };
        const paidByMonth = {};
        for (const r of allIncome) {
          if (r[2] !== 'ค่าเช่า') continue;
          const m = r[0].slice(0,7);
          if (!paidByMonth[m]) paidByMonth[m] = {};
          paidByMonth[m][r[1]] = (paidByMonth[m] [r[1]] || 0) + (+r[3] || 0);
        }
        const rentOverdue = [];
        for (let i = 0; i <= 2; i++) {
          const d  = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const m  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          const mn = THAI_MONTHS_F[d.getMonth()+1];
          if (i === 0 && todayDay <= 5) continue; // ยังไม่ถึงกำหนด (ก่อนวันที่ 6)
          const paid = paidByMonth[m] || {};
          for (const [room, amt] of Object.entries(RENT_EXP)) {
            if ((paid[room] || 0) < amt) {
              rentOverdue.push(`  ❌ ${room} ฿${(amt-(paid[room]||0)).toLocaleString('th-TH')} (${mn})`);
            }
          }
        }

        // ── 💡 น้ำ/ไฟ ห้อง 3: ตรวจบิลที่ยังไม่รับเงิน ──────────────────────────
        const paidWeMonths = new Set(
          allIncome.filter(r => r[2] === 'ค่าน้ำไฟ').map(r => r[5]).filter(Boolean)
        );
        const weOverdue = weBills
          .filter(b => !paidWeMonths.has(b.month))
          .map(b => `  ❌ น้ำ/ไฟ ${b.month}: ฿${fmt(b.wCost)}+฿${fmt(b.eCost)} = ฿${fmt(b.total)}`);

        // ── 🏦 หนี้บ้าน: ยอดค้างสะสม ─────────────────────────────────────────
        const bankOverdue = [];
        for (const name of BANK_MEMBERS) {
          let bal = bankStatus.members[name].balance;
          if (todayDay <= 6) bal = Math.max(0, bal - BANK_MONTHLY); // ยังไม่ถึงกำหนดเดือนนี้
          if (bal > 0) bankOverdue.push(`  ❌ ${name} — ค้าง ฿${fmt(bal)}`);
        }
        if (!bankStatus.bankSent && todayDay > 6) bankOverdue.push(`  ⏳ ยังไม่ส่งธนาคาร`);

        // ── 💧 ค่าน้ำพ่วง: ตรวจ dueDate ──────────────────────────────────────
        const waterOverdue = [];
        for (const [tenant, hist] of [['อารี', areeHist], ['ไข่ดำ', kaidamHist]]) {
          let owed = 0; const months = [];
          for (const h of hist) {
            if (!h.paid && h.dueDate && h.dueDate < todayStr) { owed += h.amount; months.push(h.month); }
          }
          if (owed > 0) waterOverdue.push(`  ❌ ${tenant} — ฿${fmt(owed)} (${months.join(', ')})`);
        }

        const msg = [
          `💰 ยอดค้างทั้งหมด — ${monthName}`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `🏠 ห้องเช่า`,
          ...(rentOverdue.length > 0 ? rentOverdue : [`  ✅ ค่าเช่า ไม่มียอดค้าง`]),
          ...(weOverdue.length > 0 ? weOverdue : [`  ✅ น้ำ/ไฟ ไม่มียอดค้าง`]),
          ``,
          `🌿 สวนยาง`,
          rubBal > 0 ? `  💳 ยอดเบิกไทค้าง: ฿${fmt(rubBal)}` : `  ✅ ไม่มียอดค้างไท`,
          ``,
          `🏦 หนี้บ้าน`,
          ...(bankOverdue.length > 0 ? bankOverdue : [`  ✅ ไม่มียอดค้าง`]),
          ``,
          `💧 ค่าน้ำพ่วง`,
          ...(waterOverdue.length > 0 ? waterOverdue : [`  ✅ ไม่มียอดค้าง`]),
        ];
        await reply(rt, msg.join('\n'), sectionQR(userId));
        continue;
      }

      // ── Fallback ───────────────────────────────────────────────────────────
      await reply(rt, `ไม่เข้าใจครับ 😅 พิมพ์ "help" เพื่อดูวิธีใช้`, sectionQR(userId));

    } catch (err) {
      console.error('Error:', err);
      await reply(rt, `❌ เกิดข้อผิดพลาด: ${err.message}`, sectionQR(userId));
    }
  }
});

app.get('/last-hook', (req, res) => res.json({ hook: _lastHook, reply: _lastReply }));

// ── Setup Rich Menu (เรียกครั้งเดียว) ────────────────────────────────────────
app.get('/setup-richmenu', async (req, res) => {
  try {
    const fs = require('fs'), path = require('path');
    const imgPath = path.join(__dirname, 'richmenu.png');
    if (!fs.existsSync(imgPath)) return res.status(404).send('richmenu.png not found');

    // ลบเมนูเก่า
    const list = await fetch('https://api.line.me/v2/bot/richmenu/list', { headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.json());
    for (const m of (list.richmenus || [])) {
      await fetch(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
    }

    // สร้าง Rich Menu 2×3
    const menuRes = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size: { width: 2500, height: 1686 }, selected: true,
        name: 'Main Menu 2x3', chatBarText: '📋 เมนู',
        areas: [
          { bounds: { x: 0,    y: 0,   width: 833,  height: 843 }, action: { type: 'message', text: 'ห้องเช่า' } },
          { bounds: { x: 833,  y: 0,   width: 834,  height: 843 }, action: { type: 'message', text: 'สวนยาง'  } },
          { bounds: { x: 1667, y: 0,   width: 833,  height: 843 }, action: { type: 'message', text: 'ภาพรวม'  } },
          { bounds: { x: 0,    y: 843, width: 833,  height: 843 }, action: { type: 'message', text: 'หนี้บ้าน' } },
          { bounds: { x: 833,  y: 843, width: 834,  height: 843 }, action: { type: 'message', text: 'น้ำพ่วง'  } },
          { bounds: { x: 1667, y: 843, width: 833,  height: 843 }, action: { type: 'message', text: 'ยอดค้างทั้งหมด' } },
        ]
      })
    }).then(r => r.json());
    if (!menuRes.richMenuId) return res.status(500).json({ error: menuRes });

    // Upload รูป
    const imgData = fs.readFileSync(imgPath);
    await fetch(`https://api-data.line.me/v2/bot/richmenu/${menuRes.richMenuId}/content`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' }, body: imgData
    });

    // ตั้ง default
    await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${menuRes.richMenuId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }
    });

    res.send('✅ Rich Menu พร้อมแล้ว! id: ' + menuRes.richMenuId);
  } catch (e) { res.status(500).send('❌ ' + e.message); }
});

app.get('/debug-rubber', async (req, res) => {
  try {
    const crypto = require('crypto');
    const SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const RUBBER_ID = '12N5-WXFkoKg06K7F5rGA0bfjHJJZ06cIJ8oKy1WsmJ8';
    // get token
    const now = Math.floor(Date.now()/1000);
    const b64 = s => Buffer.from(typeof s==='string'?s:JSON.stringify(s)).toString('base64url');
    const header = b64({alg:'RS256',typ:'JWT'});
    const claim  = b64({iss:SA.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now});
    const sign = crypto.createSign('RSA-SHA256'); sign.update(`${header}.${claim}`);
    const jwt = `${header}.${claim}.${sign.sign(SA.private_key).toString('base64url')}`;
    const tokRes = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`});
    const tokData = await tokRes.json();
    if (!tokData.access_token) return res.json({error:'token failed', tokData});
    // test read ติดตามหนี้
    const r1 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${RUBBER_ID}/values/${encodeURIComponent('ติดตามหนี้!A:F')}`,{headers:{Authorization:`Bearer ${tokData.access_token}`}});
    const d1 = await r1.json();
    // test read ชีต1
    const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${RUBBER_ID}/values/${encodeURIComponent('ชีต1!A:E')}`,{headers:{Authorization:`Bearer ${tokData.access_token}`}});
    const d2 = await r2.json();
    res.json({ token_ok: true, debt_rows: d1.values?.length||0, debt_error: d1.error, sheet1_rows: d2.values?.length||0, sheet1_error: d2.error, rubber_id: RUBBER_ID });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
// ── Init Headers (เรียกครั้งเดียว) ───────────────────────────────────────────
// ── บันทึกจ่ายครบเมษา 2569 (ใช้ครั้งเดียว) ──────────────────────────────────
app.get('/seed-april-paid', async (req, res) => {
  try {
    const results = [];
    for (const name of BANK_MEMBERS) {
      await appendBankPayment(name, BANK_MONTHLY, 'บันทึกย้อนหลัง เม.ย. 2569');
      results.push(`✅ ${name} ฿${BANK_MONTHLY}`);
    }
    res.send('บันทึกเมษาครบแล้วครับ:\n' + results.join('\n'));
  } catch (e) { res.status(500).send('❌ ' + e.message); }
});

app.get('/init-sheets', async (req, res) => {
  try {
    const { appendToSheet } = require('./sheets');
    const results = [];

    const tabs = [
      { range: 'หนี้_รับเงิน!A1',   values: ['วันที่', 'เดือน', 'ชื่อ', 'ยอด', 'หมายเหตุ'] },
      { range: 'หนี้_ส่งธนาคาร!A1', values: ['วันที่', 'เดือน', 'ยอด', 'หมายเหตุ'] },
      { range: 'น้ำ_พ่วง!A1',       values: ['เดือน', 'ผู้เช่า', 'มิเตอร์เก่า', 'มิเตอร์ใหม่', 'หน่วย', 'ราคา/หน่วย', 'ยอด', 'วันออกบิล', 'วันครบกำหนด'] },
      { range: 'น้ำ_รับเงิน!A1',    values: ['วันที่', 'ผู้เช่า', 'เดือน', 'ยอด', 'หมายเหตุ'] },
      { range: 'น้ำ_บิลหลัก!A1',    values: ['วันที่', 'เดือน', 'หน่วยรวม', 'ยอดรวม', 'สถานะ', 'วันจ่ายหมี่'] },
    ];

    // ใช้ Sheets API เขียนตรงไปที่ A1 (ไม่ใช้ append)
    const crypto = require('crypto');
    const SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const SHEET_ID = '1IWF5gZ_w0EqbMu5uAHMF4w3I6PAgxbKb_aMeRQNDXgE';

    const now = Math.floor(Date.now() / 1000);
    const b64 = s => Buffer.from(typeof s === 'string' ? s : JSON.stringify(s)).toString('base64url');
    const header = b64({ alg: 'RS256', typ: 'JWT' });
    const claim  = b64({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
    const sign = crypto.createSign('RSA-SHA256'); sign.update(`${header}.${claim}`);
    const jwt = `${header}.${claim}.${sign.sign(SA.private_key).toString('base64url')}`;
    const tokRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
    const { access_token } = await tokRes.json();

    for (const tab of tabs) {
      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab.range)}?valueInputOption=RAW`,
        { method: 'PUT', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [tab.values], majorDimension: 'ROWS' }) }
      );
      const d = await r.json();
      results.push({ tab: tab.range, ok: r.ok, updatedCells: d.updatedCells });
    }

    res.json({ success: true, results });
  } catch (e) { res.status(500).send('❌ ' + e.message); }
});

app.get('/', (req, res) => res.send('Rental LINE Bot ✅'));
app.get('/sa-email', (req, res) => {
  try {
    const SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    res.send('Service Account: ' + SA.client_email);
  } catch(e) { res.status(500).send('❌ ' + e.message); }
});
app.get('/env-check', (req, res) => res.json({
  SECRET_set: !!SECRET,
  SECRET_len: SECRET ? SECRET.length : 0,
  TOKEN_set: !!TOKEN,
  TOKEN_len: TOKEN ? TOKEN.length : 0,
}));
// ── Cron: แจ้งเตือนค้างชำระ ────────────────────────────────────────────────────
// Render.com ใช้ UTC — ไทย = UTC+7 → 09:00 ไทย = 02:00 UTC
const cron = require('node-cron');

// วันที่ 6 เวลา 09:00 ไทย — แจ้งเตือนหนี้บ้าน ธอส.
cron.schedule('0 2 6 * *', async () => {
  if (!OWNER_ID) return;
  try {
    const status = await getBankStatus();
    const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const monthName = THAI_MONTHS[new Date().getMonth() + 1];
    const unpaid = BANK_MEMBERS.filter(n => status.members[n].balance > 0);
    if (unpaid.length === 0 && status.bankSent) return; // ทุกคนจ่ายครบ + ส่งธนาคารแล้ว
    const lines = BANK_MEMBERS.map(n => {
      const b = status.members[n].balance;
      return b <= 0 ? `✅ ${n} — ชำระครบแล้ว` : `❌ ${n} — ค้าง ฿${fmt(b)}`;
    });
    if (!status.bankSent) lines.push(`⏳ ยังไม่ได้ส่งธนาคาร`);
    await push(OWNER_ID,
      `⚠️ แจ้งเตือนหนี้บ้าน ธอส. — ${monthName}\n\n${lines.join('\n')}\n\nกรุณาติดตามการชำระเงินครับ`,
      QR_BANK
    );
    console.log('🔔 Cron: ส่งแจ้งเตือนหนี้บ้านแล้ว');
  } catch (e) { console.error('Cron bank error:', e.message); }
});

// วันที่ 10 เวลา 09:00 ไทย — แจ้งเตือนค่าเช่าค้าง
cron.schedule('0 2 10 * *', async () => {
  if (!OWNER_ID) return;
  try {
    const summary = await getMonthlySummary();
    const expected = { 'ห้อง 1': 3500, 'ห้อง 2': 1000, 'ห้อง 3': 8000, 'คอนโด': 10000 };
    const unpaid = Object.entries(expected).filter(([r, a]) => (summary.byRoom[r] || 0) < a);
    if (unpaid.length === 0) return; // ไม่มีค้าง ไม่ต้องแจ้ง
    const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const monthName = THAI_MONTHS[new Date().getMonth() + 1];
    const lines = unpaid.map(([r, a]) => {
      const paid = summary.byRoom[r] || 0;
      return `❌ ${r} — ค้าง ฿${fmt(a - paid)}`;
    }).join('\n');
    await push(OWNER_ID,
      `⚠️ แจ้งเตือนค่าเช่า — ${monthName}\n\n${lines}\n\nกรุณาติดตามการชำระเงินครับ`,
      QR_RENTAL
    );
    console.log('🔔 Cron: ส่งแจ้งเตือนค่าเช่าแล้ว');
  } catch (e) { console.error('Cron rent error:', e.message); }
});

// วันที่ 14 เวลา 09:00 ไทย — แจ้งเตือนค่าน้ำพ่วงค้าง
cron.schedule('0 2 14 * *', async () => {
  if (!OWNER_ID) return;
  try {
    const wStatus = await getWaterStatus();
    const hasUnpaidMain = wStatus.lastMain && !wStatus.lastMain.paid;
    const unpaidTenants = WATER_TENANTS.filter(t => (wStatus.tenants[t]?.balance || 0) > 0);
    if (unpaidTenants.length === 0 && !hasUnpaidMain) return; // ไม่มีค้าง
    const THAI_MONTHS = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const monthName = THAI_MONTHS[new Date().getMonth() + 1];
    const lines = WATER_TENANTS.map(t => {
      const b = wStatus.tenants[t]?.balance || 0;
      return b <= 0 ? `✅ ${t} — ชำระครบแล้ว` : `❌ ${t} — ค้าง ฿${fmt(b)}`;
    });
    if (hasUnpaidMain) lines.push(`⏳ ยังไม่จ่ายหมี่ ฿${fmt(wStatus.lastMain.totalAmount)}`);
    await push(OWNER_ID,
      `⚠️ แจ้งเตือนค่าน้ำพ่วง — ${monthName}\n\n${lines.join('\n')}\n\nกรุณาติดตามการชำระเงินครับ`,
      QR_WATER
    );
    console.log('🔔 Cron: ส่งแจ้งเตือนค่าน้ำแล้ว');
  } catch (e) { console.error('Cron water error:', e.message); }
});

app.listen(PORT, () => console.log(`Port ${PORT}`));
