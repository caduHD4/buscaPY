import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
const request=path=>new Request('https://local.test'+path);
test('Worker rejects invalid queries, providers, pages, methods and product URLs',async()=>{
 for(const url of ['/api/search?q=x','/api/search?q=phone&source=evil','/api/search?q=phone&source=lg&page=-1','/api/search?q=phone&page=2','/api/product?path=https://evil.test'])assert.equal((await worker.fetch(request(url))).status,400);
 assert.equal((await worker.fetch(new Request('https://local.test/api/search',{method:'POST'}))).status,405);
 assert.equal((await worker.fetch(request('/missing'))).status,404);
 const homepage=await worker.fetch(request('/'));assert.equal(homepage.status,200);assert.match(await homepage.text(),/Casa Maringá/);
});
test('bundled Worker exposes pagination and caches successful per-source pages',async()=>{
 const original=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return Response.json({produtos:[{sku:9,nome:'Test phone',temEstoque:true,precoVenda:10}],totalPages:3,totalElements:230});};
 try {
  const url='/api/search?q=worker-test&source=lg&page=2';
  const r=await worker.fetch(request(url));assert.equal(r.status,200);const data=await r.json();assert.equal(data.pagination.lg.page,2);assert.equal(data.pagination.lg.nextPage,3);assert.equal(data.items[0].source,'lg');assert.equal(data.sources.lg,'ok');
  await worker.fetch(request(url));assert.equal(count,1);
 }finally{globalThis.fetch=original;}
});
test('bundled exchange endpoint returns parsed source date and values',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(readFileSync(new URL('./fixtures/exchange.html',import.meta.url),'utf8'));
 try {const r=await worker.fetch(request('/api/exchange'));assert.equal(r.status,200);const data=await r.json();assert.equal(data.rates.BRL,5.2);assert.match(data.updatedLabel,/09:45/);}
 finally{globalThis.fetch=original;}
});
