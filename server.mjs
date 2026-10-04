import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import worker from './worker/index.js';

export async function handleRenderRequest(incoming,outgoing,handler=worker){
 try{
  const headers=new Headers();
  for(const [name,value] of Object.entries(incoming.headers)){
   if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
  }
  const host=incoming.headers.host||'localhost';
  const request=new Request(new URL(incoming.url||'/',`http://${host}`),{method:incoming.method||'GET',headers});
  const response=await handler.fetch(request);
  outgoing.writeHead(response.status,Object.fromEntries(response.headers.entries()));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
 }catch{
  outgoing.writeHead(500,{'content-type':'application/json; charset=utf-8'});
  outgoing.end(JSON.stringify({error:'Erro interno do servidor.'}));
 }
}

export function createRenderServer(handler=worker){
 return createServer((incoming,outgoing)=>void handleRenderRequest(incoming,outgoing,handler));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||10000);
 const server=createRenderServer();
 server.listen(port,'0.0.0.0',()=>console.log(`BuscaPY ouvindo na porta ${port}`));
}
