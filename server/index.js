import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 2000;
const DB_FILE = path.join(__dirname, 'licenses.json');
const ADMIN_SECRET = 'admin_secret_key_change_me'; // Bảo mật: Nên thay đổi key này

// Tăng giới hạn payload để nhận HTML lớn
app.use(bodyParser.json({ limit: '50mb' }));
app.use(cors());

// --- DATABASE FUNCTIONS ---
function getDb() {
  if (!fs.existsSync(DB_FILE)) {
    return { licenses: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { licenses: [] };
  }
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- LICENSE UTILS ---
function generateLicenseKey(type) {
  const prefix = (type || 'TRIAL').toUpperCase().substring(0, 1);
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase() + 
                     Math.random().toString(36).substring(2, 10).toUpperCase();
  // Format: KRT-T-XXXXX-XXXXX
  const raw = randomPart.match(/.{1,5}/g).join('-');
  return `KRT-${prefix}-${raw}`;
}

// --- API ENDPOINTS ---

// 1. Tạo License mới (Chỉ dành cho Admin/Owner)
app.post('/api/license/create', (req, res) => {
  const { secret, type, days, maxMachines, clientName } = req.body;

  if (secret !== ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: 'Sai mã bảo mật Admin' });
  }

  const db = getDb();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + (days || 30));

  const newLicense = {
    key: generateLicenseKey(type || 'trial'),
    type: type || 'trial',
    clientName: clientName || 'Unknown',
    createdAt: new Date().toISOString(),
    expiryDate: expiryDate.toISOString(),
    maxMachines: maxMachines || 1,
    activatedMachines: [],
    status: 'active'
  };

  db.licenses.unshift(newLicense);
  saveDb(db);

  res.json({ success: true, license: newLicense });
});

// 2. Kích hoạt/Kiểm tra License (Dành cho Client App)
app.post('/api/license/verify', (req, res) => {
  const { key, machineId } = req.body;

  if (!key || !machineId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin Key hoặc Machine ID' });
  }

  const db = getDb();
  const license = db.licenses.find(l => l.key === key);

  if (!license) {
    return res.json({ success: false, message: 'License Key không tồn tại' });
  }

  if (license.status !== 'active') {
    return res.json({ success: false, message: 'License đã bị khóa' });
  }

  const now = new Date();
  const expiry = new Date(license.expiryDate);
  if (now > expiry) {
    return res.json({ success: false, message: 'License đã hết hạn', expired: true });
  }

  // Kiểm tra Machine ID
  const isActivatedOnThisMachine = license.activatedMachines.includes(machineId);

  if (isActivatedOnThisMachine) {
    return res.json({ 
      success: true, 
      message: 'License hợp lệ', 
      valid: true,
      data: {
        type: license.type,
        expiryDate: license.expiryDate,
        clientName: license.clientName,
        maxMachines: license.maxMachines
      }
    });
  }

  // Nếu chưa kích hoạt trên máy này, kiểm tra slot trống
  if (license.activatedMachines.length < license.maxMachines) {
    // Tự động kích hoạt cho máy mới
    license.activatedMachines.push(machineId);
    saveDb(db);
    
    return res.json({ 
      success: true, 
      message: 'Kích hoạt thành công trên máy mới', 
      valid: true,
      data: {
        type: license.type,
        expiryDate: license.expiryDate,
        clientName: license.clientName,
        maxMachines: license.maxMachines
      }
    });
  } else {
    return res.json({ 
      success: false, 
      valid: false,
      message: `License đã vượt quá số lượng máy cho phép (${license.maxMachines} máy)` 
    });
  }
});

// 3. Reset License (Admin)
app.post('/api/license/reset', (req, res) => {
  const { secret, key } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ success: false });

  const db = getDb();
  const license = db.licenses.find(l => l.key === key);
  
  if (license) {
    license.activatedMachines = [];
    saveDb(db);
    res.json({ success: true, message: 'Đã reset danh sách máy cho License này' });
  } else {
    res.status(404).json({ success: false, message: 'Không tìm thấy License' });
  }
});

// Route gốc
app.get('/', (req, res) => {
  res.send('Karate Tournament Manager - API Server Online');
});

// --- PDF EXPORT (Existing) ---
app.post('/api/export-pdf', async (req, res) => {
  const { html, css } = req.body;
  let browser = null;

  try {
    console.log('Starting PDF export (Sharp Text & Clean Lines)...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // 1. Measure at 1:1 scale with huge viewport
    await page.setViewport({ width: 6000, height: 6000, deviceScaleFactor: 1 });

    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            ${css}
            :root {
              --color-bg-primary: #ffffff !important;
              --color-bg-secondary: #ffffff !important;
              --color-text-primary: #000000 !important;
              --color-border: #000000 !important;
            }
            * {
              background-color: transparent !important;
              color: black !important;
              box-shadow: none !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              text-shadow: none !important;
            }
            body {
              margin: 0;
              padding: 0;
              background: white !important;
              display: block;
              overflow: visible;
            }
            #bracket-export {
               width: max-content !important;
               height: max-content !important;
               transform: none !important;
               margin: 0 !important;
               padding: 0 !important;
               display: block !important;
            }
            .sigma-connector { background-color: transparent !important; }
            .sigma-h-line, .sigma-v-line, .sigma-h-next { background-color: #000000 !important; opacity: 1 !important; }
            .sigma-h-line, .sigma-h-next { height: 2px !important; }
            .sigma-v-line { width: 2px !important; }
            .match-box { border: 1px solid #000000 !important; background: #ffffff !important; }
            .match-player-name, .sigma-round-title { font-weight: 600 !important; -webkit-font-smoothing: antialiased; }
            .slot-belt.aka { background-color: #dc2626 !important; border: 1px solid #b91c1c !important; }
            .slot-belt.ao { background-color: #2563eb !important; border: 1px solid #1d4ed8 !important; }
            .match-slot.winner { background-color: #f0fdf4 !important; }
          </style>
        </head>
        <body>
          <div id="bracket-export">${html}</div>
        </body>
      </html>
    `, { waitUntil: 'networkidle0' });

    await page.evaluateHandle('document.fonts.ready');

    // 2. Measure & Layout
    const layoutConfig = await page.evaluate(() => {
      const element = document.getElementById('bracket-export');
      const rect = element.getBoundingClientRect();
      const w = Math.ceil(rect.width);
      const h = Math.ceil(rect.height);
      const A4_LONG = 1123;
      const A4_SHORT = 794;
      const isPortrait = h >= w * 1.2;
      const pageWidth = isPortrait ? A4_SHORT : A4_LONG;
      const pageHeight = isPortrait ? A4_LONG : A4_SHORT;
      const padding = 30; 
      const safeW = pageWidth - (padding * 2);
      const safeH = pageHeight - (padding * 2);
      let scale = 1;
      if (w > 0 && h > 0) {
        const scaleX = safeW / w;
        const scaleY = safeH / h;
        scale = Math.min(scaleX, scaleY);
      }
      return { contentW: w, contentH: h, isPortrait: isPortrait, pageWidth: pageWidth, pageHeight: pageHeight, scale: scale };
    });

    console.log('Layout Scale:', layoutConfig.scale);

    // 3. Render High DPI
    await page.setViewport({ width: layoutConfig.pageWidth, height: layoutConfig.pageHeight, deviceScaleFactor: 4 });

    await page.evaluate((config) => {
      document.body.style.cssText = `width: ${config.pageWidth}px !important; height: ${config.pageHeight}px !important; display: flex !important; justify-content: center !important; align-items: center !important; overflow: hidden !important; background: white !important;`;
      const el = document.getElementById('bracket-export');
      el.style.cssText = `transform: scale(${config.scale}) !important; transform-origin: center center !important; margin: 0 !important;`;
    }, layoutConfig);

    // 4. Export
    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: `${layoutConfig.pageWidth}px`,
      height: `${layoutConfig.pageHeight}px`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1'
    });

    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdfBuffer.length });
    res.send(pdfBuffer);
    console.log('PDF Export Complete');

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(port, () => {
  console.log(`Server API & PDF Export running at http://localhost:${port}`);
});
