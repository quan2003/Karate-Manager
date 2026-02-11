import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const port = 2000;

// Tăng giới hạn payload để nhận HTML lớn
app.use(bodyParser.json({ limit: '50mb' }));
app.use(cors());

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
            
            /* --- PDF STYLING --- */
            
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
            
            /* --- FIX: CHỈ TÔ MÀU ĐƯỜNG KẺ, KHÔNG TÔ CONTAINER --- */
            
            /* Container connector trong suốt */
            .sigma-connector {
               background-color: transparent !important;
            }

            /* Các nét kẻ thực sự */
            .sigma-h-line, 
            .sigma-v-line, 
            .sigma-h-next {
               background-color: #000000 !important;
               opacity: 1 !important;
            }
            
            /* Độ dày tối ưu cho in ấn (2px) */
            .sigma-h-line, .sigma-h-next {
              height: 2px !important;
            }
            
            .sigma-v-line {
              width: 2px !important;
            }
            
            /* Match Box Sharpness */
            .match-box { 
              border: 1px solid #000000 !important;
              background: #ffffff !important;
            }
            
            /* Font Enhancements */
            .match-player-name, .sigma-round-title {
               font-weight: 600 !important;
               -webkit-font-smoothing: antialiased;
            }
            
            /* Slot Belt */
            .slot-belt.aka { background-color: #dc2626 !important; border: 1px solid #b91c1c !important; }
            .slot-belt.ao { background-color: #2563eb !important; border: 1px solid #1d4ed8 !important; }
            .match-slot.winner { background-color: #f0fdf4 !important; }

          </style>
        </head>
        <body>
          <div id="bracket-export">
            ${html}
          </div>
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
      
      // Padding an toàn
      const padding = 30; 
      const safeW = pageWidth - (padding * 2);
      const safeH = pageHeight - (padding * 2);
      
      let scale = 1;
      if (w > 0 && h > 0) {
        const scaleX = safeW / w;
        const scaleY = safeH / h;
        scale = Math.min(scaleX, scaleY);
      }

      return {
        contentW: w,
        contentH: h,
        isPortrait: isPortrait,
        pageWidth: pageWidth,
        pageHeight: pageHeight,
        scale: scale
      };
    });

    console.log('Layout Scale:', layoutConfig.scale);

    // 3. Render High DPI with Transform Scale
    // DeviceScaleFactor 4 + Transform Scale = Sharp Vector-like output
    await page.setViewport({ 
      width: layoutConfig.pageWidth, 
      height: layoutConfig.pageHeight, 
      deviceScaleFactor: 4 
    });

    await page.evaluate((config) => {
      document.body.style.cssText = `
        width: ${config.pageWidth}px !important;
        height: ${config.pageHeight}px !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        overflow: hidden !important;
        background: white !important;
      `;

      const el = document.getElementById('bracket-export');
      el.style.cssText = `
        transform: scale(${config.scale}) !important;
        transform-origin: center center !important;
        margin: 0 !important;
      `;
    }, layoutConfig);

    // 4. Export
    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: `${layoutConfig.pageWidth}px`,
      height: `${layoutConfig.pageHeight}px`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1'
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
    });
    
    res.send(pdfBuffer);
    console.log('PDF Export Complete');

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(port, () => {
  console.log(`PDF Export Server running at http://localhost:${port}`);
});
