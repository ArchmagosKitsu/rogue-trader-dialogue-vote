import http from 'node:http';
import {createHmac, timingSafeEqual} from 'node:crypto';

const {GAME_KEY, EXT_SECRET, CHANNEL_ID, EXT_ORIGIN} = process.env;
if (!GAME_KEY || GAME_KEY.length < 32 || !EXT_SECRET || !CHANNEL_ID || !EXT_ORIGIN)
  throw Error('Set GAME_KEY (32+ characters), EXT_SECRET, CHANNEL_ID and EXT_ORIGIN');
const seconds = Number(process.env.VOTE_SECONDS || 30);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 300) throw Error('VOTE_SECONDS must be 5–300');
const secret = Buffer.from(EXT_SECRET, 'base64');
if (secret.length < 32) throw Error('Invalid extension signing secret');
let poll, heartbeat = 0;
const fail = (status) => { throw Object.assign(Error(), {status}); };
function equal(a,b) { return a.length === b.length && timingSafeEqual(a,b); }
function viewer(token) {
  const parts = token.split('.');
  if (parts.length !== 3) fail(401);
  try {
    const [h,p,s] = parts;
    const sig = createHmac('sha256', secret).update(h+'.'+p).digest();
    const data = JSON.parse(Buffer.from(p,'base64url'));
    if (!equal(sig,Buffer.from(s,'base64url')) || JSON.parse(Buffer.from(h,'base64url')).alg !== 'HS256'
        || !Number.isFinite(data.exp) || data.exp <= Date.now()/1000 || data.channel_id !== CHANNEL_ID
        || !['viewer','moderator','broadcaster'].includes(data.role)) fail(401);
    return data.opaque_user_id || '';
  } catch { fail(401); }
}
async function body(req) {
  let bytes = 0, chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if(bytes > 131072) fail(413); chunks.push(chunk); }
  try { const d = JSON.parse(Buffer.concat(chunks)); if(!d || typeof d !== 'object') fail(400); return d; } catch { fail(400); }
}
function closeIfDue() {
  if (!poll || poll.closed) return;
  if (Date.now()-heartbeat > 8000) { poll.closed = true; return; }
  if (Date.now() < poll.ends) return;
  poll.closed = true;
  const totals = new Map();
  for (const id of poll.votes.values()) totals.set(id,(totals.get(id)||0)+1);
  const sorted = [...totals].sort((a,b)=>b[1]-a[1]);
  if (sorted.length && sorted[0][1] > (sorted[1]?.[1] || 0)) poll.winner = sorted[0][0];
}
const server = http.createServer(async (req,res) => {
  const send = (status,data) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
  try {
    if (req.headers.origin === EXT_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin',EXT_ORIGIN);
      res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');
      res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') return send(200,{});
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) fail(401);
    const token = auth.slice(7);
    if (req.url === '/game' && req.method === 'POST') {
      if (!equal(Buffer.from(token),Buffer.from(GAME_KEY))) fail(401);
      const d = await body(req);
      closeIfDue();
      if(d.round === null) poll = null;
      else {
        if (typeof d.round !== 'string' || !/^[a-f0-9]{32}$/.test(d.round) || !Array.isArray(d.choices) ||
            d.choices.length < 2 || d.choices.length > 128 || d.choices.some(c=>!c || !Number.isSafeInteger(c.id) ||
            typeof c.text !== 'string' || !c.text.trim()) || new Set(d.choices.map(c=>c.id)).size !== d.choices.length) fail(400);
        if(poll?.round !== d.round) poll = {round:d.round,choices:d.choices.map(({id,text})=>({id,text})),ends:Date.now()+seconds*1000,votes:new Map(),closed:false,winner:null};
      }
      heartbeat = Date.now();
      return send(200,{round:poll?.round??null,winner:poll?.winner??null});
    }
    const voter = viewer(token);
    if(req.method === 'GET' && req.url === '/state') {
      closeIfDue();
      return send(200,poll && !poll.closed ? {round:poll.round,choices:poll.choices,remaining:poll.ends-Date.now(),mine:poll.votes.get(voter)??null} : {round:null});
    }
    if(req.method === 'POST' && req.url === '/vote') {
      const d = await body(req); closeIfDue();
      if(!voter.startsWith('U')) fail(403);
      if(!poll || poll.closed || poll.round !== d.round || !poll.choices.some(c=>c.id===d.id)) fail(409);
      poll.votes.set(voter,d.id); return send(200,{ok:true});
    }
    fail(404);
  } catch(e) { send(e.status||500,{error:e.status||500}); }
});
server.listen(Number(process.env.PORT || 8080),process.env.HOST || '127.0.0.1');
