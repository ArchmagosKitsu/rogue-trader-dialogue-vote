const panel = document.querySelector('section');
const choices = document.querySelector('#choices');
const statusLine = document.querySelector('#status');
let auth, current, busy=false;
async function api(path, data) {
  const res = await fetch(EBS+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+auth.token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  if(!res.ok) throw Error(String(res.status));
  return res.json();
}
async function refresh() {
  if (!auth || busy) return;
  busy=true;
  try {
    const state = await api('/state');
    panel.hidden = !state.round;
    if (!state.round) {current=null;return;}
    if (current !== state.round) {
      current=state.round; choices.replaceChildren(); statusLine.textContent='';
      for (const c of state.choices) {
        const btn=document.createElement('button'); btn.textContent=c.text; btn.dataset.id=c.id;
        btn.onclick=async()=>{
          btn.disabled=true;
          try {await api('/vote',{round:state.round,id:c.id});statusLine.textContent='Vote recorded';}
          catch(e){statusLine.textContent=e.message==='403'?'Sign in to Twitch to vote.':'Vote could not be recorded.';}
          finally{btn.disabled=false;}
          refresh();
        };
        choices.append(btn);
      }
    }
    for(const btn of choices.children) btn.setAttribute('aria-pressed',String(Number(btn.dataset.id)===state.mine));
    document.querySelector('#time').textContent=Math.max(0,Math.ceil(state.remaining/1000))+'s';
  } catch {panel.hidden=true;current=null;} finally{busy=false;}
}
window.Twitch.ext.onAuthorized(value=>{auth=value;refresh();});
setInterval(refresh,1500);
