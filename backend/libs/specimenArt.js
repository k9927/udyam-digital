// Draws a synthetic document (bill, ID card, GST certificate, Udyam certificate) from its fields, so seeded
// demo businesses have a real file for the owner and the KYC officer to look at. Demo data only.
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LAYOUTS = {
  'Address proof': { title: 'Electricity Bill', issuer: 'State Power Distribution Co. (fictional)', rows: [['Billed to', 'billed_to'], ['Supply address', 'address'], ['Bill date', 'bill_date']], extra: [['Units consumed', '231'], ['Amount due (INR)', '3,615']] },
  'Signatory ID': { title: 'Identity Card', issuer: 'Authorised signatory', rows: [['Name', 'name'], ['Designation', 'designation'], ['For business', 'for_business'], ['ID number', 'id_number'], ['Valid till', 'valid_till']], extra: [] },
  'GST certificate': { title: 'Registration Certificate (Form GST REG-06)', issuer: 'Goods and Services Tax (fictional)', rows: [['GSTIN', 'gstin'], ['Legal name', 'legal_name'], ['Trade name', 'trade_name'], ['Constitution', 'constitution'], ['Address', 'address'], ['Date of registration', 'registration_date']], extra: [] },
  'Shop licence': { title: 'Shop & Establishment Registration', issuer: 'Labour Department (fictional)', rows: [['Registration No.', 'licence_number'], ['Name of Establishment', 'business_name'], ['Name of Employer', 'owner_name'], ['Address', 'address'], ['Valid till', 'valid_till']], extra: [] },
  'Udyam certificate': { title: 'Udyam Registration Certificate', issuer: 'Ministry of MSME (fictional)', rows: [['Udyam number', 'udyam_number'], ['Enterprise name', 'enterprise_name'], ['Major activity', 'major_activity'], ['City', 'city'], ['State', 'state'], ['Date of registration', 'registration_date']], extra: [] },
};

// Long values (addresses) wrap onto a second line so nothing is cut off.
function wrap(text, width = 46) {
  const words = String(text || '—').split(/\s+/);
  const lines = [''];
  for (const word of words) {
    if ((lines.at(-1) + ' ' + word).trim().length > width && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim();
  }
  return lines.slice(0, 3);
}

export function documentSvg(type, fields = {}) {
  const layout = LAYOUTS[type] || LAYOUTS['Address proof'];
  const rows = [...layout.rows.map(([label, key]) => [label, fields[key]]), ...layout.extra];
  let y = 210;
  const body = rows.map(([label, value]) => {
    const lines = wrap(value);
    const block = `<text x="70" y="${y}" font-size="22" fill="#5d5f59">${esc(label)}</text>${lines.map((line, index) => `<text x="380" y="${y + index * 30}" font-size="24" font-weight="600" fill="#1f201d">${esc(line)}</text>`).join('')}`;
    y += 30 * lines.length + 26;
    return block;
  }).join('');
  const height = Math.max(640, y + 120);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="${height}" viewBox="0 0 1240 ${height}" font-family="Arial, sans-serif">
<rect width="1240" height="${height}" fill="#ffffff"/>
<rect x="30" y="30" width="1180" height="${height - 60}" rx="18" fill="none" stroke="#c9c8c1" stroke-width="3"/>
<text x="70" y="105" font-size="40" font-weight="700" fill="#1f201d">${esc(layout.title)}</text>
<text x="70" y="145" font-size="22" fill="#6b6d67">${esc(layout.issuer)}</text>
<line x1="70" y1="170" x2="1170" y2="170" stroke="#e2e1db" stroke-width="2"/>
${body}
<text x="70" y="${height - 70}" font-size="18" fill="#a9aba4">Synthetic specimen · Accel YTL Hackathon test data · fictional business and person</text>
</svg>`;
}

// A drawn stand-in for a technician's installation photo on seeded demo orders.
export function installationSvg({ business = '', kit = [], speedMbps = 96 } = {}) {
  const lines = kit.slice(0, 4).map((line, index) => `<text x="110" y="${430 + index * 34}" font-size="24" fill="#3f413b">✓ ${esc(line.item)} × ${esc(line.quantity)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="760" viewBox="0 0 1240 760" font-family="Arial, sans-serif">
<rect width="1240" height="760" fill="#eef0ec"/>
<rect x="70" y="70" width="1100" height="250" rx="16" fill="#d9dcd4"/>
<rect x="430" y="130" width="380" height="130" rx="18" fill="#ffffff" stroke="#9fa39a" stroke-width="3"/>
${[0, 1, 2, 3].map(i => `<circle cx="${480 + i * 40}" cy="230" r="9" fill="${i < 3 ? '#2f7d55' : '#c78a39'}"/>`).join('')}
<text x="470" y="185" font-size="28" font-weight="700" fill="#1f201d">Business router</text>
<path d="M620 260 C 620 300, 760 300, 900 320" stroke="#5b5d57" stroke-width="6" fill="none"/>
<text x="110" y="380" font-size="30" font-weight="700" fill="#1f201d">Installed at ${esc(business)}</text>
${lines}
<text x="110" y="${470 + kit.slice(0, 4).length * 34}" font-size="26" font-weight="700" fill="#2f7d55">Speed test: ${esc(speedMbps)} Mbps</text>
<text x="110" y="720" font-size="18" fill="#a9aba4">Synthetic installation photo · Accel YTL Hackathon test data</text>
</svg>`;
}

// A drawn storefront with the business name on the signboard, standing in for an owner's shop photo in the demo.
// Plain dark lettering at a moderate size and no other text: OCR reads only the smallest text when a caption is present.
export function shopPhotoSvg(shop) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="900" viewBox="0 0 1240 900" font-family="Arial, sans-serif">
<rect width="1240" height="900" fill="#cfd8dc"/>
<rect x="120" y="120" width="1000" height="180" fill="#ffffff"/>
<text x="620" y="232" font-size="${Math.min(64, Math.floor(1700 / Math.max(String(shop).length, 1)))}" font-weight="700" fill="#1f201d" text-anchor="middle">${esc(String(shop).toUpperCase())}</text>
<rect x="120" y="300" width="1000" height="480" fill="#8d6e63"/>
<rect x="170" y="350" width="420" height="380" fill="#455a64"/>
<rect x="650" y="350" width="420" height="380" fill="#90a4ae"/>
<rect x="700" y="400" width="320" height="40" fill="#eceff1"/><rect x="700" y="470" width="320" height="40" fill="#eceff1"/><rect x="700" y="540" width="320" height="40" fill="#eceff1"/>
<rect x="80" y="780" width="1080" height="40" fill="#78909c"/>
</svg>`;
}
