const $=selector=>document.querySelector(selector);
const money=value=>value==null?'Preço não informado':'US$ '+value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const escapeText=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sourceName=source=>SOURCE_CONFIG[source]?.label||source;
const sourceOrder=Object.keys(SOURCE_CONFIG);
const sourceNote=item=>item.via==='compras'?'Oferta via Compras Paraguai':item.source==='compras'?'Compare as ofertas das lojas':'Consulta direta à loja';
const stockText=item=>item.availability==='in_stock'?'● Estoque confirmado pela loja':item.availability==='out_of_stock'?'Sem estoque na loja':'Disponibilidade a confirmar na loja';
const items=new Map(),positions=new Map(),details=new Map(),tasks=new Map();
let all=[],visibleLimit=24,searchController,searchVersion=0,selected=null,activeJobs=0,queue=[],submittedQuery='',currentRun=null,currentRate=null;
const dialog=$('#detail');
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
 if(!entry.isIntersecting)return;
 observer.unobserve(entry.target);
 const item=items.get(entry.target.dataset.key);
 if(item?.productPath&&!item.galleryLoaded)enqueue(item).catch(()=>{});
}),{rootMargin:'80px'});
function gallery(item,context='card') {
 const index=(positions.get(item.id)||0)%(item.images.length||1);
 const photo=item.images[index];
 return `<div class="gallery" data-gallery="${escapeText(item.id)}" data-context="${context}">${photo?`<img class="product-image" src="${escapeText(photo)}" alt="${escapeText(item.title)} — foto ${index+1}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:'<div class="no-photo">Imagem indisponível</div>'}${item.images.length>1?`<button type="button" class="gallery-arrow prev" data-step="-1" data-key="${escapeText(item.id)}" aria-label="Foto anterior de ${escapeText(item.title)}">‹</button><button type="button" class="gallery-arrow next" data-step="1" data-key="${escapeText(item.id)}" aria-label="Próxima foto de ${escapeText(item.title)}">›</button><span class="photo-count" aria-live="polite">${index+1} / ${item.images.length}</span>`:''}${!item.galleryLoaded&&item.productPath?`<span class="gallery-loader">${item.galleryFailed?'':'Carregando galeria…'}</span>${item.galleryFailed?`<button class="gallery-retry" data-retry="${escapeText(item.id)}">Tentar galeria</button>`:''}`:''}</div>`;
}
function refreshGalleries(item) {
 document.querySelectorAll('[data-gallery]').forEach(node=>{
 if(node.dataset.gallery!==item.id)return;
 const focus=node.contains(document.activeElement)?document.activeElement.dataset.step:null;
 const wrapper=document.createElement('div');wrapper.innerHTML=gallery(item,node.dataset.context);
 const next=wrapper.firstElementChild;node.replaceWith(next);
 if(focus)next.querySelector(`[data-step="${focus}"]`)?.focus({preventScroll:true});
 });
}
function card(item) {
 return `<article class="card" data-key="${escapeText(item.id)}">${gallery(item)}<div class="card-info"><span class="badge ${escapeText(item.source)}">${escapeText(sourceName(item.source).toUpperCase())}</span><p class="provenance">${sourceNote(item)}</p><button class="title-button" data-open="${escapeText(item.id)}">${escapeText(item.title)}</button><p class="price-prefix">${item.source==='compras'?'A partir de':'Preço na loja'}</p><p class="price">${item.priceUsd==null?'Sob consulta':`<small>US$</small>${item.priceUsd.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`}</p><p class="availability ${item.availability==='in_stock'?'confirmed':item.availability==='out_of_stock'?'unavailable':''}">${stockText(item)}</p><div class="card-bottom"><span>${item.source==='compras'?escapeText(item.store):'Oferta da loja'}</span><button class="open-button" data-open="${escapeText(item.id)}">${item.source==='compras'?'Comparar lojas':'Ver detalhes'} <span aria-hidden="true">↗</span></button></div></div></article>`;
}
function render() {
 observer.disconnect();
 const source=$('#source').value,stock=$('#stock').value,max=$('#max-price').value,sort=$('#sort').value;
 const filtered=all.filter(item=>(source==='all'||item.source===source)&&(stock==='all'||item.availability===stock)&&(!max||(item.priceUsd!=null&&item.priceUsd<=Number(max))));
 if(sort!=='relevance')filtered.sort((a,b)=>a.priceUsd==null?(b.priceUsd==null?0:1):b.priceUsd==null?-1:sort==='price-asc'?a.priceUsd-b.priceUsd:b.priceUsd-a.priceUsd);
 else filtered.sort((a,b)=>(a.searchRank||0)-(b.searchRank||0)||sourceOrder.indexOf(a.source)-sourceOrder.indexOf(b.source));
 $('#result-title').textContent=filtered.length+' '+(filtered.length===1?'resultado encontrado':'resultados encontrados');
 $('#result-subtitle').textContent=submittedQuery?'Resultados para “'+submittedQuery+'” · preços em dólar':'Mais lojas para comparar.';
 const focus=document.activeElement?.closest('#results [data-open]')?.dataset.open;
 const allFailed=currentRun&&!currentRun.loading&&Object.values(currentRun.sources).every(s=>s.status==='error')&&!all.length;
 const emptyTitle=currentRun?.loading?'Consultando as lojas…':allFailed?'Não conseguimos concluir a busca.':'Nenhum produto por aqui.';
 const emptyCopy=currentRun?.loading?'Os resultados aparecerão conforme as páginas forem consultadas.':allFailed?'As fontes estão indisponíveis agora. Tente novamente.':'Tente outro modelo ou ajuste os filtros.';
 $('#results').innerHTML=filtered.length?`<div class="grid">${filtered.slice(0,visibleLimit).map(card).join('')}</div>`:`<div class="empty"><h3>${emptyTitle}</h3><p>${emptyCopy}</p></div>`;
 if(focus)Array.from(document.querySelectorAll('#results [data-open]')).find(node=>node.dataset.open===focus)?.focus({preventScroll:true});
 $('#more').hidden=filtered.length<=visibleLimit;
 document.querySelectorAll('.card').forEach(node=>observer.observe(node));
}
function enqueue(item,priority=false) {
 if(details.has(item.id))return Promise.resolve(details.get(item.id));
 if(tasks.has(item.id))return tasks.get(item.id);
 const task=new Promise((resolve,reject)=>{const job={item,resolve,reject};priority?queue.unshift(job):queue.push(job);});
 tasks.set(item.id,task);pump();return task;
}
function pump() {
 while(activeJobs<2&&queue.length) {
 const {item,resolve,reject}=queue.shift();activeJobs++;
 const path=item.productPath||new URL(item.productUrl).pathname;
 fetch('/api/product?path='+encodeURIComponent(path),{signal:AbortSignal.timeout(30000)})
 .then(async response=>{if(!response.ok)throw Error('Detalhes indisponíveis');return response.json();})
 .then(data=>{
 details.set(item.id,data);item.images=data.images?.length?data.images:item.images;item.galleryLoaded=true;item.galleryFailed=false;
 refreshGalleries(item);resolve(data);
 }).catch(error=>{item.galleryFailed=true;refreshGalleries(item);reject(error);})
 .finally(()=>{activeJobs--;tasks.delete(item.id);pump();});
 }
}
function detailLayout(item) {
 return `<div class="detail-layout"><div class="detail-product">${gallery(item,'detail')}<span class="badge ${escapeText(item.source)}">${escapeText(sourceName(item.source).toUpperCase())}</span><p class="provenance">${sourceNote(item)}</p><h2 id="detail-title">${escapeText(item.title)}</h2><p class="price-prefix">${item.source==='compras'?'Menor preço anunciado':'Preço na loja'}</p><p class="price">${money(item.priceUsd)}</p><a class="origin-link" href="${escapeText(item.productUrl)}" target="_blank" rel="noopener noreferrer">Abrir página de origem ↗</a></div><section class="detail-offers" id="offer-list" aria-live="polite"></section></div>`;
}
function showOffers(item,data) {
 const offers=data.offers||[];
 $('#offer-list').innerHTML=`<h3>${offers.length} ${offers.length===1?'oferta':'ofertas'} para comparar</h3><p class="small">Da mais barata à mais cara · preços em dólar</p>${offers.length?offers.map((offer,i)=>`<div class="offer">${offer.logo?`<img class="offer-logo" src="${escapeText(offer.logo)}" alt="" loading="lazy">`:''}<div class="offer-store">${i===0&&offer.priceUsd!=null?'<span class="best-tag">MENOR PREÇO LISTADO</span>':''}<strong>${escapeText(offer.store)}</strong><p>${escapeText(offer.title)}</p></div><span class="offer-price">${money(offer.priceUsd)}</span><a class="offer-link" href="${escapeText(offer.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver oferta na ${escapeText(offer.store)}">↗</a></div>`).join(''):'<p class="detail-warning">Nenhuma oferta pôde ser lida nesta página. Consulte a origem para verificar a disponibilidade.</p>'}<p class="detail-warning">Valores consultados no Compras Paraguai. Confirme estoque, condições e preço final com a loja antes de comprar.</p><p class="small">Consultado às ${new Date(data.checkedAt||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p>`;
}
async function openItem(id) {
 const item=items.get(id);if(!item)return;
 selected=id;$('#detail-body').innerHTML=detailLayout(item);
 if(!dialog.open)dialog.showModal();
 $('#close-detail').focus();dialog.scrollTop=0;
 if(item.source!=='compras') {
 const name=escapeText(sourceName(item.source));
 $('#offer-list').innerHTML=`<h3>Oferta da ${name}</h3><p class="small">${stockText(item)}</p><div class="offer"><div class="offer-store"><strong>${name}</strong><p>${sourceNote(item)}</p></div><span class="offer-price">${money(item.priceUsd)}</span></div><p class="detail-warning">${item.via==='compras'?'Este preço foi publicado pela loja no Compras Paraguai.':'Preço e disponibilidade consultados no catálogo da loja.'} Confirme as condições e o valor final antes de comprar.</p><a class="secondary direct-offer-action" href="${escapeText(item.productUrl)}" target="_blank" rel="noopener noreferrer">Ver produto na loja ↗</a>${item.referenceUrl?`<p class="small direct-source-note"><a href="${escapeText(item.referenceUrl)}" target="_blank" rel="noopener noreferrer">Conferir oferta no Compras Paraguai ↗</a></p>`:''}`;
 if(item.productPath&&!item.galleryLoaded)enqueue(item,true).catch(()=>{});
 return;
 }
 $('#offer-list').innerHTML='<h3>Comparando as lojas</h3><p class="small">Buscando os valores na página do produto…</p><div class="skeleton" style="min-height:180px;margin-top:20px"></div>';
 try{const data=await enqueue(item,true);if(selected===id&&dialog.open)showOffers(item,data);}
 catch{if(selected===id&&dialog.open)$('#offer-list').innerHTML=`<h3>Ofertas indisponíveis agora</h3><div class="dialog-error"><p>Não foi possível consultar o Compras Paraguai. Você pode tentar novamente ou abrir a página de origem.</p><button class="secondary" data-open="${escapeText(id)}">Tentar novamente</button></div>`;}
}
async function getJSON(url,signal) {
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,28000);
 try {const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Consulta indisponível');return await response.json();}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function mergeItems(incoming) {
 for(const item of incoming) {
  if(items.has(item.id))continue;
  item.images=item.images||[];
  const detail=details.get(item.id);
  if(detail){item.images=detail.images?.length?detail.images:item.images;item.galleryLoaded=true;}
  items.set(item.id,item);
 }
 all=Array.from(items.values());
}
function renderProgress(run) {
 const known=Object.values(run.sources).reduce((sum,s)=>sum+s.totalPages,0);
 const failed=Object.entries(run.sources).filter(([,s])=>s.status==='error').map(([id])=>sourceName(id));
 $('#source-status').hidden=false;
 $('#source-status').innerHTML=sourceOrder.map(id=>{
  const state=run.sources[id],count=all.filter(item=>item.source===id).length;
  const label=state.status==='error'?'incompleta':state.status==='done'?String(count):'consultando';
  const note=SOURCE_CONFIG[id].mode==='via_compras'?'Via Compras Paraguai':'Consulta à fonte';
  return `<span class="source-pill" data-status="${state.status}" title="${note}">${escapeText(sourceName(id))}<span>${label}</span></span>`;
 }).join('');
 const progress=$('#search-progress');progress.hidden=false;progress.classList.toggle('loading',run.loading);
 progress.textContent=run.loading?`Consultando todas as páginas · ${run.completed.size} de ${known} páginas recebidas`:
  failed.length?`${run.completed.size} páginas consultadas · resultados parciais`:`Todas as ${run.completed.size} páginas disponíveis foram consultadas.`;
 $('#message').innerHTML=failed.length?`<div class="notice">Consulta incompleta: ${escapeText(failed.join(', '))}. Os resultados recebidos continuam disponíveis.${!run.loading?'<button class="text-button" id="retry-missing">Tentar páginas pendentes</button>':''}</div>`:'';
}
async function loadPages(run,initialJobs) {
 run.loading=true;
 const jobs=initialJobs.slice();
 initialJobs.forEach(job=>run.sources[job.source].status='loading');
 renderProgress(run);render();
 async function work() {
  while(jobs.length&&!run.controller.signal.aborted) {
   const job=jobs.shift(),key=job.source+':'+job.page;
   try {
    const data=await getJSON('/api/search?q='+encodeURIComponent(run.query)+'&source='+job.source+'&page='+job.page,run.controller.signal);
    if(currentRun!==run||run.controller.signal.aborted)return;
    const meta=data.pagination?.[job.source];
    if(!Array.isArray(data.items)||data.sources?.[job.source]!=='ok'||!meta||meta.page!==job.page)throw Error('Resposta inesperada');
    mergeItems(data.items);run.completed.add(key);run.failed.delete(key);
    const state=run.sources[job.source];state.totalPages=Math.max(job.page,meta.totalPages||1);
    if(meta.nextPage!=null) {
     if(!Number.isSafeInteger(meta.nextPage)||meta.nextPage<=job.page)throw Error('Paginação inválida');
     jobs.push({source:job.source,page:meta.nextPage});state.status='loading';
    }else state.status='done';
   }catch(error) {
    if(currentRun!==run||run.controller.signal.aborted)return;
    run.failed.set(key,job);run.sources[job.source].status='error';
   }
   renderProgress(run);render();
  }
 }
 await Promise.all(Array.from({length:3},()=>work()));
 if(currentRun!==run||run.controller.signal.aborted)return;
 run.loading=false;renderProgress(run);render();
}
async function search(event) {
 event?.preventDefault();const query=$('#query').value.trim();if(query.length<2||query.length>120)return;
 searchVersion++;searchController?.abort();searchController=new AbortController();observer.disconnect();
 queue.splice(0).forEach(job=>{tasks.delete(job.item.id);job.reject(Error('Busca alterada'));});
 if(dialog.open)dialog.close();
 all=[];items.clear();submittedQuery=query;visibleLimit=24;
 currentRun={query,controller:searchController,loading:true,completed:new Set(),failed:new Map(),sources:Object.fromEntries(sourceOrder.map(id=>[id,{status:'loading',totalPages:1}]))};
 await loadPages(currentRun,sourceOrder.map(source=>({source,page:1})));
}
async function loadExchange() {
 const button=$('#refresh-exchange');if(button.disabled)return;button.disabled=true;
 try {
  const data=await getJSON('/api/exchange');
  if(data.base!=='USD'||!data.updatedLabel||['BRL','PYG','ARS'].some(id=>!Number.isFinite(data.rates?.[id])||data.rates[id]<=0))throw Error('Cotação inválida');
  currentRate=data;
  $('#exchange-values').innerHTML=[['BRL','Real','R$'],['PYG','Guarani','G$'],['ARS','Peso argentino','AR$']].map(([id,label,symbol])=>`<span class="exchange-value"><small>${label}</small><strong>${symbol} ${data.rates[id].toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></span>`).join('');
  $('#exchange-date').textContent=data.updatedLabel;$('.exchange').classList.remove('is-stale');
 }catch {
  $('.exchange').classList.add('is-stale');
  if(currentRate)$('#exchange-date').textContent=currentRate.updatedLabel+' · Não foi possível atualizar agora.';
  else {$('#exchange-values').innerHTML='<span class="exchange-error">Cotação indisponível agora</span>';$('#exchange-date').textContent='Use ↻ para tentar novamente.';}
 }finally{button.disabled=false;}
}
$('#refresh-exchange').addEventListener('click',loadExchange);
loadExchange();
setInterval(()=>{if(document.visibilityState==='visible')loadExchange();},600000);
$('#search').addEventListener('submit',search);
['source','stock','max-price','sort'].forEach(id=>$('#'+id).addEventListener(id==='max-price'?'input':'change',()=>{visibleLimit=24;if(submittedQuery)render();}));
$('#clear').addEventListener('click',()=>{$('#source').value='all';$('#stock').value='all';$('#max-price').value='';$('#sort').value='relevance';if(submittedQuery)render();});
$('#more').addEventListener('click',()=>{visibleLimit+=24;render();});
$('#close-detail').addEventListener('click',()=>dialog.close());
let previousFocus;
dialog.addEventListener('close',()=>{selected=null;previousFocus?.focus({preventScroll:true});});
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
document.addEventListener('click',event=>{
 const step=event.target.closest('[data-step]');if(step){const item=items.get(step.dataset.key);positions.set(item.id,((positions.get(item.id)||0)+Number(step.dataset.step)+item.images.length)%item.images.length);refreshGalleries(item);return;}
 const retry=event.target.closest('[data-retry]');if(retry){const item=items.get(retry.dataset.retry);item.galleryFailed=false;refreshGalleries(item);enqueue(item,true).catch(()=>{});return;}
 const sample=event.target.closest('[data-query]');if(sample){$('#query').value=sample.dataset.query;search();return;}
 if(event.target.id==='retry-search'){search();return;}
 if(event.target.id==='retry-missing'){if(currentRun&&!currentRun.loading)loadPages(currentRun,Array.from(currentRun.failed.values()));return;}
 const open=event.target.closest('[data-open]');if(open){previousFocus=open;openItem(open.dataset.open);return;}
 const c=event.target.closest('.card');if(c&&!event.target.closest('button,a')){previousFocus=c.querySelector('.title-button');openItem(c.dataset.key);}
});
document.addEventListener('error',event=>{const img=event.target;if(img.matches?.('.product-image')){img.style.display='none';const note=document.createElement('div');note.className='no-photo';note.textContent='Imagem indisponível';img.after(note);}if(img.matches?.('.offer-logo'))img.hidden=true;},true);
let touchStart;
document.addEventListener('touchstart',event=>{const g=event.target.closest('[data-gallery]');touchStart=g?{id:g.dataset.gallery,x:event.touches[0].clientX,y:event.touches[0].clientY}:null;},{passive:true});
document.addEventListener('touchend',event=>{if(!touchStart)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y,item=items.get(touchStart.id);if(item?.images.length>1&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){positions.set(item.id,((positions.get(item.id)||0)+(dx<0?1:-1)+item.images.length)%item.images.length);refreshGalleries(item);}touchStart=null;},{passive:true});
