const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');
code = code.replace(/}, 3500\);\s*\/\/[^\n]*/, "};\n                ['scroll', 'click', 'touchstart'].forEach(evt => window.addEventListener(evt, loadFacebookPixel, { once: true, passive: true }));\n                setTimeout(loadFacebookPixel, 5000);");
fs.writeFileSync('app.js', code);
console.log('Fixed app.js syntax');
