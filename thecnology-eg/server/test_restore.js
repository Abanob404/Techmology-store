const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://abanobnaser1_db_user:w3l0pOyUYUedL0Ww@cluster0.yt1jzfg.mongodb.net/technologyStore?retryWrites=true&w=majority';

// Define schemas
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Category = mongoose.model('Category', categorySchema);

const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  oldPrice: { type: Number },
  description: [String],
  image: { type: String, required: true },
  imagePublicId: String,
  additionalImages: [{
    url: String,
    publicId: String
  }],
  stockQuantity: { type: Number, default: 1 },
  sku: { type: String, default: '' },
  warranty: { type: String, default: '' },
  brand: { type: String, default: '' },
  discountExpiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

const settingsSchema = new mongoose.Schema({
  defaultProductImage: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Settings = mongoose.model('Settings', settingsSchema);

async function test() {
  try {
    console.log('Connecting to DB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // 1. Fetch
    const categories = await Category.find();
    const products = await Product.find();
    const settings = await Settings.find();

    const backupDataStr = JSON.stringify({
      categories,
      products,
      settings
    });

    // 2. Parse (Simulate upload)
    const parsedData = JSON.parse(backupDataStr);

    console.log(`Simulating restore of ${parsedData.categories.length} categories, ${parsedData.products.length} products...`);

    // We won't actually delete, we will just validate if we can insert them into a temp collection or if validation fails
    // Let's create temporary models to avoid messing up live data
    const TempCategory = mongoose.model('TempCategory', categorySchema);
    const TempProduct = mongoose.model('TempProduct', productSchema);
    const TempSettings = mongoose.model('TempSettings', settingsSchema);

    await TempCategory.deleteMany({});
    await TempProduct.deleteMany({});
    await TempSettings.deleteMany({});

    console.log('Inserting into temp collections...');
    if (parsedData.categories.length > 0) {
      await TempCategory.insertMany(parsedData.categories);
      console.log('Categories inserted.');
    }
    if (parsedData.products.length > 0) {
      await TempProduct.insertMany(parsedData.products);
      console.log('Products inserted.');
    }
    if (parsedData.settings.length > 0) {
      await TempSettings.insertMany(parsedData.settings);
      console.log('Settings inserted.');
    }

    console.log('Clean up...');
    await TempCategory.deleteMany({});
    await TempProduct.deleteMany({});
    await TempSettings.deleteMany({});

    console.log('SUCCESS!');
  } catch (err) {
    console.error('ERROR OCCURRED:', err);
  } finally {
    await mongoose.disconnect();
  }
}

test();
