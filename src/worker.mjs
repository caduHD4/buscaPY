import page from './page.html';
import { CP, parseDetail, parseExchange, validateProductPath, getText, upstreamFailureLabel } from './catalog.mjs';
import { SOURCES } from './sources.mjs';
import { searchPage, searchSources } from './search.mjs';
const cache=new Map(), pending=new Map();
async function cached(key, fn) {
 const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.data;
 if(pending.has(key))return pending.get(key);
 const promise=fn().then(data=>{if(cache.size>=120)cache.delete(cache.keys().next().value);cache.set(key,{until:Date.now()+300000,data});return data;}).finally(()=>pending.delete(key));pending.set(key,promise);return promise;
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export default {async fetch(request) {
 const u=new URL(request.url);
 if(request.method!=='GET')return json({error:'Método não permitido.'},405);
 if(u.pathname==='/')return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff'}});
 if(u.pathname==='/api/health')return json({ok:true});
 if(u.pathname==='/api/exchange') {
  try{return json(await cached('exchange',async()=>parseExchange(await getText(CP+'/'))));}
  catch(error){console.error(`[BuscaPY] operation=exchange error=${upstreamFailureLabel(error)}`);return json({error:'Não foi possível consultar a cotação no Compras Paraguai.'},502);}
 }
 if(u.pathname==='/api/product') {
 let path;try{path=validateProductPath(u.searchParams.get('path'));}catch{return json({error:'Página de produto inválida.'},400);}
 try{return json(await cached('detail:'+path,async()=>{const d=parseDetail(await getText(CP+path));if(!d.title)throw Error('Formato inesperado');return d;}));}catch(error){console.error(`[BuscaPY] operation=product_detail error=${upstreamFailureLabel(error)}`);return json({error:'Não foi possível carregar as ofertas agora. Tente novamente.'},502);}
 }
 if(u.pathname!=='/api/search')return json({error:'Não encontrado.'},404);
 const q=(u.searchParams.get('q')||'').trim();if(q.length<2||q.length>120)return json({error:'Use entre 2 e 120 caracteres.'},400);
 const source=u.searchParams.get('source'),pageIndex=Number(u.searchParams.get('page')||1);
 if((source&&!Object.hasOwn(SOURCES,source))||!Number.isSafeInteger(pageIndex)||pageIndex<1||pageIndex>10000||(!source&&pageIndex!==1))return json({error:'Fonte ou página inválida.'},400);
 try {
  if(source)return json(await cached(JSON.stringify(['search',q.toLowerCase(),source,pageIndex]),async()=>{
   const result=await searchPage(q,source,pageIndex);
   return {items:result.items,sources:{[source]:'ok'},pagination:{[source]:result.pagination},checkedAt:Date.now()};
  }));
  const result=await cached(JSON.stringify(['search',q.toLowerCase(),'all']),()=>searchSources(q));
  return json(result,Object.values(result.sources).every(status=>status==='error')?502:200);
 }catch(error){console.error(`[BuscaPY] operation=search source=${source||'all'} error=${upstreamFailureLabel(error)}`);return json({error:'A fonte não respondeu. Tente novamente.',sources:source?{[source]:'error'}:{}},502);}
}};
