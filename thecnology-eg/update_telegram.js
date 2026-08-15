const fs = require('fs');
const files = ['index.html', 'products_page.html', 'services.html'];
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Match the Telegram anchor tag and replace its href
  content = content.replace(/<a href=\"[^\"]*\"([^>]*)aria-label=\"Telegram\"/g, '<a href=\"https://t.me/Technology_store_Official\"$1aria-label=\"Telegram\"');
  fs.writeFileSync(file, content);
});
console.log('Done replacing Telegram links');
