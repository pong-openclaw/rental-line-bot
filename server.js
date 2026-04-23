const express = require('express');
const crypto  = require('crypto');
const { appendRent, appendWaterElec, getLastMeters } = require('./sheets');

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
async function reply(replyToken, text) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] })
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
    const text = ev.message.text.trim();
    const rt   = ev.replyToken;

    try {
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
app.get('/', (req, res) => res.send('Rental LINE Bot ✅'));
app.get('/env-check', (req, res) => res.json({
  SECRET_set: !!SECRET,
  SECRET_len: SECRET ? SECRET.length : 0,
  TOKEN_set: !!TOKEN,
  TOKEN_len: TOKEN ? TOKEN.length : 0,
}));
app.listen(PORT, () => console.log(`Port ${PORT}`));
