const fs = require('fs');
let code = fs.readFileSync('server/index.js', 'utf8');

code = code.replace(
  "app.post('/api/admin/login', async (req, res) => {",
  "app.post('/api/admin/login', async (req, res) => {\n  await ensureDBConnection();"
);

code = code.replace(
  "app.get('/api/categories', async (req, res) => {",
  "app.get('/api/categories', async (req, res) => {\n  await ensureDBConnection();"
);

code = code.replace(
  "app.get('/api/analytics', async (req, res) => {",
  "app.get('/api/analytics', async (req, res) => {\n  await ensureDBConnection();"
);

code = code.replace(
  "app.post('/api/analytics/track', async (req, res) => {",
  "app.post('/api/analytics/track', async (req, res) => {\n  await ensureDBConnection();"
);

code = code.replace(
  `} catch (err) {\n    console.error('SSR Error:', err);\n    res.sendFile(path.join(__dirname, '../products_page.html'));\n  }`,
  `} catch (err) {\n    console.error('SSR Error:', err);\n    res.status(503).send('<html dir="rtl"><body><h2>عذراً، مشكلة في الاتصال بقاعدة البيانات. يرجى التحديث.</h2><button onclick="location.reload()">تحديث</button></body></html>');\n  }`
);


fs.writeFileSync('server/index.js', code);
