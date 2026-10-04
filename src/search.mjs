import {CP,LG,MARINGA,parseSearch,parseStoreSearch,normalizeLg,normalizeMaringa,pageNumbers,isSearchPage,upstreamFailureLabel} from './catalog.mjs';
import {SOURCES} from './sources.mjs';

function pagination(page,totalPages,totalItems) {
 const count=Math.max(page,Number.isInteger(totalPages)&&totalPages>0?totalPages:1);
 return {page,totalPages:count,totalItems:Number.isFinite(totalItems)?totalItems:null,nextPage:page<count?page+1:null};
}
export async function searchPage(query,source,page=1,{fetcher=fetch}={}) {
 if(!Object.hasOwn(SOURCES,source)||!Number.isSafeInteger(page)||page<1||page>10000)throw Error('Fonte ou página inválida.');
 const config=SOURCES[source];let url;
 if(source==='lg')url=new URL('/produtos',LG);
 else if(source==='casamaringa')url=new URL('/wp-json/wc/store/v1/products',MARINGA);
 else url=new URL('/busca/',CP);
 if(source==='lg'){url.searchParams.set('query',query);url.searchParams.set('size','100');url.searchParams.set('page',String(page-1));}
 else if(source==='casamaringa'){url.searchParams.set('search',query);url.searchParams.set('per_page','50');url.searchParams.set('page',String(page));}
 else {url.searchParams.set('q',query);url.searchParams.set('page',String(page));if(config.shop)url.searchParams.set('loja',config.shop);}
 const response=await fetcher(url.href,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Fonte respondeu '+response.status);
 let items,meta;
 if(source==='lg') {
  const data=await response.json();if(!Array.isArray(data.produtos))throw Error('Formato inesperado.');
  items=data.produtos.filter(x=>x.temEstoque).map(normalizeLg);
  meta=pagination(page,Number(data.totalPages),Number(data.totalElements));
 }else if(source==='casamaringa') {
  const data=await response.json();if(!Array.isArray(data))throw Error('Formato inesperado.');
  const totalPages=Number(response.headers.get('x-wp-totalpages'));
  if(!Number.isInteger(totalPages)||totalPages<0)throw Error('Paginação indisponível.');
  // A full page without totals cannot safely be treated as the last page.
  if(!response.headers.has('x-wp-totalpages')&&data.length>=50)throw Error('Paginação indisponível.');
  items=data.map(normalizeMaringa).filter(x=>x.productUrl&&x.title);
  meta=pagination(page,totalPages,response.headers.has('x-wp-total')?Number(response.headers.get('x-wp-total')):null);
 }else {
  const html=await response.text();if(!isSearchPage(html))throw Error('A fonte não retornou uma página de busca.');
  items=config.shop?parseStoreSearch(html,source):parseSearch(html);
  meta=pagination(page,pageNumbers(html),null);
 }
 items.forEach((item,i)=>{item.searchRank=(page-1)*(source==='lg'?100:source==='casamaringa'?50:20)+i;});
 return {items,pagination:meta};
}
export async function searchSources(query,options={}) {
 const keys=Object.keys(SOURCES),results=await Promise.allSettled(keys.map(source=>searchPage(query,source,1,options)));
 const sources={},items=[],pagination={};
 results.forEach((r,i)=>{
  const source=keys[i];sources[source]=r.status==='fulfilled'?'ok':'error';
  if(r.status==='fulfilled'){items.push(...r.value.items);pagination[source]=r.value.pagination;}
  else console.error(`[BuscaPY] source=${source} error=${upstreamFailureLabel(r.reason)}`);
 });
 return {items,sources,pagination,checkedAt:Date.now()};
}
