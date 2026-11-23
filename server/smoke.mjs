import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac,randomBytes} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
const key=randomBytes(32).toString('hex'), secret=randomBytes(32);
const port=process.env.TEST_PORT||28364;
const proc=spawn(process.execPath,[new URL('server.mjs',import.meta.url).pathname.replace(/^\/(.:\/)/,'$1')].map(decodeURIComponent),{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',EXT_SECRET:secret.toString('base64'),GAME_KEY:key,CHANNEL_ID:'123',EXT_ORIGIN:'https://test.invalid',VOTE_SECONDS:'5'},stdio:'inherit'});
function token(id,channel='123'){
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const content=enc({alg:'HS256'})+'.'+enc({opaque_user_id:id,channel_id:channel,exp:Date.now()/1000+120,role:'viewer'});
 return content+'.'+createHmac('sha256',secret).update(content).digest('base64url');
}
const api=(path,auth,data)=>fetch('http://127.0.0.1:'+port+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+auth},body:data?JSON.stringify(data):undefined});
const round='a'.repeat(32), choices=[{id:3,text:'Ask Abelard'},{id:7,text:'Leave'}];
async function open(r){const res=await api('/game',key,{round:r,choices});assert.equal(res.status,200);return res.json();}
try{
 let ready=false;
 for(let i=0;i<50;i++){try{ready=(await api('/state',token('U1'))).ok;}catch{} if(ready)break;await wait(100);}
 assert.ok(ready);
 await open(round);
 assert.equal((await (await api('/state',token('U1'))).json()).choices[1].id,7);
 assert.equal((await api('/vote',token('U1','456'),{round,id:7})).status,401);
 assert.equal((await api('/vote',token('A1'),{round,id:7})).status,403);
 for(const id of [3,7]) assert.equal((await api('/vote',token('U1'),{round,id})).status,200);
 await wait(5050); assert.equal((await open(round)).winner,7);
 const next='b'.repeat(32);await open(next);
 assert.equal((await api('/vote',token('U2'),{round,id:7})).status,409);
 for(const [user,id] of [['U1',3],['U2',7]]) await api('/vote',token(user),{round:next,id});
 await wait(5050);assert.equal((await open(next)).winner,null);
 assert.equal((await (await api('/state',token('U1'))).json()).round,null);
 console.log('PASS: state, authenticated votes, changed ballot, expiry, winner, stale round and tie');
}finally{proc.kill();}
