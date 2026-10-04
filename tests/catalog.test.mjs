import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDetail, parseSearch, normalizeLg, validateProductPath } from '../src/catalog.mjs';
test('extracts gallery and all store offers, excluding related products', () => {
 const d = parseDetail(readFileSync(new URL('./h50-detail.html', import.meta.url), 'utf8'));
 assert.equal(d.images.length, 3);
 assert.equal(d.offers.length, 24);
 assert.equal(d.offers[0].priceUsd, 455);
 assert.ok(d.offers.some(o => o.store === 'Madrid Center' && o.priceUsd === 460));
 assert.ok(d.offers.every(o => o.store && o.url.startsWith('http')));
});
test('preserves LG gallery and deduplicates pictures', () => {
 const x = normalizeLg({sku:1,nome:'Phone',precoVenda:99,urls:['https://img.test/1.png','https://img.test/2.png','https://img.test/1.png'],temEstoque:1},0);
 assert.equal(x.images.length,2);
});
test('rejects external URLs and paths outside product pages', () => {
 for(const path of ['https://evil.test/', '//evil.test/', '/?q=a', '/admin/', '/foo_1/?next=x']) assert.throws(()=>validateProductPath(path));
 assert.equal(validateProductPath('/phone_123/'), '/phone_123/');
});
test('reads images, entities and missing prices from search cards', () => {
 const x=parseSearch('<div class="promocao-produtos-item"><div class="promocao-item-nome"><a href="/phone_12/">Phone &amp; Case</a></div><div class="promocao-item-img"><img data-src="https://img.test/p.png"></div></div>');
 assert.equal(x[0].title,'Phone & Case'); assert.equal(x[0].priceUsd,null); assert.equal(x[0].images.length,1);
});
test('uses the same search route as the Compras Paraguai form', async()=>{
 const {comprasSearchUrl}=await import('../src/catalog.mjs');
 assert.equal(comprasSearchUrl('Xiaomi H50',0),'https://www.comprasparaguai.com.br/busca/?q=Xiaomi%20H50&page=1');
});
test('real search yields six H50 models with pictures and prices',()=>{
 const items=parseSearch(readFileSync(new URL('./h50-search.html',import.meta.url),'utf8'));
 assert.equal(items.length,6);
 assert.ok(items.every(x=>x.title.includes('H50')&&x.images.length&&x.priceUsd>0));
});
