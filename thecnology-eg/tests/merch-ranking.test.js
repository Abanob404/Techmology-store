const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../merch-ranking');
const base = { category: 'إكسسوارات', price: 500, stockQuantity: 4, createdAt: '2026-01-01', merchPriority: 0 };
const p = (id, fields = {}) => ({ ...base, _id: id, title: id, ...fields });
test('an ordinary camera ranks before a low-value cable in all products', () => {
 const products = [p('cable',{title:'كابل HDMI',price:55}),p('camera',{title:'كاميرا واي فاي',price:1300})];
 assert.equal(products.sort((a,b)=>M.compare(a,b,{now:Date.parse('2026-11-21')}))[0]._id,'camera');
});
test('search relevance beats merchandising', () => {
 const cable=p('cable',{title:'كابل HDMI',price:55}), camera=p('camera',{title:'كاميرا واي فاي',price:1300,merchPriority:100});
 assert.equal([camera,cable].sort((a,b)=>M.compare(a,b,{searchTerm:'HDMI'}))[0]._id,'cable');
});
test('admin can intentionally elevate accessory', () => {
 const cable=p('cable',{title:'وصلة USB',price:35,merchPriority:100,merchTier:'hero'}),camera=p('camera',{title:'كاميرا',price:1300});
 assert.equal([camera,cable].sort((a,b)=>M.compare(a,b))[0]._id,'cable');
});
test('expired discount is never an active offer',()=>{
 assert.equal(M.isActiveOffer(p('x',{oldPrice:1000,price:600,discountExpiresAt:'2026-01-01'}),Date.parse('2026-11-21')),false);
 assert.equal(M.isActiveOffer(p('x',{oldPrice:1000,price:600,discountExpiresAt:'2027-01-01'}),Date.parse('2026-11-21')),true);
});
test('POS confirmed sales, not website requests, give a demand boost',()=>{
 const a=p('a'),b=p('b');
 assert.ok(M.merchandisingScore(a,{analytics:{confirmed_sales:{a:8}}})>M.merchandisingScore(b));
});
test('variant stock overrides stale base quantity',()=>{
 assert.equal(M.availableQuantity(p('v',{stockQuantity:0,variants:[{stockQuantity:3},{stockQuantity:0}]})),3);
});
test('category view does not unnecessarily suppress cables',()=>{
 const cable=p('c',{title:'كابل HDMI',price:100});
 assert.ok(M.merchandisingScore(cable,{categorySpecific:true})>M.merchandisingScore(cable));
});
