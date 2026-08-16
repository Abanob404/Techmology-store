const fs = require('fs');

let code = fs.readFileSync('server/index.js', 'utf8');

// Replace connectDB definition
const startIdx = code.indexOf('let isConnected = false;');
const endIdx = code.indexOf('connectDB();') + 'connectDB();'.length;

const newConnect = `let connectionPromise = null;
async function ensureDBConnection() {
  if (mongoose.connection.readyState === 1) return; // connected
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      bufferCommands: true
    }).then(async () => {
      console.log('DB Connected Successfully');
      await initDefaultAdmin();
    }).catch(err => {
      connectionPromise = null;
      console.error('DB Connection Error:', err.message);
      throw err;
    });
  }
  await connectionPromise;
}
ensureDBConnection().catch(console.error);`;

code = code.substring(0, startIdx) + newConnect + code.substring(endIdx);

// Now replace all await connectDB() with await ensureDBConnection()
code = code.replace(/await connectDB\(\);/g, 'await ensureDBConnection();');

// For SSR Route /products
code = code.replace(
  /const htmlPath = path\.join\(__dirname, '\.\.\/products_page\.html'\);/g,
  'await ensureDBConnection();\n    const htmlPath = path.join(__dirname, \'../products_page.html\');'
);

// For /api/admin/login
code = code.replace(
  /app\.post\('\/api\/admin\/login', async \(req, res\) => \{\n\s*try \{/g,
  'app.post(\'/api/admin/login\', async (req, res) => {\n  try {\n    await ensureDBConnection();'
);

fs.writeFileSync('server/index.js', code);
console.log('Replaced');
