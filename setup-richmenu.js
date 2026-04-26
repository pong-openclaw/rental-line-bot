// setup-richmenu.js — รัน 1 ครั้ง เพื่อตั้ง Rich Menu ให้ LINE bot
// node setup-richmenu.js
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) { console.error('❌ ไม่พบ LINE_CHANNEL_ACCESS_TOKEN'); process.exit(1); }

// ── 1. สร้างรูป Rich Menu (2500x843) ─────────────────────────────────────────
async function createImage() {
  const W = 2500, H = 843;
  const col1 = '#5c1a8a', col2 = '#1b6b3a', col3 = '#1a4a8a';

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7b2fbe"/>
        <stop offset="100%" stop-color="${col1}"/>
      </linearGradient>
      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2e9e52"/>
        <stop offset="100%" stop-color="${col2}"/>
      </linearGradient>
      <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1e6bb5"/>
        <stop offset="100%" stop-color="${col3}"/>
      </linearGradient>
    </defs>

    <!-- พื้นหลัง 3 ส่วน -->
    <rect x="0"    y="0" width="833"  height="${H}" fill="url(#g1)"/>
    <rect x="833"  y="0" width="834"  height="${H}" fill="url(#g2)"/>
    <rect x="1667" y="0" width="833"  height="${H}" fill="url(#g3)"/>

    <!-- เส้นแบ่ง -->
    <line x1="833"  y1="20" x2="833"  y2="${H-20}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
    <line x1="1667" y1="20" x2="1667" y2="${H-20}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>

    <!-- ไอคอน + ข้อความ: ห้องเช่า -->
    <text x="416"  y="340" font-size="180" text-anchor="middle" dominant-baseline="middle">🏠</text>
    <text x="416"  y="590" font-size="110" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#xE2B9;&#xE49;&#xE2D;&#xE07;&#xE40;&#xE0A;&#xE48;&#xE32;</text>
    <text x="416"  y="730" font-size="70"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RENTAL</text>

    <!-- ไอคอน + ข้อความ: สวนยาง -->
    <text x="1250" y="340" font-size="180" text-anchor="middle" dominant-baseline="middle">🌿</text>
    <text x="1250" y="590" font-size="110" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#xE2A;&#xE27;&#xE19;&#xE22;&#xE32;&#xE07;</text>
    <text x="1250" y="730" font-size="70"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RUBBER</text>

    <!-- ไอคอน + ข้อความ: ภาพรวม -->
    <text x="2083" y="340" font-size="180" text-anchor="middle" dominant-baseline="middle">📊</text>
    <text x="2083" y="590" font-size="110" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#xE20;&#xE32;&#xE1E;&#xE23;&#xE27;&#xE21;</text>
    <text x="2083" y="730" font-size="70"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">OVERVIEW</text>
  </svg>`;

  const imgPath = path.join(__dirname, 'richmenu.png');
  await sharp(Buffer.from(svg)).png().toFile(imgPath);
  console.log('✅ สร้างรูป richmenu.png แล้ว');
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

// ── 3. สร้าง Rich Menu ────────────────────────────────────────────────────────
async function createRichMenu() {
  const body = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'Main Menu',
    chatBarText: '📋 เมนู',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: 'message', text: 'ห้องเช่า' }
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: 'message', text: 'สวนยาง' }
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: 'message', text: 'ภาพรวม' }
      }
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
    console.log('\n🎉 Rich Menu พร้อมใช้งานแล้วครับ!');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}
main();
