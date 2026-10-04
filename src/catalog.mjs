import { load } from 'cheerio/slim';
import { SOURCES } from './sources.mjs';
export const CP = 'https://www.comprasparaguai.com.br';
export const LG = 'https://www.lgimportados.com';
export const MARINGA = 'https://casamaringa.com.py';
const clean = s => s.replace(/\s+/g, ' ').trim();
export function upstreamFailureLabel(error) {
 let current=error,code=null,depth=0;
 while(current&&depth++<4){
  if(typeof current.code==='string'&&/^[A-Z0-9_]+$/.test(current.code)){code=current.code;break;}
  current=current.cause;
 }
 if(code)return `${error?.name==='TypeError'?'TypeError':'Error'}:${code}`;
 const status=typeof error?.message==='string'&&error.message.match(/^Fonte respondeu (\d{3})$/);
 return status?`HTTP_${status[1]}`:'Error';
}
const price = s => { const n=s.match(/US\$\s*([\d.]+,\d{2})/); return n ? Number(n[1].replaceAll('.','').replace(',','.')) : null; };
const safeUrl = (s, base=CP) => { if(!s)return null;try {const u=new URL(s,base);return /^https?:$/.test(u.protocol)?u.href:null;} catch{return null;} };
const images = arr => [...new Set(arr.filter(Boolean).map(s=>safeUrl(s)).filter(s=>s && !s.includes('loading-images')))];
export function validateProductPath(path) {
 if (!/^\/[a-z0-9-]+_{1,2}\d+\/$/.test(path||'')) throw new Error('Página de produto inválida.');
 return path;
}
export function normalizeLg(x,i) {return {id:'lg:'+x.sku,source:'lg',title:x.nome,priceUsd:x.precoPromocional??x.precoVenda??null,store:'LG Importados',availability:x.temEstoque?'in_stock':'unknown',productUrl:LG+'/produto/'+x.sku,images:images(x.urls||[]),galleryLoaded:true,searchRank:i};}
export function parseSearch(html) {
 const $=load(html);return $('.promocao-produtos-item').map((i,el)=>{
 const c=$(el),a=c.find('.promocao-item-nome a').first(),path=a.attr('href');if(!path||!a.text().trim())return null;
 const pic=c.find('.promocao-item-img img').first(); const count=clean(c.find('button').text()).match(/(\d+)\s+OFERTAS/i);
 return {id:'compras:'+path,source:'compras',title:clean(a.text()),productUrl:safeUrl(path),productPath:path,priceUsd:price(c.find('.price-model, .promocao-item-preco-oferta').first().text()),store:count?count[1]+' ofertas':'Comparar lojas',offerCount:count?+count[1]:null,availability:'unknown',images:images([pic.attr('data-src')||pic.attr('src')]),galleryLoaded:false,searchRank:i};
 }).get().filter(x=>x&&x.productUrl);
}
const normalized = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseStoreSearch(html, source) {
 const config=SOURCES[source];if(config?.mode!=='via_compras')throw Error('Loja inválida.');
 const $=load(html);
 return $('.resultados-busca .promocao-produtos-item, #resultado-busca-container .promocao-produtos-item').map((i,el)=>{
  const c=$(el),a=c.find('.promocao-item-nome a').first(),path=a.attr('href');
  try{validateProductPath(path);}catch{return null;}
  const title=clean(a.text());if(!title)return null;
  const store=c.find('.promocao-item-preco-oferta .ver-detalhes img').first().attr('alt');
  const direct=safeUrl(c.find('.btn-store-redirect[href]').first().attr('href'));
  const host=direct?new URL(direct).hostname.replace(/^www\./,''):'';
  // Never attribute an aggregate/model minimum or another retailer's price to this store.
  if(store&&normalized(store)!==normalized(config.label))return null;
  if(direct&&!config.hosts.includes(host))return null;
  if(!store&&!direct)return null;
  const pic=c.find('.promocao-item-img img').first();
  return {id:source+':'+path,source,title,priceUsd:price(c.find('.promocao-item-preco-oferta').first().text()),
   store:config.label,availability:'unknown',productUrl:direct||safeUrl(path),referenceUrl:safeUrl(path),productPath:path,
   via:'compras',images:images([pic.attr('data-src')||pic.attr('src')]),galleryLoaded:false,searchRank:i};
 }).get().filter(Boolean);
}
export function normalizeMaringa(x,i=0) {
 const p=x.prices||{},digits=Number(p.currency_minor_unit);
 const usd=p.currency_code==='USD'&&Number.isInteger(digits)&&digits>=0&&digits<=6&&/^\d+$/.test(String(p.price))?Number(p.price)/10**digits:null;
 return {id:'casamaringa:'+x.id,source:'casamaringa',title:clean(load(String(x.name||'')).root().text()),
  priceUsd:Number.isFinite(usd)?usd:null,priceCurrency:p.currency_code||null,store:'Casa Maringá',
  availability:x.is_in_stock===true?'in_stock':x.is_in_stock===false?'out_of_stock':'unknown',
  productUrl:safeUrl(x.permalink,MARINGA),images:images((x.images||[]).map(image=>image.src)),galleryLoaded:true,searchRank:i};
}
export function parseExchange(html) {
 const $=load(html),box=$('.valor-cambio').first();
 const amount=selector=>{const raw=box.find(selector).first().text().replace(/[^\d,.]/g,'');return raw?Number(raw.replaceAll('.','').replace(',','.')):NaN;};
 const rates={BRL:amount('.cotacao-real'),PYG:amount('.cotacao-guarani'),ARS:amount('.cotacao-peso')};
 const updatedLabel=clean(box.find('.atualizacao-cotacao').first().text());
 if(!/US\$\s*1,00/.test(box.find('p').first().text())||!updatedLabel||Object.values(rates).some(n=>!Number.isFinite(n)||n<=0))throw Error('Cotação indisponível na origem.');
 return {base:'USD',amount:1,rates,updatedLabel,source:'Compras Paraguai',sourceUrl:CP+'/',checkedAt:Date.now()};
}
export function isSearchPage(html) {
 const $=load(html);return $('#resultado-busca-container').length>0;
}
export function parseDetail(html) {
 const $=load(html); const gallery=images($('.header-product-detail-image .product-thumbs-header').map((_,a)=>$(a).attr('href')).get());
 const offers=$('#container-ofertas .promocao-produtos-item').map((_,el)=>{
 const c=$(el),logo=c.find('img.store-image').first(),store=logo.attr('alt')||logo.attr('title');if(!store)return null;
 const title=clean(c.find('.promocao-item-nome').first().text()),link=c.find('.btn-store-redirect[href]').first().attr('href')||c.find('.promocao-item-nome a').attr('href');
 return {store,title,priceUsd:price(c.find('.promocao-item-preco-oferta').first().text()),url:safeUrl(link),logo:safeUrl(logo.attr('data-src')||logo.attr('src'))};
 }).get().filter(x=>x&&x.url);
 offers.sort((a,b)=>(a.priceUsd??Infinity)-(b.priceUsd??Infinity));
 return {title:clean($('h1').first().text()),images:gallery,offers,checkedAt:Date.now()};
}
export function pageNumbers(html) {const $=load(html);let max=1;$('a[href*="page="]').each((_,a)=>{try{const n=+new URL($(a).attr('href'),CP).searchParams.get('page');if(Number.isInteger(n)&&n>max)max=n;}catch{}});return max;}
export async function getText(url) {const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Fonte respondeu '+r.status);return r.text();}

export const comprasSearchUrl=(query,page)=>CP+"/busca/?q="+encodeURIComponent(query)+"&page="+(page+1);
