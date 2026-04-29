// gen-richmenu-img.js — สร้างแค่รูป richmenu.png (ไม่ต้อง token)
// node gen-richmenu-img.js
const sharp = require('sharp');
const path  = require('path');

const W = 2500, H = 1686; // 2 แถว × 3 คอลัมน์ (843 × 2)
const ROW_H = 843;

// แถว 1
const c1 = '#5c1a8a', c2 = '#1b6b3a', c3 = '#1a4a8a';
// แถว 2
const c4 = '#7a4500', c5 = '#1a5a6b', c6 = '#6b1a2a';

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- แถว 1 -->
    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7b2fbe"/><stop offset="100%" stop-color="${c1}"/>
    </linearGradient>
    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2e9e52"/><stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e6bb5"/><stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <!-- แถว 2 -->
    <linearGradient id="g4" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c07830"/><stop offset="100%" stop-color="${c4}"/>
    </linearGradient>
    <linearGradient id="g5" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a8ea8"/><stop offset="100%" stop-color="${c5}"/>
    </linearGradient>
    <linearGradient id="g6" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a03040"/><stop offset="100%" stop-color="${c6}"/>
    </linearGradient>
  </defs>

  <!-- พื้นหลัง แถว 1 -->
  <rect x="0"    y="0" width="833"  height="${ROW_H}" fill="url(#g1)"/>
  <rect x="833"  y="0" width="834"  height="${ROW_H}" fill="url(#g2)"/>
  <rect x="1667" y="0" width="833"  height="${ROW_H}" fill="url(#g3)"/>

  <!-- พื้นหลัง แถว 2 -->
  <rect x="0"    y="${ROW_H}" width="833"  height="${ROW_H}" fill="url(#g4)"/>
  <rect x="833"  y="${ROW_H}" width="834"  height="${ROW_H}" fill="url(#g5)"/>
  <rect x="1667" y="${ROW_H}" width="833"  height="${ROW_H}" fill="url(#g6)"/>

  <!-- เส้นแบ่งคอลัมน์ -->
  <line x1="833"  y1="20" x2="833"  y2="${H-20}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
  <line x1="1667" y1="20" x2="1667" y2="${H-20}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>

  <!-- เส้นแบ่งแถว -->
  <line x1="20" y1="${ROW_H}" x2="${W-20}" y2="${ROW_H}" stroke="rgba(255,255,255,0.3)" stroke-width="3"/>

  <!-- แถว 1: ห้องเช่า -->
  <text x="416" y="253" font-size="160" text-anchor="middle" dominant-baseline="middle">&#x1F3E0;</text>
  <text x="416" y="510" font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E2B;&#x0E49;&#x0E2D;&#x0E07;&#x0E40;&#x0E0A;&#x0E48;&#x0E32;</text>
  <text x="416" y="665" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RENTAL</text>

  <!-- แถว 1: สวนยาง -->
  <text x="1250" y="253" font-size="160" text-anchor="middle" dominant-baseline="middle">&#x1F33F;</text>
  <text x="1250" y="510" font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E2A;&#x0E27;&#x0E19;&#x0E22;&#x0E32;&#x0E07;</text>
  <text x="1250" y="665" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RUBBER</text>

  <!-- แถว 1: ภาพรวม -->
  <text x="2083" y="253" font-size="160" text-anchor="middle" dominant-baseline="middle">&#x1F4CA;</text>
  <text x="2083" y="510" font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E20;&#x0E32;&#x0E1E;&#x0E23;&#x0E27;&#x0E21;</text>
  <text x="2083" y="665" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">OVERVIEW</text>

  <!-- แถว 2: หนี้บ้าน -->
  <text x="416" y="1096" font-size="160" text-anchor="middle" dominant-baseline="middle">&#x1F3E6;</text>
  <text x="416" y="1353" font-size="105" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E2B;&#x0E19;&#x0E35;&#x0E49;&#x0E1A;&#x0E49;&#x0E32;&#x0E19;</text>
  <text x="416" y="1508" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">BANK LOAN</text>

  <!-- แถว 2: ค่าน้ำพ่วง -->
  <text x="1250" y="1096" font-size="160" text-anchor="middle" dominant-baseline="middle">&#x1F4A7;</text>
  <text x="1250" y="1330" font-size="95"  font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E04;&#x0E48;&#x0E32;&#x0E19;&#x0E49;&#x0E33;&#x0E1E;&#x0E48;&#x0E27;&#x0E07;</text>
  <text x="1250" y="1508" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">WATER</text>

  <!-- แถว 2: สรุปทั้งหมด -->
  <text x="2083" y="1096" font-size="160" text-anchor="middle" dominant-baseline="middle">&#x1F4CB;</text>
  <text x="2083" y="1310" font-size="80"  font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E22;&#x0E2D;&#x0E14;&#x0E04;&#x0E49;&#x0E32;&#x0E07;</text>
  <text x="2083" y="1415" font-size="80"  font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E17;&#x0E31;&#x0E49;&#x0E07;&#x0E2B;&#x0E21;&#x0E14;</text>
  <text x="2083" y="1528" font-size="65"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">OVERDUE</text>
</svg>`;

sharp(Buffer.from(svg, 'utf8'))
  .png()
  .toFile(path.join(__dirname, 'richmenu.png'))
  .then(() => console.log('✅ สร้าง richmenu.png แล้ว (2×3 grid)'))
  .catch(e => { console.error('❌', e.message); process.exit(1); });
