const fs = require('fs');
let code = fs.readFileSync('server/index.js', 'utf8');

code = code.replace(
  "html = html.replace(/<title>.*?</title>/, `<title>${title}</title>`);",
  "html = html.replace(/<title>.*?<\\/title>/, `<title>${title}</title>`);"
);

fs.writeFileSync('server/index.js', code);
console.log('Fixed regex syntax');
