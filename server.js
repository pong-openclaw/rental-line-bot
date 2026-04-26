const express = require('express');
const crypto  = require('crypto');
const { appendRent, appendWaterElec, getLastMeters, getRecentIncome, getMonthlySummary, getLastWaterElecBill, appendRubberSale, appendWorker, getWorkerBalance, getRubberSummary } = require('./sheets');

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
const QUICK_REPLIES = {
  items: ['ค่าเช่า','บันทึกมิเตอร์','รับเงินแล้ว','สรุป','รายรับ'].map(label => ({
    type: 'action',
    action: { type: 'message', label, text: label }
  }))
};

async function reply(replyToken, text) {
  const message = { type: 'text', text, quickReply: QUICK_REPLIES };
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
    const sess   = SESSION.get(userId);

    try {
      // ── Guided: รอมิเตอร์น้ำ ─────────────────────────────────────────────
      if (sess?.step === 'water') {
        const w = parseInt(text.replace(/,/g,''));
        if (isNaN(w)) { await reply(rt, '❌ ใส่แค่ตัวเลขครับ เช่น 603'); continue; }
        SESSION.set(userId, { step: 'elec', water: w });
        await reply(rt, `⚡ มิเตอร์ไฟ = ? (ครั้งก่อน: ${sess.ePrev})`);
        continue;
      }

      // ── Guided: รอมิเตอร์ไฟ ─────────────────────────────────────────────
      if (sess?.step === 'elec') {
        const e = parseInt(text.replace(/,/g,''));
        if (isNaN(e)) { await reply(rt, '❌ ใส่แค่ตัวเลขครับ เช่น 4900'); continue; }
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
          ...QUICK_REPLIES.items
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

      // ── Rich Menu: ห้องเช่า ──────────────────────────────────────────────
      if (/^ห้องเช่า$/i.test(text)) {
        const qr = { items: [
          { type:'action', action:{ type:'message', label:'💰 ค่าเช่า',       text:'ค่าเช่า' } },
          { type:'action', action:{ type:'message', label:'💧 บันทึกมิเตอร์', text:'บันทึกมิเตอร์' } },
          { type:'action', action:{ type:'message', label:'💵 รับเงินแล้ว',   text:'รับเงินแล้ว' } },
          { type:'action', action:{ type:'message', label:'⏰ ยอดค้าง',        text:'ยอดค้าง' } },
          { type:'action', action:{ type:'message', label:'📊 สรุป',           text:'สรุป' } },
        ]};
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text', text:'🏠 ห้องเช่า — เลือกได้เลยครับ', quickReply: qr }] })
        });
        continue;
      }

      // ── Rich Menu: สวนยาง ─────────────────────────────────────────────────
      if (/^สวนยาง$/i.test(text)) {
        const qr = { items: [
          { type:'action', action:{ type:'message', label:'🌿 ขายยาง',   text:'ขายยาง' } },
          { type:'action', action:{ type:'message', label:'👷 ไท เบิกเงิน', text:'เบิกเงิน' } },
          { type:'action', action:{ type:'message', label:'💵 ไท คืนเงิน', text:'คืนเงิน' } },
          { type:'action', action:{ type:'message', label:'📋 ยอดค้างไท', text:'ยอดค้างไท' } },
          { type:'action', action:{ type:'message', label:'📊 สรุปยาง',  text:'สรุปยาง' } },
        ]};
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST', headers:{ Authorization:`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [{ type:'text', text:'🌿 สวนยาง — เลือกได้เลยครับ', quickReply: qr }] })
        });
        continue;
      }

      // ── สวนยาง: ขายยาง (guided) ──────────────────────────────────────────
      if (/^ขายยาง$/i.test(text)) {
        SESSION.set(userId, { step: 'rubber_kg' });
        await reply(rt, '🌿 ขายยาง\n\nน้ำยางกี่ กก.? (ใส่แค่ตัวเลข)');
        continue;
      }
      if (sess?.step === 'rubber_kg') {
        const kg = parseFloat(text.replace(/,/g, ''));
        if (isNaN(kg) || kg <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ เช่น 45.5'); continue; }
        SESSION.set(userId, { step: 'rubber_price', kg });
        await reply(rt, `✅ ${kg} กก.\n\nราคา กก.ละ? (บาท)`);
        continue;
      }
      if (sess?.step === 'rubber_price') {
        const price = parseFloat(text.replace(/,/g, ''));
        if (isNaN(price) || price <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ เช่น 52'); continue; }
        SESSION.delete(userId);
        const kg    = sess.kg;
        const total = +(kg * price).toFixed(2);
        const date  = new Date().toISOString().slice(0, 10);
        await appendRubberSale([date, kg, price, total, '']);
        await reply(rt,
          `✅ บันทึกขายยางแล้ว\n\n`
          + `🌿 ${kg} กก. × ฿${price}/กก.\n`
          + `💰 รวม: ฿${fmt(total)}`
        );
        continue;
      }

      // ── สวนยาง: เบิกเงินไท ───────────────────────────────────────────────
      if (/^เบิกเงิน$/i.test(text)) {
        SESSION.set(userId, { step: 'worker_draw' });
        await reply(rt, '👷 ไท เบิกเงินเท่าไหร่? (บาท)');
        continue;
      }
      if (sess?.step === 'worker_draw') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ'); continue; }
        SESSION.delete(userId);
        const date = new Date().toISOString().slice(0, 10);
        await appendWorker([date, 'ไท', 'เบิก', amt, '']);
        const bal = await getWorkerBalance();
        await reply(rt, `✅ ไท เบิก ฿${fmt(amt)} แล้ว\n💳 ยอดค้างไท: ฿${fmt(bal)}`);
        continue;
      }

      // ── สวนยาง: คืนเงินไท ────────────────────────────────────────────────
      if (/^คืนเงิน$/i.test(text)) {
        SESSION.set(userId, { step: 'worker_repay' });
        await reply(rt, '💵 ไท คืนเงินเท่าไหร่? (บาท)');
        continue;
      }
      if (sess?.step === 'worker_repay') {
        const amt = parseFloat(text.replace(/,/g, ''));
        if (isNaN(amt) || amt <= 0) { await reply(rt, '❌ ใส่ตัวเลขครับ'); continue; }
        SESSION.delete(userId);
        const date = new Date().toISOString().slice(0, 10);
        await appendWorker([date, 'ไท', 'คืน', amt, '']);
        const bal = await getWorkerBalance();
        await reply(rt, `✅ ไท คืน ฿${fmt(amt)} แล้ว\n💳 ยอดค้างไท: ฿${fmt(bal)}`);
        continue;
      }

      // ── สวนยาง: ยอดค้างไท ────────────────────────────────────────────────
      if (/^ยอดค้างไท$/i.test(text)) {
        const bal = await getWorkerBalance();
        await reply(rt,
          `💳 ยอดค้างไท\n\n`
          + (bal > 0
            ? `❌ ไท ค้างอยู่: ฿${fmt(bal)}`
            : bal < 0
            ? `✅ จ่ายเกิน ฿${fmt(Math.abs(bal))} (ไท ยังมีเครดิต)`
            : `✅ ไม่มียอดค้าง`)
        );
        continue;
      }

      // ── สวนยาง: สรุปยาง ──────────────────────────────────────────────────
      if (/^สรุปยาง$/i.test(text)) {
        const [sum, bal] = await Promise.all([getRubberSummary(), getWorkerBalance()]);
        await reply(rt,
          `🌿 สรุปสวนยางเดือนนี้\n\n`
          + `📦 ขาย ${sum.count} ครั้ง\n`
          + `⚖️ รวม ${sum.totalKg.toLocaleString('th-TH')} กก.\n`
          + `💰 รวม ฿${fmt(sum.totalBaht)}\n\n`
          + `👷 ไท ค้างอยู่: ฿${fmt(bal)}`
        );
        continue;
      }

      // ── ยอดค้างเดือนนี้ (ห้องเช่า) ───────────────────────────────────────
      if (/^ยอดค้าง$/i.test(text)) {
        const rows = await getMonthlySummary();
        const paid = rows.byRoom || {};
        const expected = { 'ห้อง 1': 3500, 'ห้อง 2': 1000, 'ห้อง 3': 8000, 'คอนโด': 10000 };
        const lines = Object.entries(expected).map(([room, amt]) => {
          const p = paid[room] || 0;
          return p >= amt ? `✅ ${room} — ฿${amt.toLocaleString('th-TH')} รับแล้ว`
                          : `❌ ${room} — ฿${amt.toLocaleString('th-TH')} ยังไม่ได้รับ`;
        });
        const unpaid = Object.entries(expected).filter(([r, a]) => (paid[r] || 0) < a).reduce((s, [, a]) => s + a, 0);
        await reply(rt,
          `⏰ ยอดค้างเดือนนี้\n\n`
          + lines.join('\n')
          + (unpaid > 0 ? `\n\n💰 รอรับอีก: ฿${unpaid.toLocaleString('th-TH')}` : '\n\n🎉 รับครบแล้ว!')
        );
        continue;
      }

      // ── Rich Menu: ภาพรวม ─────────────────────────────────────────────────
      if (/^ภาพรวม$/i.test(text)) {
        const [sum, meters] = await Promise.all([getMonthlySummary(), getLastMeters()]);
        const roomLines = Object.entries(sum.byRoom).map(([r,a]) => `  • ${r}: ฿${a.toLocaleString('th-TH')}`).join('\n');
        await reply(rt,
          `📊 ภาพรวมเดือนนี้\n\n`
          + `🏠 ห้องเช่า: ฿${sum.total.toLocaleString('th-TH')}\n`
          + (roomLines ? roomLines + '\n' : '')
          + `\n💧 มิเตอร์น้ำ: ${meters.wPrev}\n`
          + `⚡ มิเตอร์ไฟ: ${meters.ePrev}\n\n`
          + `🌿 สวนยาง: (กด สวนยาง → สรุปยาง)`
        );
        continue;
      }

      // ── ค่าเช่า shortcut (แสดงปุ่มห้อง) ─────────────────────────────────
      if (/^ค่าเช่า$|^เช่า$/i.test(text)) {
        const qr = {
          items: [
            { type:'action', action:{ type:'message', label:'ห้อง 1 ฿3,500',  text:`รับค่าเช่าห้อง 1 3500` } },
            { type:'action', action:{ type:'message', label:'ห้อง 2 ฿1,000',  text:`รับค่าเช่าห้อง 2 1000` } },
            { type:'action', action:{ type:'message', label:'ห้อง 3 ฿8,000',  text:`รับค่าเช่าห้อง 3 8000` } },
            { type:'action', action:{ type:'message', label:'คอนโด ฿10,000', text:`รับค่าเช่าคอนโด 10000` } },
          ]
        };
        const msg = { type:'text', text:'เลือกห้องที่รับเงินครับ 👇', quickReply: qr };
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method:'POST',
          headers:{ 'Authorization':`Bearer ${TOKEN}`, 'Content-Type':'application/json' },
          body: JSON.stringify({ replyToken: rt, messages: [msg] })
        });
        continue;
      }

      // ── ค่าเช่า ────────────────────────────────────────────────────────────
      if (/ค่าเช่า|รับเงิน|จ่ายแล้ว|รับค่า|โอนแล้ว/i.test(text)) {
        const room   = detectRoom(text);
        const amount = detectAmount(text);
        const date   = detectDate(text);

        if (room && amount) {
          await appendRent([date, room, 'ค่าเช่า', amount, 'รับแล้ว', '']);
          await reply(rt, `✅ บันทึกค่าเช่า${room} ฿${amount.toLocaleString('th-TH')} วันที่ ${thaiDate(date)} แล้วครับ`);
        } else {
          await reply(rt,
            `⚠️ ระบุห้องหรือจำนวนไม่ได้ ลองใหม่ครับ เช่น:\n`
            + `"รับค่าเช่าคอนโด 10000 วันที่ 22/04/26"\n`
            + `"รับค่าเช่าห้อง3 8000 5/4/26"`
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
        await reply(rt, `💧 มิเตอร์น้ำ = ? (ครั้งก่อน: ${wPrev})`);
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
      if (/รายรับ|ประวัติ|ล่าสุด/i.test(text)) {
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

      // ── Fallback ───────────────────────────────────────────────────────────
      await reply(rt,
        `ไม่เข้าใจครับ 😅 พิมพ์ "help" เพื่อดูวิธีใช้`
      );

    } catch (err) {
      console.error('Error:', err);
      await reply(rt, `❌ เกิดข้อผิดพลาด: ${err.message}`);
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

    // สร้าง Rich Menu
    const menuRes = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size: { width: 2500, height: 843 }, selected: true,
        name: 'Main Menu', chatBarText: '📋 เมนู',
        areas: [
          { bounds: { x: 0,    y: 0, width: 833,  height: 843 }, action: { type: 'message', text: 'ห้องเช่า' } },
          { bounds: { x: 833,  y: 0, width: 834,  height: 843 }, action: { type: 'message', text: 'สวนยาง'  } },
          { bounds: { x: 1667, y: 0, width: 833,  height: 843 }, action: { type: 'message', text: 'ภาพรวม'  } },
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

app.get('/', (req, res) => res.send('Rental LINE Bot ✅'));
app.get('/env-check', (req, res) => res.json({
  SECRET_set: !!SECRET,
  SECRET_len: SECRET ? SECRET.length : 0,
  TOKEN_set: !!TOKEN,
  TOKEN_len: TOKEN ? TOKEN.length : 0,
}));
app.listen(PORT, () => console.log(`Port ${PORT}`));
