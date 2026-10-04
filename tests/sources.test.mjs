import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseStoreSearch, normalizeMaringa, parseExchange} from '../src/catalog.mjs';
import {searchPage, searchSources} from '../src/search.mjs';
const fixture=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');

test('each retailer has its own verified offer price and direct product link',()=>{
 for(const [source,price,host] of [['visaovip',345.75,'www.visaovip.com'],['cellshop',12,'cellshop.com'],['shoppingchina',303,'www.shoppingchina.com.py']]) {
  const [item]=parseStoreSearch(fixture(source+'.html'),source);
  assert.equal(item.source,source);assert.equal(item.priceUsd,price);
  assert.equal(new URL(item.productUrl).host,host);
  assert.equal(item.via,'compras');assert.equal(item.availability,'unknown');
  assert.equal(item.images.length,1);assert.ok(item.productPath);
 }
});
test('retailer search rejects a card belonging to another store',()=>{
 assert.deepEqual(parseStoreSearch(fixture('cellshop.html'),'visaovip'),[]);
});
test('WooCommerce uses currency minor units, complete gallery and explicit stock',()=>{
 const raw=JSON.parse(fixture('casamaringa.json'))[0];const item=normalizeMaringa(raw,0);
 assert.equal(item.priceUsd,423.68);assert.equal(item.availability,'in_stock');assert.equal(item.images.length,2);
 assert.equal(normalizeMaringa({...raw,is_in_stock:false}).availability,'out_of_stock');
 assert.equal(normalizeMaringa({...raw,is_in_stock:undefined}).availability,'unknown');
 assert.equal(normalizeMaringa({...raw,prices:{price:'1234',currency_code:'USD',currency_minor_unit:3}}).priceUsd,1.234);
 assert.equal(normalizeMaringa({...raw,prices:{price:'1234',currency_code:'BRL',currency_minor_unit:2}}).priceUsd,null);
});
test('exchange uses homepage values and exact date, without static fallback',()=>{
 const rate=parseExchange(fixture('exchange.html'));
 assert.equal(rate.base,'USD');assert.deepEqual(rate.rates,{BRL:5.2,PYG:6000,ARS:1600});
 assert.match(rate.updatedLabel,/13 de Setembro de 2026 às 09:45/);
 assert.equal(parseExchange(fixture('exchange.html').replace('5,20','5,37')).rates.BRL,5.37);
 assert.throws(()=>parseExchange('<html>temporarily unavailable</html>'));
});
test('retailer page 40 keeps query and shop filter without the previous 30-page limit',async()=>{
 let seen;
 const page=await searchPage('xiaomi & pro','visaovip',40,{fetcher:async url=>{seen=new URL(url);return new Response(fixture('visaovip.html'));}});
 assert.equal(seen.pathname,'/busca/');assert.equal(seen.searchParams.get('q'),'xiaomi & pro');assert.equal(seen.searchParams.get('loja'),'visaovip');assert.equal(seen.searchParams.get('page'),'40');
 assert.equal(page.items.length,1);assert.equal(page.pagination.page,40);assert.equal(page.pagination.nextPage,null);
});
test('WooCommerce pagination comes from total headers and uses 1-based pages',async()=>{
 let seen;
 const page=await searchPage('xiaomi','casamaringa',2,{fetcher:async url=>{seen=new URL(url);return new Response(fixture('casamaringa.json'),{headers:{'x-wp-totalpages':'5','x-wp-total':'218'}});}});
 assert.equal(seen.searchParams.get('page'),'2');assert.equal(page.pagination.totalPages,5);assert.equal(page.pagination.nextPage,3);assert.equal(page.pagination.totalItems,218);
});
test('LG translates 1-based application pages into the original 0-based API',async()=>{
 let seen;
 const page=await searchPage('phone','lg',51,{fetcher:async url=>{seen=new URL(url);return Response.json({produtos:[{sku:2,nome:'Phone',precoVenda:5,temEstoque:true}],totalPages:52,totalElements:5101});}});
 assert.equal(seen.searchParams.get('page'),'50');assert.equal(page.pagination.nextPage,52);
});
test('one failed source preserves the other five source results',async()=>{
 const data=await searchSources('xiaomi',{fetcher:async url=>{
  const u=new URL(url);
  if(u.host.includes('lgimportados'))return new Response('Unavailable',{status:503});
  if(u.host.includes('casamaringa'))return new Response(fixture('casamaringa.json'),{headers:{'x-wp-totalpages':'1'}});
  const source={'visaovip':'visaovip','cellshop':'cellshop','shopping-china':'shoppingchina'}[u.searchParams.get('loja')];
  return new Response(source?fixture(source+'.html'):readFileSync(new URL('./h50-search.html',import.meta.url),'utf8'));
 }});
 assert.equal(data.sources.lg,'error');assert.equal(Object.values(data.sources).filter(x=>x==='ok').length,5);assert.equal(data.items.length,11);
});
test('source failures log a safe transport code without logging the search query',async()=>{
 const lines=[],original=console.error;
 console.error=line=>lines.push(String(line));
 try {
  await searchSources('private product query',{fetcher:async()=>{
   const error=new TypeError('fetch failed');error.cause=Object.assign(new Error('DNS lookup failed'),{code:'EAI_AGAIN'});throw error;
  }});
 }finally{console.error=original;}
 assert.equal(lines.length,6);
 assert.ok(lines.some(line=>line.includes('source=compras')&&line.includes('EAI_AGAIN')));
 assert.ok(lines.some(line=>line.includes('source=casamaringa')&&line.includes('EAI_AGAIN')));
 assert.doesNotMatch(lines.join(' '),/private product query/);
});
test('upstream challenge or wrong page is a source error instead of empty success',async()=>{
 await assert.rejects(searchPage('xiaomi','cellshop',1,{fetcher:async()=>new Response('<title>Just a moment</title>')}));
});
test('invalid source and page are rejected before requesting any upstream',async()=>{
 const fetcher=()=>{throw Error('must not fetch');};
 for(const [source,page] of [['evil',1],['lg',0],['lg',1.5]])await assert.rejects(searchPage('xiaomi',source,page,{fetcher}),/inválid/);
});
