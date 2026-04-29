// setup-richmenu.js — รัน 1 ครั้ง เพื่อตั้ง Rich Menu ให้ LINE bot
// node setup-richmenu.js
const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) { console.error('❌ ไม่พบ LINE_CHANNEL_ACCESS_TOKEN'); process.exit(1); }

// ── 1. สร้างรูป Rich Menu (2500×1686, 2 แถว × 3 คอลัมน์) ────────────────────
async function createImage() {
  const W = 2500, H = 1686, ROW_H = 843;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7b2fbe"/><stop offset="100%" stop-color="#5c1a8a"/>
      </linearGradient>
      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2e9e52"/><stop offset="100%" stop-color="#1b6b3a"/>
      </linearGradient>
      <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1e6bb5"/><stop offset="100%" stop-color="#1a4a8a"/>
      </linearGradient>
      <linearGradient id="g4" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c07830"/><stop offset="100%" stop-color="#7a4500"/>
      </linearGradient>
      <linearGradient id="g5" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a8ea8"/><stop offset="100%" stop-color="#1a5a6b"/>
      </linearGradient>
      <linearGradient id="g6" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a03040"/><stop offset="100%" stop-color="#6b1a2a"/>
      </linearGradient>
    </defs>

    <!-- แถว 1 -->
    <rect x="0"    y="0" width="833"  height="${ROW_H}" fill="url(#g1)"/>
    <rect x="833"  y="0" width="834"  height="${ROW_H}" fill="url(#g2)"/>
    <rect x="1667" y="0" width="833"  height="${ROW_H}" fill="url(#g3)"/>

    <!-- แถว 2 -->
    <rect x="0"    y="${ROW_H}" width="833"  height="${ROW_H}" fill="url(#g4)"/>
    <rect x="833"  y="${ROW_H}" width="834"  height="${ROW_H}" fill="url(#g5)"/>
    <rect x="1667" y="${ROW_H}" width="833"  height="${ROW_H}" fill="url(#g6)"/>

    <!-- เส้นแบ่งคอลัมน์ -->
    <line x1="833"  y1="20" x2="833"  y2="${H-20}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
    <line x1="1667" y1="20" x2="1667" y2="${H-20}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>

    <!-- เส้นแบ่งแถว -->
    <line x1="20" y1="${ROW_H}" x2="${W-20}" y2="${ROW_H}" stroke="rgba(255,255,255,0.3)" stroke-width="3"/>

    <!-- แถว 1: ห้องเช่า -->
    <text x="416"  y="253"  font-size="160" text-anchor="middle" dominant-baseline="middle">🏠</text>
    <text x="416"  y="510"  font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">ห้องเช่า</text>
    <text x="416"  y="665"  font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RENTAL</text>

    <!-- แถว 1: สวนยาง -->
    <text x="1250" y="253"  font-size="160" text-anchor="middle" dominant-baseline="middle">🌿</text>
    <text x="1250" y="510"  font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">สวนยาง</text>
    <text x="1250" y="665"  font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RUBBER</text>

    <!-- แถว 1: ภาพรวม -->
    <text x="2083" y="253"  font-size="160" text-anchor="middle" dominant-baseline="middle">📊</text>
    <text x="2083" y="510"  font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">ภาพรวม</text>
    <text x="2083" y="665"  font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">OVERVIEW</text>

    <!-- แถว 2: หนี้บ้าน -->
    <text x="416"  y="1096" font-size="160" text-anchor="middle" dominant-baseline="middle">🏦</text>
    <text x="416"  y="1353" font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">หนี้บ้าน</text>
    <text x="416"  y="1508" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">BANK LOAN</text>

    <!-- แถว 2: ค่าน้ำพ่วง -->
    <text x="1250" y="1096" font-size="160" text-anchor="middle" dominant-baseline="middle">💧</text>
    <text x="1250" y="1330" font-size="95"  font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">ค่าน้ำพ่วง</text>
    <text x="1250" y="1508" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">WATER</text>

    <!-- แถว 2: สรุปทั้งหมด -->
    <text x="2083" y="1096" font-size="160" text-anchor="middle" dominant-baseline="middle">📋</text>
    <text x="2083" y="1310" font-size="80"  font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">ยอดค้าง</text>
    <text x="2083" y="1415" font-size="80"  font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">ทั้งหมด</text>
    <text x="2083" y="1528" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">OVERDUE</text>
  </svg>`;

  const imgPath = path.join(__dirname, 'richmenu.png');
  await sharp(Buffer.from(svg, 'utf8')).png().toFile(imgPath);
  console.log('✅ สร้างรูป richmenu.png แล้ว (2×3 grid)');
  return imgPath;
}

// ── 2. Upload รูป ─────────────────────────────────────────────────────────────
async function uploadImage(richMenuId, imgPath) {
  const imgData = fs.readFileSync(imgPath);
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'image/png' },
    body: imgData
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Upload failed: ' + JSON.stringify(data));
  console.log('✅ Upload รูปแล้ว');
}

// ── 3. สร้าง Rich Menu 2×3 ────────────────────────────────────────────────────
async function createRichMenu() {
  const body = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: 'Main Menu 2x3',
    chatBarText: '📋 เมนู',
    areas: [
      // แถว 1
      { bounds: { x: 0,    y: 0,   width: 833,  height: 843 }, action: { type: 'message', text: 'ห้องเช่า' } },
      { bounds: { x: 833,  y: 0,   width: 834,  height: 843 }, action: { type: 'message', text: 'สวนยาง' } },
      { bounds: { x: 1667, y: 0,   width: 833,  height: 843 }, action: { type: 'message', text: 'ภาพรวม' } },
      // แถว 2
      { bounds: { x: 0,    y: 843, width: 833,  height: 843 }, action: { type: 'message', text: 'หนี้บ้าน' } },
      { bounds: { x: 833,  y: 843, width: 834,  height: 843 }, action: { type: 'message', text: 'น้ำพ่วง' } },
      { bounds: { x: 1667, y: 843, width: 833,  height: 843 }, action: { type: 'message', text: 'ยอดค้างทั้งหมด' } },
    ]
  };
  const res = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Create failed: ' + JSON.stringify(data));
  console.log('✅ สร้าง Rich Menu แล้ว id:', data.richMenuId);
  return data.richMenuId;
}

// ── 4. ตั้งเป็น default ───────────────────────────────────────────────────────
async function setDefault(richMenuId) {
  const res = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) { const d = await res.json(); throw new Error('Set default failed: ' + JSON.stringify(d)); }
  console.log('✅ ตั้ง Default Rich Menu แล้ว');
}

// ── ลบ Rich Menu เก่า ─────────────────────────────────────────────────────────
async function deleteOldMenus() {
  const res = await fetch('https://api.line.me/v2/bot/richmenu/list', {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  for (const m of (data.richmenus || [])) {
    await fetch(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    console.log('🗑️ ลบเมนูเก่า:', m.richMenuId);
  }
}

async function main() {
  try {
    await deleteOldMenus();
    const imgPath = await createImage();
    const id = await createRichMenu();
    await uploadImage(id, imgPath);
    await setDefault(id);
    console.log('\n🎉 Rich Menu 2×3 พร้อมใช้งานแล้วครับ!');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}
main();
