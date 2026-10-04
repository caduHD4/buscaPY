import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleRenderRequest} from '../server.mjs';
import worker from '../worker/index.js';

async function request(path){
 const result={headers:{},body:''};
 const outgoing={writeHead(status,headers){result.status=status;result.headers=headers;},end(body){result.body=String(body);}};
 await handleRenderRequest({method:'GET',url:path,headers:{host:'localhost'}},outgoing,worker);
 return result;
}

test('Render HTTP adapter serves the homepage and health endpoint',async()=>{
 const home=await request('/');
 assert.equal(home.status,200);
 assert.match(home.headers['content-type'],/text\/html/);
 assert.match(home.body,/BuscaPY/);
 const health=await request('/api/health');
 assert.equal(health.status,200);
 assert.deepEqual(JSON.parse(health.body),{ok:true});
});
