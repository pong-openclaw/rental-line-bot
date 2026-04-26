// gen-richmenu-img.js — สร้างแค่รูป richmenu.png (ไม่ต้อง token)
// node gen-richmenu-img.js
const sharp = require('sharp');
const path  = require('path');

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
  <text x="416"  y="310" font-size="180" text-anchor="middle" dominant-baseline="middle">&#x1F3E0;</text>
  <text x="416"  y="560" font-size="110" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E2B;&#x0E49;&#x0E2D;&#x0E07;&#x0E40;&#x0E0A;&#x0E48;&#x0E32;</text>
  <text x="416"  y="710" font-size="70"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RENTAL</text>

  <!-- ไอคอน + ข้อความ: สวนยาง -->
  <text x="1250" y="310" font-size="180" text-anchor="middle" dominant-baseline="middle">&#x1F33F;</text>
  <text x="1250" y="560" font-size="110" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E2A;&#x0E27;&#x0E19;&#x0E22;&#x0E32;&#x0E07;</text>
  <text x="1250" y="710" font-size="70"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">RUBBER</text>

  <!-- ไอคอน + ข้อความ: ภาพรวม -->
  <text x="2083" y="310" font-size="180" text-anchor="middle" dominant-baseline="middle">&#x1F4CA;</text>
  <text x="2083" y="560" font-size="110" font-weight="bold" text-anchor="middle" fill="white" font-family="Tahoma,Arial,sans-serif">&#x0E20;&#x0E32;&#x0E1E;&#x0E23;&#x0E27;&#x0E21;</text>
  <text x="2083" y="710" font-size="70"  text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="Tahoma,Arial,sans-serif">OVERVIEW</text>
</svg>`;

sharp(Buffer.from(svg, 'utf8'))
  .png()
  .toFile(path.join(__dirname, 'richmenu.png'))
  .then(() => console.log('✅ สร้าง richmenu.png แล้ว'))
  .catch(e => { console.error('❌', e.message); process.exit(1); });
