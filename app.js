'use strict';
/* ===== NMT Vocabulary — вся логика. Дані: data/vocab_nmt2026.json (не изменяются). ===== */
const $=(s,r=document)=>r.querySelector(s);
/* высота приложения: в iOS-PWA fixed-слои иногда не доходят до низа экрана */
function fitH(){
 const sa=navigator.standalone||matchMedia('(display-mode:standalone)').matches;
 let h=innerHeight;
 if(sa&&innerHeight>innerWidth)h=Math.max(innerHeight,Math.max(screen.width,screen.height));
 document.documentElement.style.setProperty('--H',h+'px')}
fitH();addEventListener('resize',fitH);addEventListener('orientationchange',()=>setTimeout(fitH,300));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INT=[0,1,3,7,14,30,60];                       // интервалы (дни) по ступеням; ступень 7 = вивчено
const today=()=>Math.floor((Date.now()-new Date().getTimezoneOffset()*6e4)/864e5);
const dstr=d=>new Date(d*864e5).toISOString().slice(0,10);
const shuf=a=>{a=a.slice();for(let i=a.length;i>1;){const j=Math.random()*i--|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const pl=(n,w)=>w[n%10===1&&n%100!==11?0:n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?1:2];
const CATS=['Vocabulary','Idioms','Collocations','Verb + preposition','Phrasal verbs','Synonyms','Antonyms','Word formation','Formal vs informal'];
const DEF={goal:8,level:'both',cats:null,sound:true,haptic:true,theme:'dark',anim:true,reduce:false,onboarded:false};
const S={items:[],byId:new Map(),prog:new Map(),logs:new Map(),st:{},streak:{},plan:{day:-1,ids:[]},tab:'home',W:{seg:'all',q:'',cat:'',topic:'',lvl:'',n:60},F:{cat:'',topic:'',lvl:''},range:7,cl:'',Q:null,topics:[],custom:[],hints:{day:-1,used:0}};

/* ---------- IndexedDB ---------- */
const DB={d:null,
 open(){return new Promise((ok,no)=>{const r=indexedDB.open('nmtvocab',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('prog',{keyPath:'id'});d.createObjectStore('log',{keyPath:'d'});d.createObjectStore('kv',{keyPath:'k'})};r.onsuccess=()=>{this.d=r.result;ok()};r.onerror=()=>no(r.error)})},
 all(s){return new Promise(ok=>{if(!this.d)return ok([]);const q=this.d.transaction(s).objectStore(s).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>ok([])})},
 put(s,v){try{this.d.transaction(s,'readwrite').objectStore(s).put(v)}catch(e){}},
 del(s,k){try{this.d.transaction(s,'readwrite').objectStore(s).delete(k)}catch(e){}},
 clear(){return new Promise(ok=>{if(!this.d)return ok();const t=this.d.transaction(['prog','log','kv'],'readwrite');['prog','log','kv'].forEach(s=>t.objectStore(s).clear());t.oncomplete=ok})}};
const P=id=>S.prog.get(id),saveP=p=>DB.put('prog',p),saveL=l=>DB.put('log',l),saveKV=(k,v)=>DB.put('kv',{k,v});
const logOf=d=>{let l=S.logs.get(d);if(!l){l={d,nw:0,rv:0,ok:0,bad:0,secs:0};S.logs.set(d,l)}return l};
const newP=id=>{const p={id,stage:0,first:0,last:0,due:0,ok:0,bad:0,lapses:0,fav:false};S.prog.set(id,p);return p};
const saveSt=()=>saveKV('settings',S.st);

/* ---------- helpers ---------- */
const strip=s=>String(s).replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
const norm=s=>strip(s).toLowerCase().replace(/[’`]/g,"'").replace(/[.!?,;]/g,'').trim();
const arrow=it=>it.type==='word_formation'&&it.en.includes('→');
const fam=it=>it.type==='word'||it.type==='phrase'?'wp':it.type;
const isNewDone=id=>P(id)?.first===today();
const pick=a=>a[Math.random()*a.length|0];
const stLabel=s=>s>=7?'Вивчено':s>=4?'Закріплюється':s>=1?'Вивчається':'Нове';
const meta=it=>[(it.topics||[]).join(' · '),it.level].filter(Boolean).join(' · ');
const speakText=it=>strip(it.en.replace('→',', ')).replace(/\(.*?\)/g,'');
function say(it){try{const u=new SpeechSynthesisUtterance(typeof it==='string'?it:speakText(it));u.lang='en-US';u.rate=.9;const v=speechSynthesis.getVoices().find(v=>/^en[-_]US/.test(v.lang));if(v)u.voice=v;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
function hap(){if(!S.st.haptic)return;try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}try{$('#hl').click()}catch(e){}}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2400)}
let deletedWords=[],undoTimer,undoTick,undoUntil=0;
function clearWordUndo(){clearTimeout(undoTimer);clearInterval(undoTick);deletedWords=[];undoUntil=0;$('#undo').hidden=true}
function updateUndoClock(){
 const left=Math.max(0,undoUntil-Date.now());
 $('#undo-count').textContent=Math.ceil(left/1000);
 $('#undo .undo-progress').style.strokeDashoffset=100*(1-left/5000);
 if(!left)clearWordUndo();
}
function showWordUndo(){
 clearTimeout(undoTimer);clearInterval(undoTick);undoUntil=Date.now()+5000;
 const box=$('#undo');box.hidden=false;
 $('[role="status"]',box).textContent=deletedWords.length===1?'Слово видалено':`Видалено слів: ${deletedWords.length}`;
 updateUndoClock();undoTick=setInterval(updateUndoClock,50);
 undoTimer=setTimeout(clearWordUndo,5000);
}
function undoWords(){
 if(Date.now()>=undoUntil)return clearWordUndo();
 const pending=deletedWords.slice();clearWordUndo();
 for(const saved of pending.reverse()){
  const {item,progress,itemIndex,customIndex,planIndex,planDay}=saved;
  S.custom.splice(Math.min(customIndex,S.custom.length),0,item);
  S.items.splice(Math.min(itemIndex,S.items.length),0,item);indexItem(item);
  if(progress){S.prog.set(item.id,progress);saveP(progress)}
  if(planIndex>=0&&S.plan.day===planDay&&!S.plan.ids.includes(item.id))S.plan.ids.splice(Math.min(planIndex,S.plan.ids.length),0,item.id);
 }
 saveKV('custom',S.custom);saveKV('plan',S.plan);render();toast('Повернуто ✓');
}
function applyTheme(){const th=S.st.theme,dk=th==='dark'||(th==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.dataset.theme=dk?'dark':'light';document.documentElement.classList.toggle('calm',S.st.reduce||!S.st.anim);$('meta[name=theme-color]').content=dk?'#05070f':'#eef1fb'}

/* ---------- планирование дня ---------- */
const inScope=i=>(!S.st.cats||S.st.cats.includes(i.category))&&(S.st.level==='both'||!i.level||i.level===S.st.level);
const wordBucket=i=>i.category==='Vocabulary'?(i.custom?'own':'base'):'expr';
function ensurePlan(){
 const t=today(),g=S.st.goal;
 if(S.plan.day!==t)S.plan={day:t,ids:[],version:2};
 const old=S.plan.ids,done=old.filter(id=>S.byId.has(id)&&isNewDone(id));
 let keep=S.plan.version===2?old.filter(id=>S.byId.has(id)&&(isNewDone(id)||(!P(id)?.first&&inScope(S.byId.get(id))))):done.slice();
 keep=keep.filter((id,i)=>keep.indexOf(id)===i);
 if(keep.length>g)keep=done.concat(keep.filter(id=>!isNewDone(id)).slice(0,Math.max(0,g-done.length)));
 // Failed recall from yesterday takes priority over the normal group quotas.
 if(!keep.length){const urgent=shuf(S.items.filter(it=>!P(it.id)?.first&&P(it.id)?.pending&&P(it.id).due<=t&&inScope(it)).map(it=>it.id));keep=urgent.slice(0,g)}
 const used=new Set(keep),pools={own:[],base:[],expr:[]};
 for(const it of S.items)if(!P(it.id)?.first&&!used.has(it.id)&&inScope(it))pools[wordBucket(it)].push(it.id);
 for(const k of Object.keys(pools))pools[k]=shuf(pools[k]).sort((a,b)=>(P(b)?.pending?1:0)-(P(a)?.pending?1:0));
 const target={own:Math.round(g*.5),expr:Math.round(g*.2)};target.base=g-target.own-target.expr;
 const count={own:0,base:0,expr:0};keep.forEach(id=>count[wordBucket(S.byId.get(id))]++);
 const added=[];
 for(const k of ['own','base','expr'])while(count[k]<target[k]&&pools[k].length&&keep.length+added.length<g){added.push(pools[k].shift());count[k]++}
 while(keep.length+added.length<g){const k=['own','base','expr'].filter(k=>pools[k].length).sort((a,b)=>count[a]-count[b])[0];if(!k)break;added.push(pools[k].shift());count[k]++}
 keep=keep.concat(shuf(added));S.plan.version=2;
 if(keep.length!==old.length||keep.some((id,i)=>id!==old[i])||S.plan.mixed!==true){S.plan.ids=keep;S.plan.mixed=true;saveKV('plan',S.plan)}
 return S.plan.ids;
}
function learningQueue(ids,reviews=[]){
 const q=reviews.slice(0,5),rest=reviews.slice(5),batches=Math.ceil(ids.length/4);
 for(let i=0;i<ids.length;i+=4){const batch=ids.slice(i,i+4),n=i/4+1;
  q.push(...batch.map(id=>({id,k:'new',batch:n,batches})),...shuf(batch).map(id=>({id,k:'q0'})),...shuf(batch).map(id=>({id,k:'q1'})),...rest.splice(0,3));
 }
 return q.concat(rest);
}
const dueList=()=>{const t=today();return[...S.prog.values()].filter(p=>p.first&&p.stage<7&&p.due<=t)};
const mistakes=()=>[...S.prog.values()].filter(p=>p.bad>0).sort((a,b)=>b.bad/(b.ok+b.bad)-a.bad/(a.ok+a.bad)||b.bad-a.bad);
const streakNow=()=>{const s=S.streak,t=today();return s.last>=t-1||(s.last===t-2&&s.fz>0)?s.n:0};
function checkStreak(){const t=today(),s=S.streak;if(s.last===t)return false;const ids=ensurePlan(),L=S.logs.get(t);
 if(ids.some(id=>!isNewDone(id)))return false;if(!ids.length&&!(L&&L.ok+L.bad>0))return false;
 const gap=t-s.last;if(gap===1)s.n++;else if(gap===2&&s.fz>0){s.fz--;s.n++}else s.n=1;
 s.best=Math.max(s.best||0,s.n);if(s.n%7===0)s.fz=Math.min(2,(s.fz||0)+1);s.last=t;saveKV('streak',s);return true}

/* ---------- SRS + запись ответа ---------- */
function grade(e,g){const Q=S.Q,t=today(),ok=g>0,p=P(e.id)||newP(e.id),L=logOf(t);
 const mode=e.k==='mat'?'mat':Q.practice||e.k==='prac'?'prac':e.r?'retry':e.k;
 ok?(p.ok++,L.ok++,Q.ok++):(p.bad++,L.bad++,Q.bad++);p.last=t;
 if(mode==='rev'){L.rv++;Q.rv++}
 if((e.k==='q1'||e.k==='q0')&&!p.first){p.pending=true;p.due=t+1}
 if(e.k==='q1'&&ok&&!e.hinted&&!p.first){p.first=t;p.pending=false;L.nw++;Q.nw++}
 if(mode!=='prac'&&mode!=='mat'&&e.k!=='q0'&&(!e.hinted||!ok)){
  if(mode==='retry'){if(ok){if(!p.stage)p.stage=1;p.due=t+1}else p.due=t}
  else if(ok){p.stage=Math.min(7,p.stage+(g===3?2:(g===1&&p.stage)?0:1));p.due=p.stage>=7?1e9:t+(g===1?1:INT[p.stage])}
  else{p.lapses++;p.stage=p.stage?Math.max(1,p.stage-2):0;p.due=t}}
 if(ok&&e.k==='q1'&&e.hinted)Q.queue.splice(Math.min(3,Q.queue.length),0,{id:e.id,k:'q1',r:true});
 if(!ok&&mode!=='mat'&&(!e.r||(e.k==='q1'&&(e.attempt||0)<2)))Q.queue.splice(Math.min(3,Q.queue.length),0,{id:e.id,k:e.k,r:true,attempt:(e.attempt||0)+1});
 if(!e.r&&mode!=='mat'&&e.k!=='new')Q.done++;
 saveP(p);saveL(L);if(mode!=='prac'&&mode!=='mat'&&checkStreak())Q.streakUp=true}

/* ---------- генерация упражнений ---------- */
function distract(it,field,n=3){
 const key=fam(it),tp=new Set(it.topics||[]),mine=String(it[field]||'');const seen=new Set([norm(mine)]);
 const sc=S.items.filter(o=>o.id!==it.id&&fam(o)===key&&!arrow(o)&&o[field]).map(o=>{const c=(o.topics||[]).filter(x=>tp.has(x)).length;
  return[o,c*3+(o.level&&o.level===it.level?2:0)+(o.pos&&o.pos===it.pos?1:0)-Math.abs(String(o[field]).length-mine.length)/25+Math.random()*2]}).sort((a,b)=>b[1]-a[1]);
 const out=[];for(const[o]of sc){const v=strip(o[field]),k=norm(v);if(seen.has(k))continue;seen.add(k);out.push(v);if(out.length>=n)break}return out}
function variants(it){const raw=arrow(it)?it.en.split('→')[1]:it.en,en=strip(raw),v=new Set([en,en.replace(/\s*\([^)]*\)/g,''),en.replace(/[()]/g,'')]);
 if(en.includes('/'))en.split('/').forEach(x=>v.add(x.trim()));[...v].forEach(x=>{if(x.startsWith('to '))v.add(x.slice(3))});return[...v].map(norm).filter(Boolean)}
const typable=it=>it.en.length<=30&&!/…|\.\.\./.test(it.en);
function cloze(it){const w=strip(it.en).split(' ');if(w.length<2||/[()\/…]/.test(it.en))return null;
 if(it.type==='collocation'){const b=w[0],pool=[...new Set(S.items.filter(o=>o.type==='collocation'&&o.id!==it.id).map(o=>strip(o.en).split(' ')[0]))].filter(x=>/^[A-Za-z']+$/.test(x)&&x.toLowerCase()!==b.toLowerCase());return{b,stem:'___ '+w.slice(1).join(' '),d:shuf(pool).slice(0,3)}}
 if(it.type==='phrasal_verb'||it.type==='verb_preposition'){const b=w[w.length-1],pool=[...new Set(S.items.filter(o=>o.type===it.type&&o.id!==it.id).map(o=>{const x=strip(o.en).split(' ');return x[x.length-1]}))].filter(x=>/^[A-Za-z']+$/.test(x)&&x.toLowerCase()!==b.toLowerCase());return{b,stem:w.slice(0,-1).join(' ')+' ___',d:shuf(pool).slice(0,3)}}
 return null}
function buildEx(e){
 const it=S.byId.get(e.id),p=P(e.id),st=p?p.stage:0,easy=e.k==='q0'||e.r,W={},cz=cloze(it);
 if(arrow(it)){W.wf=5;if(!easy)W.card=1}
 else{W.mc=st<=1||easy?4:2;W.mc2=easy?1:st>=2?3:2;if(typable(it)&&!easy&&st>=2)W.type=st>=4?4:2;if(cz)W.cloze=3;
  if(it.type==='antonym_pair'&&it.antonym)W.anto=3;if(it.type==='formal_informal'&&it.informal)W.formal=3;if(!easy)W.card=1}
 let bag=[];for(const k in W)for(let i=0;i<W[k];i++)bag.push(k);let kind=e.k==='q0'?(arrow(it)?'wf':'mc'):e.k==='q1'?(arrow(it)?'wf':typable(it)?'type':'mc2'):pick(bag);
 const mc=(label,prompt,ans,ds,sub)=>{if(ds.length<2)return{kind:'card',it};const opts=shuf([ans,...ds]);return{kind:'mc',it,label,prompt,sub,opts,ci:opts.indexOf(ans)}};
 switch(kind){
  case'wf':return{kind:'type',it,label:'Утвори слово',prompt:strip(it.en.split('→')[0])+' → ___',hint:[it.rule,it.uk].filter(Boolean).join(' · '),ans:variants(it)};
  case'type':return{kind:'type',it,label:'Напиши англійською',prompt:it.uk,ans:variants(it)};
  case'mc2':return mc('Обери англійський варіант',it.uk,strip(it.en),distract(it,'en'));
  case'cloze':return mc('Заповни пропуск',cz.stem,cz.b,cz.d,it.uk);
  case'anto':return mc('Обери антонім',strip(it.en),strip(it.antonym),distract(it,'antonym'),it.uk);
  case'formal':return mc('Обери неформальний варіант',strip(it.en),strip(it.informal),distract(it,'informal'),'formal: '+it.uk);
  case'card':return{kind:'card',it};
  default:return mc('Обери переклад',strip(it.en),it.uk,distract(it,'uk'))}}

/* ---------- сессия ---------- */
function startSession(mode,o={}){
 let q=[],practice=false;
 if(mode==='day'||mode==='review'||mode==='custom'){
  const rev=shuf(dueList().sort((a,b)=>a.due-b.due).slice(0,50)).map(p=>({id:p.id,k:'rev'}));
  if(mode==='review')q=rev;
  else{const ids=mode==='custom'?shuf(S.custom.filter(i=>!P(i.id)?.first).map(i=>i.id)).slice(0,S.st.goal):ensurePlan().filter(id=>!isNewDone(id));q=learningQueue(ids,mode==='custom'?[]:rev)}
  if(!q.length)return startSession('free',o)}
 else{practice=true;let ids;
  if(mode==='hard')ids=mistakes().slice(0,20).map(p=>p.id);
  else if(mode==='fav')ids=shuf([...S.prog.values()].filter(p=>p.fav).map(p=>p.id)).slice(0,20);
  else{const pool=S.items.filter(i=>(!o.cat||i.category===o.cat)&&(!o.topic||(i.topics||[]).includes(o.topic))&&(!o.lvl||i.level===o.lvl)),seen=pool.filter(i=>P(i.id)?.first);ids=shuf(seen.length>=8?seen:pool).slice(0,20).map(i=>i.id)}
  q=ids.map(id=>({id,k:'prac'}));if(!q.length)return toast('Поки нічого тренувати')}
 const cand=q.filter(e=>(e.k==='rev'||e.k==='prac')).map(e=>e.id).filter(id=>{const it=S.byId.get(id);return!arrow(it)&&it.en.length<=28&&it.uk.length<=42});
 for(let i=7;i<q.length&&cand.length>=4&&mode!=='day'&&mode!=='custom';i+=8)q.splice(i,0,{k:'match',ids:shuf(cand).slice(0,4)});
 S.Q={active:true,mode,practice,queue:q,total:q.filter(e=>e.k!=='match'&&e.k!=='new').length,done:0,ok:0,bad:0,nw:0,rv:0,streakUp:false};
 render();shell();nextQ()}
function shell(){$('#app').innerHTML=`<div class="view in"><div class="sh"><button class="x" data-a="quit" aria-label="Закрити">✕</button><div class="bar pb"><i></i></div><small id="pc"></small></div><div id="qb"></div></div>`;$('#app').scrollTop=0}
function updPb(){const Q=S.Q;$('.pb i').style.width=Math.min(100,Q.done/Math.max(1,Q.total)*100)+'%';$('#pc').textContent=Math.min(Q.done,Q.total)+' / '+Q.total}
function nextQ(){const Q=S.Q;clearTimeout(Q.tm);if(!Q||!Q.active)return;if(!Q.queue.length)return finish();
 Q.cur=Q.queue.shift();Q.qs=Date.now();Q.locked=false;Q.ex=null;const e=Q.cur;let h;
 if(e.k==='new')h=studyV(S.byId.get(e.id));else if(e.k==='match')h=matchV(e);else{Q.ex=buildEx(e);h=exV(Q.ex)}
 $('#qb').innerHTML=`<div class="slide">${h}</div>`;updPb();$('#app').scrollTop=0;
 if(e.k==='new'&&S.st.sound)say(S.byId.get(e.id));
 if(Q.ex&&Q.ex.kind==='type')setTimeout(()=>$('#ti')&&$('#ti').focus(),380)}
const star=id=>P(id)?.fav?'⭐':'☆';
function extras(it){const r=[],add=(k,v)=>{if(v&&(!Array.isArray(v)||v.length))r.push(`<div><span>${k}</span>${esc(Array.isArray(v)?v.join(', '):v)}</div>`)};
 add('Синоніми',it.synonyms);add('Антонім',it.antonym&&it.antonym+(it.antonym_uk?' — '+it.antonym_uk:''));add('Informal',it.informal);add('Базове дієслово',it.base_verb);
 add('Правило',it.rule);add('Група',it.group);add('Нотатка',it.note);if(it.synonym_of&&typeof it.synonym_of!=='number')add('Синонім для',it.synonym_of);
 return r.length?`<div class="ext">${r.join('')}</div>`:''}
function studyV(it){const e=S.Q?.cur;return`<div class="lab">Знайомство${e?.batch?` · група ${e.batch} з ${e.batches}`:''}</div><div class="glass study"><div class="en">${esc(strip(it.en))}</div><div class="uk">${esc(it.uk)}</div><div class="meta">${esc(meta(it))}</div>${!it.custom&&it.example?`<p class="ex">${esc(it.example)}</p>`:''}${extras(it)}<div class="srow"><button class="ib" data-a="speak" data-id="${it.id}" aria-label="Вимовити">🔊</button><button class="ib" data-a="fav" data-id="${it.id}" aria-label="Обране">${star(it.id)}</button></div></div><button class="btn pri big" data-a="got">Зрозуміло</button>`}
function hintAllowance(it){
 if(S.hints.day!==today())S.hints={day:today(),used:0};
 return P(it.id)?.first&&P(it.id).first<today()?Infinity:Math.max(0,2-S.hints.used);
}
function hintControls(it){const left=hintAllowance(it);return `<div class="hint-row"><button class="btn" data-a="hintword" id="hint-btn" ${left===0?'disabled':''}>💡 Підказка${left===Infinity?'':` · ${left}/2`}</button><div id="word-hint" class="hint" role="status"></div></div>`}
function showWordHint(){
 const Q=S.Q,x=Q?.ex;if(!x||Q.locked||Q.cur.hinted)return;
 const left=hintAllowance(x.it);if(!left)return toast('На сьогодні використано 2 підказки для нових слів');
 if(left!==Infinity){S.hints.used++;saveKV('hints',S.hints)}
 Q.cur.hinted=true;
 const answer=x.kind==='type'?x.ans[0]:x.opts[x.ci];
 const masked=[...answer].map((c,i)=>/[a-zа-яіїєґ]/i.test(c)&&i!==answer.search(/[a-zа-яіїєґ]/i)?'＿':c).join(' ');
 $('#word-hint').textContent='Перша літера: '+masked;
 $('#hint-btn').disabled=true;$('#hint-btn').textContent='💡 Підказку показано';
}
function spellingDiff(typed,correct){
 const a=[...typed],b=[...correct],d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 const mine=[],right=[];let i=a.length,j=b.length;
 const mark=c=>'<mark>'+esc(c)+'</mark>',gap='<mark class="spell-gap" aria-label="Пропущена літера">·</mark>';
 while(i||j){
  if(i&&j&&d[i][j]===d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){const same=a[i-1]===b[j-1];mine.push(same?esc(a[i-1]):mark(a[i-1]));right.push(same?esc(b[j-1]):mark(b[j-1]));i--;j--}
  else if(i&&d[i][j]===d[i-1][j]+1){mine.push(mark(a[--i]));right.push(gap)}
  else{mine.push(gap);right.push(mark(b[--j]))}
 }
 return{distance:d[a.length][b.length],mine:mine.reverse().join(''),right:right.reverse().join('')};
}
function spellingFeedback(input,answers){
 const typed=norm(input),best=answers.map(a=>spellingDiff(typed,a)).sort((a,b)=>a.distance-b.distance)[0];
 return `<div class="spelling"><div><small>Твій варіант</small><div>${best.mine}</div></div><div><small>Правильно</small><div>${best.right}</div></div></div>`;
}
function exV(x){const it=x.it;
 if(x.kind==='card')return`<div class="lab">Картка</div><div class="flip" id="cd"><div class="fi"><div class="face f glass"><div class="en">${esc(strip(it.en))}</div><div class="meta">${esc(meta(it))}</div><button class="ib" data-a="speak" data-id="${it.id}">🔊</button></div><div class="face b glass"><div class="uk">${esc(it.uk)}</div>${!it.custom&&it.example?`<p class="ex">${esc(it.example)}</p>`:''}${extras(it)}</div></div></div><div id="rt"><button class="btn" data-a="show">Показати переклад</button><p class="hint" style="text-align:center;margin-top:12px">або свайп: ← не знаю · знаю →</p></div>`;
 if(x.kind==='type')return`<div class="lab">${x.label}</div><div class="glass qcard"><h2 class="pr">${esc(x.prompt)}</h2>${x.hint?`<p class="sub">${esc(x.hint)}</p>`:''}</div><input id="ti" type="text" placeholder="Введи відповідь" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><div class="two"><button class="btn" data-a="idk">Не знаю</button><button class="btn pri" data-a="chk">Перевірити</button></div>${hintControls(it)}<div id="fb"></div>`;
 return`<div class="lab">${x.label}</div><div class="glass qcard"><h2 class="pr">${esc(x.prompt)}</h2>${x.sub?`<p class="sub">${esc(x.sub)}</p>`:''}</div><div class="opts">${x.opts.map((o,i)=>`<button class="opt" data-a="opt" data-i="${i}"><b>${'ABCD'[i]}</b><span>${esc(o)}</span></button>`).join('')}</div>${hintControls(it)}<div id="fb"></div>`}
function matchV(e){const its=e.ids.map(id=>S.byId.get(id));e.bad=new Set();e.left=null;e.n=0;
 return`<div class="lab">З’єднай пари</div><div class="mt"><div class="opts">${its.map(i=>`<button class="opt" data-a="ml" data-id="${i.id}"><span>${esc(strip(i.en))}</span></button>`).join('')}</div><div class="opts">${shuf(its).map(i=>`<button class="opt" data-a="mr" data-id="${i.id}"><span>${esc(i.uk)}</span></button>`).join('')}</div></div><div id="fb"></div>`}
function resolve(ok,g){const Q=S.Q;if(Q.locked)return;Q.locked=true;const e=Q.cur,it=S.byId.get(e.id);
 logOf(today()).secs+=Math.min(60,(Date.now()-Q.qs)/1e3);grade(e,g);hap();if(S.st.sound)say(it);updPb();
 $('#fb').innerHTML=`<div class="fb ${ok?'ok':'bad'}"><div class="ft">${ok?'Вірно':'Запам’ятай'}</div><div class="fa">${esc(strip(it.en))} — ${esc(it.uk)}</div>${Q.ex?.comparison||''}${e.hinted?'<p class="hint">Відповідь із підказкою</p>':''}${!it.custom&&it.example?`<div class="fe">${esc(it.example)}</div>`:''}<button class="btn pri" data-a="next">Далі</button></div>`;
 const c=$('.qcard');if(c){c.classList.add(ok?'pop':'shake')}if(ok&&(it.custom||!it.example))Q.tm=setTimeout(nextQ,950);
 $('#fb').scrollIntoView({block:'nearest',behavior:'smooth'})}
function checkType(giveUp){const Q=S.Q;if(Q.locked)return;const inp=$('#ti'),ok=!giveUp&&Q.ex.ans.includes(norm(inp.value));if(!giveUp&&!inp.value.trim())return;Q.ex.comparison=!ok&&!giveUp?spellingFeedback(inp.value,Q.ex.ans):'';inp.classList.add(ok?'ok':'no');inp.blur();resolve(ok,ok?2:0)}
function finish(){const Q=S.Q,t=today(),L=S.logs.get(t)||{};Q.queue=[];Q.cur=null;checkStreak();const acc=Q.ok+Q.bad?Math.round(Q.ok/(Q.ok+Q.bad)*100):0,sn=streakNow();
 $('#app').innerHTML=`<div class="view in sum"><h1>${acc>=70?'Чудово! 🎉':'Готово 👏'}</h1><p class="hint">${Q.practice?'Тренування завершено':S.plan.ids.every(isNewDone)?'Мету дня виконано':'Сесію завершено'}</p><div class="grid"><div class="glass tile"><b>${Q.nw}</b><span>Нових</span></div><div class="glass tile"><b>${Q.rv}</b><span>Повторив</span></div><div class="glass tile"><b>${acc}%</b><span>Точність</span></div><div class="glass tile"><b>🔥 ${sn}</b><span>${pl(sn,['день','дні','днів'])} поспіль</span></div></div><div class="stack"><button class="btn pri big" data-a="quit">Продовжити навчання завтра</button><button class="btn" data-a="more">Повторити ще</button></div></div>`;
 if(acc>=70||Q.streakUp)confetti();hap()}

/* ---------- экраны ---------- */
const T=[['home','🏠','Головна'],['learn','📚','Вчити'],['stats','📊','Статистика'],['words','🔎','Слова'],['set','⚙️','Налаштування']];
function render(){const Q=S.Q;document.body.classList.toggle('sess',!!(Q&&Q.active));if(Q&&Q.active)return;
 if(!S.st.onboarded){document.body.classList.add('sess');return onb()}
 $('#tabs').innerHTML=T.map(([k,i,l])=>`<button data-a="tab" data-k="${k}" class="${S.tab===k?'on':''}"><span>${i}</span>${l}</button>`).join('');
 const f={home,learn,stats,words,set:settings}[S.tab];$('#app').innerHTML=`<div class="view in">${f()}</div>`;if(S.tab==='words')bindWords()}
function onb(){const s=S.st;$('#app').innerHTML=`<div class="view in onb"><h1>Welcome to NMT Vocabulary</h1><p>8 нових слів щодня — без зубріння.</p><div class="lab">Рівень</div><div class="seg">${[['A1-A2','A1-A2'],['B1-B2','B1-B2'],['both','Обидва']].map(([v,l])=>`<button class="${s.level===v?'on':''}" data-a="lvl" data-v="${v}">${l}</button>`).join('')}</div><div class="lab">Слів на день</div><div class="seg">${[5,8,10,15].map(n=>`<button class="${s.goal===n?'on':''}" data-a="goal" data-v="${n}">${n}</button>`).join('')}</div><div style="height:22px"></div><button class="btn pri big" data-a="onbgo">Почати навчання</button></div>`}
const counts=()=>{let learned=0,intro=0,ok=0,bad=0;S.prog.forEach(p=>{if(p.first)intro++;if(p.stage>=7)learned++});S.logs.forEach(l=>{ok+=l.ok;bad+=l.bad});return{learned,intro,ok,bad,acc:ok+bad?Math.round(ok/(ok+bad)*100):0}};
function home(){const t=today(),ids=ensurePlan(),done=ids.filter(isNewDone).length,left=ids.length-done,due=dueList().length,sn=streakNow(),L=S.logs.get(t)||{ok:0,bad:0,nw:0,rv:0},c=counts();
 const h=new Date().getHours(),g=h<5?'Доброї ночі':h<12?'Доброго ранку':h<18?'Добрий день':'Добрий вечір',frac=ids.length?done/ids.length:1,R=57,C=2*Math.PI*R,all=left===0&&due===0;
 return`<div class="top"><div><div class="app-n">NMT Vocabulary</div><h1>${g} 👋</h1></div><span class="pill hot"><span class="fl">🔥</span><b>${sn}</b></span></div>
 <div class="glass hero"><div class="ring"><svg width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="rg"><stop offset="0" stop-color="#6ee7d8"/><stop offset="1" stop-color="#8f86ff"/></linearGradient></defs><circle class="t" cx="64" cy="64" r="${R}"/><circle class="p" cx="64" cy="64" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-to="${C*(1-frac)}"/></svg><div>${done}<small>з ${ids.length}</small></div></div>
 <div class="hs"><div class="big">${left}</div><div>${pl(left,['нове','нові','нових'])} сьогодні</div><div class="big" style="font-size:28px">${due}</div><div style="margin:3px 0 0">на повторення</div></div></div>
 ${all?`<div class="glass done"><h2>Ти все зробив на сьогодні 🎉</h2><p>Можна повторити складне або потренуватися вільно.</p></div><div class="two stack"><button class="btn" data-a="start" data-m="hard">Складні</button><button class="btn" data-a="start" data-m="free">Вільна</button></div>`
 :`<div class="stack"><button class="btn pri big" data-a="start" data-m="day">${done>0||L.ok+L.bad>0?'Продовжити навчання':'Почати навчання'}</button>${left===0?'':due?`<button class="btn" data-a="start" data-m="review">Лише повторення · ${due}</button>`:''}</div>`}
 <div class="grid"><div class="glass tile"><b>${L.nw}</b><span>Нові сьогодні</span></div><div class="glass tile"><b>${due}</b><span>На повторення</span></div><div class="glass tile"><b>${c.learned}</b><span>Вивчено всього</span></div><div class="glass tile"><b>${c.acc}%</b><span>Точність</span></div></div>
 <div class="glass tile" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><span>Серія: <b style="display:inline">${sn} ${pl(sn,['день','дні','днів'])}</b></span><span>❄️ заморозки: ${S.streak.fz||0}</span></div><div class="bar"><i style="width:${(sn%7)/7*100}%"></i></div><span style="font-size:12px">Кожні 7 днів серії — одна заморозка на пропущений день</span></div>`}
const sel=(id,v,opts,ph)=>`<select id="${id}" aria-label="${ph}"><option value="">${ph}</option>${opts.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
function learn(){const own=S.custom.filter(i=>!P(i.id)?.first).length,due=dueList().length,left=ensurePlan().filter(id=>!isNewDone(id)).length,mk=mistakes().length,fv=[...S.prog.values()].filter(p=>p.fav).length,F=S.F;
 const row=(m,t,s,dis)=>`<button class="glass row" ${dis?'disabled style="opacity:.45"':`data-a="start" data-m="${m}"`}><div><b>${t}</b><span>${s}</span></div><em>›</em></button>`;
 return`<div class="top"><h1>Вчити</h1></div><p class="hint">Змішаний план: твої слова, слова з бази та вирази. Знайомство по 4 слова, потім перевірка.</p>${row('day','План на сьогодні',`${left} нових · ${due} повторень`,!left&&!due)}${row('custom','Вивчити додані',own+' нових у черзі',!own)}${row('review','Лише повторення',due+' на сьогодні',!due)}${row('hard','Складні слова',mk+' у списку помилок',!mk)}${row('fav','Обране',fv+' слів',!fv)}
 <div class="lab">Вільне тренування (20 завдань)</div><div class="sel" id="fsel">${sel('fc',F.cat,CATS,'Категорія')}${sel('ft',F.topic,S.topics,'Тема')}${sel('fl',F.lvl,['A1-A2','B1-B2'],'Рівень')}</div><button class="btn" data-a="start" data-m="free">Почати тренування</button>`}
function bars(a,mx){const n=a.length,w=300/n,M=mx||Math.max(1,...a.map(x=>x.v+(x.v2||0)));
 return`<svg class="ch" viewBox="0 0 300 118"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a)"/><stop offset="1" stop-color="var(--b)"/></linearGradient></defs>${a.map((x,i)=>{const h1=x.v/M*84,h2=(x.v2||0)/M*84,bx=i*w+w*.17,bw=w*.66,r=Math.min(5,bw/2);
 return`<rect x="${bx}" y="${96-h1}" width="${bw}" height="${Math.max(h1,x.v?2:1)}" rx="${r}" fill="${x.v?'url(#g1)':'var(--tint)'}"/>${h2?`<rect x="${bx}" y="${96-h1-h2-1}" width="${bw}" height="${h2}" rx="${r}" fill="var(--hot)" opacity=".85"/>`:''}${n<=7||i%5===n%5?`<text x="${bx+bw/2}" y="112">${x.l}</text>`:''}`}).join('')}</svg>`}
function line(v,lb){const M=Math.max(1,...v),n=v.length,pts=v.map((y,i)=>[i/(n-1)*300,90-y/M*78]),d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
 return`<svg class="ch" viewBox="0 0 300 112"><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a)" stop-opacity=".4"/><stop offset="1" stop-color="var(--a)" stop-opacity="0"/></linearGradient></defs><path d="${d} L300 90 L0 90Z" fill="url(#g2)"/><path d="${d}" fill="none" stroke="var(--a)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="108">${lb[0]}</text><text x="288" y="108">${lb[1]}</text></svg>`}
function stats(){const t=today(),c=counts(),L=S.logs.get(t)||{nw:0,rv:0},sn=streakNow(),secs=[...S.logs.values()].reduce((s,l)=>s+(l.secs||0),0),r=S.range,days=Array.from({length:r},(_,i)=>t-r+1+i),WD=['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
 const lab=d=>r<=7?WD[new Date(d*864e5).getUTCDay()]:new Date(d*864e5).getUTCDate(),firsts=[...S.prog.values()].map(p=>p.first).filter(Boolean),
 act=days.map(d=>{const l=S.logs.get(d);return{v:l?l.rv:0,v2:l?l.nw:0,l:lab(d)}}),accs=days.map(d=>{const l=S.logs.get(d),n=l?l.ok+l.bad:0;return{v:n?Math.round(l.ok/n*100):0,l:lab(d)}}),cum=days.map(d=>firsts.filter(f=>f<=d).length),
 strk=Array.from({length:14},(_,i)=>{const d=t-13+i,l=S.logs.get(d);return l&&l.ok+l.bad>0?'on':''});
 const arr=S.items.filter(i=>!S.cl||i.level===S.cl),cats=CATS.map(k=>{const a=arr.filter(i=>i.category===k);if(!a.length)return'';const m=a.reduce((s,i)=>s+Math.min(7,P(i.id)?.stage||0)/7,0)/a.length,intro=a.filter(i=>P(i.id)?.first).length,pc=Math.round(m*100);
  return`<button class="glass cat" data-a="gocat" data-c="${esc(k)}"><div><span>${k}</span><small>${intro}/${a.length} · ${pc}%</small></div><div class="bar" style="display:block"><i style="width:${pc}%"></i></div></button>`}).join('');
 return`<div class="top"><h1>Статистика</h1></div><div class="grid"><div class="glass tile"><b>${c.intro}</b><span>Всього вивчено</span></div><div class="glass tile"><b>${c.learned}</b><span>Вивчено (ступінь 7)</span></div><div class="glass tile"><b>${L.nw} / ${L.rv}</b><span>Нових / повторень сьогодні</span></div><div class="glass tile"><b>${c.acc}%</b><span>${c.ok} вірних, ${c.bad} помилок</span></div><div class="glass tile"><b>🔥 ${sn}</b><span>Серія</span></div><div class="glass tile"><b>${S.streak.best||0}</b><span>Найкраща серія</span></div></div>
 <div class="glass tile" style="margin-bottom:14px"><b>${secs>=3600?(secs/3600).toFixed(1)+' год':Math.round(secs/60)+' хв'}</b><span>Час навчання</span></div>
 <div class="seg"><button class="${r===7?'on':''}" data-a="range" data-v="7">7 днів</button><button class="${r===30?'on':''}" data-a="range" data-v="30">30 днів</button></div>
 <div class="glass chbox"><div class="lab">Заняття по днях · <span style="color:var(--hot)">нові</span> / повторення</div>${bars(act)}</div>
 <div class="glass chbox"><div class="lab">Вивчено слів (накопичувально)</div>${line(cum,[lab(days[0]),'сьогодні'])}</div>
 <div class="glass chbox"><div class="lab">Точність по днях, %</div>${bars(accs,100)}</div>
 <div class="glass chbox"><div class="lab">Серія — останні 14 днів</div><div class="dots">${strk.map(c=>`<i class="${c}"></i>`).join('')}</div><div style="height:8px"></div></div>
 <div class="lab" style="margin-top:20px">Категорії</div><div class="seg">${[['','Всі'],['A1-A2','A1-A2'],['B1-B2','B1-B2']].map(([v,l])=>`<button class="${S.cl===v?'on':''}" data-a="cl" data-v="${v}">${l}</button>`).join('')}</div>${cats}`}
function words(){const W=S.W;return`<div class="top"><h1>Слова</h1><button class="btn sm pri" data-a="addw">＋ Додати</button></div><div class="seg">${[['all','Всі'],['fav','⭐ Обране'],['err','Помилки'],['my','Додані']].map(([v,l])=>`<button class="${W.seg===v?'on':''}" data-a="wseg" data-v="${v}">${l}</button>`).join('')}</div><input type="search" id="wq" placeholder="Пошук слів..." value="${esc(W.q)}"><div class="sel">${sel('wc',W.cat,CATS,'Категорія')}${sel('wt',W.topic,S.topics,'Тема')}${sel('wl2',W.lvl,['A1-A2','B1-B2'],'Рівень')}</div>${W.seg==='err'?`<button class="btn pri" style="margin-bottom:14px" data-a="start" data-m="hard">Повторити складні</button>`:''}<div id="wl"></div>`}
function wlist(){const W=S.W,q=W.q.trim().toLowerCase();let list=S.items;
 if(W.seg==='fav')list=list.filter(i=>P(i.id)?.fav);if(W.seg==='my')list=list.filter(i=>i.custom);if(W.seg==='err'){const m=new Map(mistakes().map((p,i)=>[p.id,i]));list=list.filter(i=>m.has(i.id)).sort((a,b)=>m.get(a.id)-m.get(b.id))}
 list=list.filter(i=>(!W.cat||i.category===W.cat)&&(!W.topic||(i.topics||[]).includes(W.topic))&&(!W.lvl||i.level===W.lvl)&&(!q||i._s.includes(q)));
 if(!list.length)return`<p class="hint" style="text-align:center;padding:30px 0">${W.seg==='fav'?'Натисни ☆ на картці слова, щоб зберегти його сюди':W.seg==='my'?'Ти ще не додав власних слів':W.seg==='err'?'Помилок поки немає — чудово!':'Нічого не знайдено'}</p>`;
 const part=list.slice(0,W.n);return part.map(i=>{const p=P(i.id),pc=p&&p.ok+p.bad?Math.round(p.ok/(p.ok+p.bad)*100):null;
  return`<button class="glass row" data-a="open" data-id="${i.id}"><div><b>${esc(strip(i.en))}</b><span>${esc(i.uk)}</span></div><em>${W.seg==='err'&&pc!==null?`<span class="mark${pc>=70?' g':''}">${pc}%</span><br>`:''}${esc([i.level,(i.topics||[])[0]].filter(Boolean).join(' · '))}${p&&p.fav?' ⭐':''}</em></button>`}).join('')+(list.length>W.n?`<button class="btn" data-a="moreW">Показати ще (${list.length-W.n})</button>`:'')}
function fillList(){$('#wl').innerHTML=wlist()}
function bindWords(){fillList();let t;$('#wq').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{S.W.q=e.target.value;S.W.n=60;fillList()},140)};
 [['wc','cat'],['wt','topic'],['wl2','lvl']].forEach(([id,k])=>{$('#'+id).onchange=e=>{S.W[k]=e.target.value;S.W.n=60;fillList()}})}
function settings(){const s=S.st,tg=(k,l)=>`<div class="sr"><span>${l}</span><button class="sw ${s[k]?'on':''}" data-a="tog" data-k="${k}" role="switch" aria-checked="${!!s[k]}" aria-label="${l}"></button></div>`,cats=s.cats||CATS;
 return`<div class="top"><h1>Налаштування</h1></div><div class="lab">Слів на день</div><div class="seg">${[5,8,10,15].map(n=>`<button class="${s.goal===n?'on':''}" data-a="goal" data-v="${n}">${n}</button>`).join('')}</div>
 <div class="lab">Рівень</div><div class="seg">${[['A1-A2','A1-A2'],['B1-B2','B1-B2'],['both','Обидва']].map(([v,l])=>`<button class="${s.level===v?'on':''}" data-a="lvl" data-v="${v}">${l}</button>`).join('')}</div>
 <div class="lab">Теми й категорії для нових слів</div><div class="chips">${CATS.map(c=>`<button class="chip ${cats.includes(c)?'on':''}" data-a="cat" data-c="${esc(c)}">${c}</button>`).join('')}</div>
 <div class="lab">Оформлення</div><div class="seg">${[['dark','Темна'],['light','Світла'],['auto','Авто']].map(([v,l])=>`<button class="${s.theme===v?'on':''}" data-a="theme" data-v="${v}">${l}</button>`).join('')}</div>
 <div class="glass set">${tg('sound','Озвучення (авто-вимова)')}${tg('haptic','Вібрація')}${tg('anim','Анімації')}${tg('reduce','Зменшити рух')}</div>
 <div class="lab">Дані</div><div class="stack"><button class="btn" data-a="export">Експорт прогресу (JSON)</button><button class="btn" data-a="import">Імпорт прогресу</button><button class="btn" style="color:var(--no)" data-a="reset">Скинути прогрес</button></div><input type="file" id="imp" accept="application/json,.json" hidden>
 <p class="hint" style="text-align:center">NMT Vocabulary · ${S.items.length} елементів · усе зберігається лише на цьому пристрої</p>`}
function openDetail(id){const it=S.byId.get(id),p=P(id)||{stage:0,ok:0,bad:0,due:0,first:0},t=today();
 const nx=!p.first?'—':p.stage>=7?'вивчено':p.due<=t?'сьогодні':'за '+(p.due-t)+' дн.';
 $('#sheet').innerHTML=`<div class="glass"><div class="study" style="padding:6px 0 0"><div class="en">${esc(strip(it.en))}</div><div class="uk">${esc(it.uk)}</div><div class="meta">${esc([it.category,meta(it)].filter(Boolean).join(' · '))}</div>${!it.custom&&it.example?`<p class="ex">${esc(it.example)}</p>`:''}${extras(it)}<div class="srow"><button class="ib" data-a="speak" data-id="${id}">🔊</button><button class="ib" data-a="fav" data-id="${id}">${star(id)}</button></div></div><div class="grid" style="margin:18px 0 12px"><div class="tile glass"><b style="font-size:19px">${stLabel(p.stage)}</b><span>Ступінь ${p.stage}/7 · повтор: ${nx}</span></div><div class="tile glass"><b style="font-size:19px">${p.ok} ✓ / ${p.bad} ✗</b><span>${p.ok+p.bad?Math.round(p.ok/(p.ok+p.bad)*100)+'% вірно':'ще не відповідав'}</span></div></div>${it.custom?`<button class="btn" style="color:var(--no);margin-bottom:10px" data-a="delw" data-id="${id}">Видалити слово</button>`:''}<button class="btn" data-a="closeSheet">Закрити</button></div>`;
 $('#sheet').classList.add('open')}
function confetti(){if(S.st.reduce||!S.st.anim)return;const c=$('#fx'),x=c.getContext('2d');c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;const cs=['#6ee7d8','#8f86ff','#ffb36b','#ff6b9a','#5be3a1'],d=devicePixelRatio,
 ps=Array.from({length:130},()=>({x:innerWidth/2*d,y:innerHeight*.35*d,vx:(Math.random()-.5)*16*d,vy:(-Math.random()*14-4)*d,s:(4+Math.random()*6)*d,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:pick(cs)}));let f=0;
 (function tick(){x.clearRect(0,0,c.width,c.height);ps.forEach(p=>{p.vy+=.35*d;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.globalAlpha=Math.max(0,1-f/150);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);x.restore()});if(++f<150)requestAnimationFrame(tick);else x.clearRect(0,0,c.width,c.height)})()}

/* ---------- власні слова ---------- */
const CYR=/[а-яіїєґ]/i,ADDCATS=['Vocabulary','Idioms','Collocations','Verb + preposition','Phrasal verbs'];
const DT={'Verb + preposition':'Verbs with prepositions','Phrasal verbs':'Phrasal verbs','Idioms':'Idioms','Collocations':'Collocations'};
const TL={а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ye',ж:'zh',з:'z',и:'y',і:'i',ї:'yi',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'yu',я:'ya',"'":''};
const translit=s=>[...s.toLowerCase()].map(c=>TL[c]??c).join('');
function lev(a,b){if(a===b)return 0;let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[b.length]}
const bare=s=>norm(s).replace(/\([^)]*\)/g,'').replace(/^(to|be)\s+/,'').replace(/\s+/g,' ').trim();
function findDup(en,cat){const k=bare(en),tk=k.split(' '),r={same:null,other:[],similar:[]};
 for(const o of S.items){if(arrow(o))continue;const b=bare(o.en);if(!b)continue;
  if(b===k){if(o.category===cat&&!r.same)r.same=o;else r.other.push(o);continue}
  const to=b.split(' '),sub=(a,c)=>a.every(w=>c.includes(w)),
   contain=to.length!==tk.length&&(sub(tk,to)||sub(to,tk)),
   near=k.length>=4&&b.length>=4&&Math.abs(b.length-k.length)<=2&&lev(b,k)<=(k.length>=9?2:1);
  if(contain||near)r.similar.push(o)}
 const rank=o=>(o.category===cat?0:100)+Math.abs(bare(o.en).length-k.length);r.similar.sort((a,b)=>rank(a)-rank(b));return r}
const dupList=a=>a.slice(0,5).map(o=>`<div class="ar"><b>${esc(strip(o.en))}</b> — ${esc(o.uk)} <small>${esc(o.category)}</small></div>`).join('')+(a.length>5?`<div class="ar">…і ще ${a.length-5}</div>`:'');
/* Fast, bounded requests; successful lookups are reused during this session. */
async function tfetch(u,timeout=3000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(u,{signal:c.signal});if(!r.ok)throw Error('Lookup failed');return await r.json()}finally{clearTimeout(t)}}
const translationCache=new Map(),dictionaryCache=new Map();
const cleanTranslation=s=>String(s||'').replace(/["“”„«»]/g,'').replace(/^['‘’]+|['‘’]+$/g,'').replace(/\s+/g,' ').trim();
function tr(q,from,to){
 const key=from+'|'+to+'|'+q;if(translationCache.has(key))return translationCache.get(key);
 const valid=r=>{r.main=cleanTranslation(r.main);r.list=[...new Set(r.list.map(cleanTranslation).filter(x=>x&&x.toLowerCase()!==q.toLowerCase()&&(to!=='uk'||CYR.test(x))))];if(!r.list.length)throw Error('No translation');return r};
 const google=tfetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&dt=bd&q=${encodeURIComponent(q)}`).then(j=>{const main=(j[0]||[]).map(x=>x[0]).join(''),alts=(j[1]||[]).flatMap(e=>e[1]||[]);return valid({main,list:[main,...alts],dict:alts.length})});
 const backup=tfetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`).then(j=>{if(+j.responseStatus!==200)throw Error('Translation unavailable');const main=j.responseData?.translatedText||'',alts=(j.matches||[]).filter(m=>m.segment?.toLowerCase()===q.toLowerCase()&&+m.match>=.8).map(m=>m.translation);return valid({main,list:[main,...alts],dict:null})});
 const pending=Promise.any([google,backup]).catch(()=>{translationCache.delete(key);return null});translationCache.set(key,pending);return pending;
}
function wordDictionary(en){
 const key=bare(en);if(dictionaryCache.has(key))return dictionaryCache.get(key);
 const pending=tfetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(key)).then(j=>{if(!Array.isArray(j))throw Error('No dictionary entry');return j.flatMap(e=>e.meanings||[])}).catch(()=>{dictionaryCache.delete(key);return []});
 dictionaryCache.set(key,pending);return pending;
}
const PAST_FORMS={was:'be',were:'be',been:'be',went:'go',gone:'go',did:'do',done:'do',had:'have',got:'get',gotten:'get',made:'make',took:'take',taken:'take',gave:'give',given:'give',came:'come',became:'become',saw:'see',seen:'see',knew:'know',known:'know',thought:'think',bought:'buy',brought:'bring',caught:'catch',taught:'teach',found:'find',felt:'feel',left:'leave',lost:'lose',kept:'keep',slept:'sleep',spoke:'speak',spoken:'speak',wrote:'write',written:'write',ate:'eat',eaten:'eat',drank:'drink',drunk:'drink',drove:'drive',driven:'drive',ran:'run',swam:'swim',swum:'swim',sang:'sing',sung:'sing',began:'begin',begun:'begin',broke:'break',broken:'break',chose:'choose',chosen:'choose',fell:'fall',fallen:'fall',forgot:'forget',forgotten:'forget',sent:'send',spent:'spend',told:'tell',sold:'sell',paid:'pay',stood:'stand',understood:'understand',heard:'hear',held:'hold',won:'win',wore:'wear',worn:'wear',flew:'fly',flown:'fly',grew:'grow',grown:'grow',threw:'throw',thrown:'throw',met:'meet',built:'build',led:'lead',let:'let',put:'put',cut:'cut',read:'read'};
function baseWord(input){
 const words=input.toLowerCase().replace(/^to\s+/,'').split(' '),word=words[0];
 const verbs=new Set('attend publish provide gather collect work play walk talk study try stop plan travel love live move use dance create help want need call ask watch start finish learn listen open close visit enjoy'.split(' '));
 for(const it of S.items)if(it.pos==='verb'||it.topics?.includes('Verbs')||['phrasal_verb','verb_preposition'].includes(it.type))verbs.add(bare(it.en).split(' ')[0]);
 let root=PAST_FORMS[word];
 if(!root&&word.endsWith('ed')){
  const stem=word.slice(0,-2),candidates=[word.endsWith('ied')?word.slice(0,-3)+'y':'',word.slice(0,-1),stem,/(.)\1$/.test(stem)?stem.slice(0,-1):''];
  root=candidates.find(w=>verbs.has(w));
 }
 if(root)words[0]=root;
 return words.join(' ');
}
/* порівняння українських / англійських варіантів */
const ukTok=s=>s.toLowerCase().replace(/[’`ʼ]/g,"'").replace(/\([^)]*\)/g,' ').split(/[^а-яіїєґ']+/).filter(w=>w.length>2);
const stemEq=(a,b)=>{let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;const m=Math.min(a.length,b.length);return i>=(m<=4?m:Math.max(4,m-2))};
function ukOk(a,b){const A=ukTok(a),B=ukTok(b);if(!A.length||!B.length)return a.trim().toLowerCase()===b.trim().toLowerCase();
 const[s,l]=A.length<=B.length?[A,B]:[B,A];return s.every(w=>l.some(x=>stemEq(w,x)))}
const STOP=['a','an','the','to','be','one'];
function enOk(x,en){const a=bare(x),b=bare(en);if(a===b)return true;if(b.length>=4&&lev(a,b)<=1)return true;
 const A=a.split(' ').filter(w=>!STOP.includes(w)),B=b.split(' ').filter(w=>!STOP.includes(w));if(!A.length||!B.length)return false;
 const[s,l]=A.length<=B.length?[A,B]:[B,A];return s.every(w=>l.some(y=>y===w||(w.length>=4&&lev(w,y)<=1)))}
const ask=h=>new Promise(r=>{S.askR=r;const am=$('#am');am.className='am';am.innerHTML=h+`<div class="two" style="margin-top:10px"><button class="btn" data-a="askno">Скасувати</button><button class="btn pri" data-a="askyes">Додати все одно</button></div>`});
const TOPIC_HINTS={
 'Nature':'animal plant tree forest river ocean wildlife bark',
 'Weather':'weather rain snow wind storm temperature climate',
 'City and countryside':'city town village street urban rural',
 'Sport':'sport athlete athletic football tennis competition',
 'Health':'health medical doctor disease medicine hospital',
 'Home':'home house kitchen furniture household',
 'Travel':'travel tourism tourist journey destination hotel',
 'Holidays':'holiday celebration festival birthday christmas',
 'Education':'education school student teacher university study learn book publish publication publishing',
 'Hobbies and Leisure':'hobby leisure entertainment circus acrobat acrobatics performer performance music art theatre dance',
 'Transport':'transport vehicle car bus train airplane driving',
 'Shopping':'shopping buy sell purchase shop retail price',
 'Clothing':'clothing clothes dress shirt trousers fashion',
 'Work':'work job career employment employee employer business office salary profession professional',
 'Technology':'technology computer software digital internet device',
 'Emotions and Feelings':'emotion feeling aware awareness happy sad anger fear consciousness',
 'Food and Drinks':'food drink meal cooking eat bread fruit vegetable',
 'Family':'family parent child mother father marriage sibling'
};
const metaTokens=s=>String(s).toLowerCase().match(/[a-z]+|[а-яіїєґ]+/g)||[];
function autoWordMeta(en,uk,meanings=[]){
 const base=S.items.filter(o=>!o.custom),key=bare(en),exact=base.find(o=>bare(o.en)===key);
 if(exact)return{category:exact.category,type:exact.type,level:exact.level||'B1-B2',topics:[...(exact.topics||[])],pos:exact.pos,metaVersion:2};
 const words=key.split(' '),last=words.at(-1),first=words[0];
 const pos=meanings[0]?.partOfSpeech||null;
 const verb=pos==='verb'||base.some(o=>bare(o.en)===first&&(o.topics||[]).includes('Verbs'));
 let category='Vocabulary',type=words.length>1?'phrase':'word';
 if(words.length===2&&verb&&['up','out','off','down','away','back','over','on','in'].includes(last)){category='Phrasal verbs';type='phrasal_verb'}
 else if(words.length===2&&verb&&['with','to','for','from','about','at','of','into'].includes(last)){category='Verb + preposition';type='verb_preposition'}
 else if(words.length>1&&(/^(fully|well|highly|deeply|strongly|completely|perfectly|widely|closely|particularly|absolutely) /.test(key)||base.some(o=>o.type==='collocation'&&bare(o.en)===key))){category='Collocations';type='collocation'}
 const direct=new Set(metaTokens(key)),translated=new Set(metaTokens(uk));
 const context=new Set(metaTokens(meanings.flatMap(m=>(m.definitions||[]).slice(0,3).map(d=>d.definition||'')).join(' ')));
 const scores=new Map();
 const add=(topic,n)=>scores.set(topic,(scores.get(topic)||0)+n);
 for(const [topic,hints] of Object.entries(TOPIC_HINTS))for(const token of hints.split(' ')){if(direct.has(token))add(topic,8);if(context.has(token))add(topic,2)}
 // Whole translation tokens avoid false matches such as усвідомлювати / усміхатися.
 const candidates=base.filter(o=>o.category==='Vocabulary').map(o=>{const ot=new Set(metaTokens(o.uk));return{o,n:[...translated].filter(t=>t.length>3&&ot.has(t)).length}}).filter(x=>x.n);
 for(const {o,n} of candidates)for(const topic of o.topics||[])if(TOPIC_HINTS[topic])add(topic,n*3/candidates.length);
 const ranked=[...scores].sort((a,b)=>b[1]-a[1]);
 let topics=ranked.length?[ranked[0][0]]:[];
 if(category!=='Vocabulary')topics=[DT[category]];
 else if(!topics.length){
  const grammatical={verb:'Verbs',adjective:'Adjectives',adverb:'Adverbs'};
  if(grammatical[pos])topics=[grammatical[pos]];
  else if(candidates.length)topics=[...(candidates[0].o.topics||[])];
 }
 const ref=candidates.sort((a,b)=>b.n-a.n)[0]?.o;
 return{category,type,level:ref?.level||'B1-B2',topics,pos,metaVersion:2};
}
async function resolveWordMeta(en,uk){
 if(S.items.some(o=>!o.custom&&bare(o.en)===bare(en)))return autoWordMeta(en,uk);
 return autoWordMeta(en,uk,await wordDictionary(en));
}
function enrichAddedWord(it,pending){
 pending.then(meanings=>{
  if(!meanings.length||S.byId.get(it.id)!==it)return;
  Object.assign(it,autoWordMeta(it.en,it.uk,meanings));indexItem(it);saveKV('custom',S.custom);
  if(!S.Q?.active){render();if($('#sheet').classList.contains('open')&&+$('#sheet [data-a="speak"]')?.dataset.id===it.id)openDetail(it.id)}
 }).catch(()=>{});
}
function openAdd(){S.addTok=(S.addTok||0)+1;S.adding=false;S.askR=null;
 $('#sheet').innerHTML=`<div class="glass"><h2 style="margin-bottom:14px">Додати слово</h2><input type="text" class="fld" id="ae" aria-label="Слово англійською" placeholder="Слово англійською" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><p class="hint">Переклад, категорія, рівень і тема — автоматично.</p><div id="am" class="am" role="status"></div><div class="stack"><button class="btn pri" id="adb" data-a="adgo">Додати</button><button class="btn" data-a="closeSheet">Закрити</button></div></div>`;
 $('#sheet').classList.add('open');$('#ae').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addGo()}};setTimeout(()=>$('#ae')?.focus(),350)}
async function addGo(){
 if(S.adding)return;const tok=S.addTok,live=()=>tok===S.addTok&&$('#sheet').classList.contains('open')&&$('#ae');
 const am=$('#am'),btn=$('#adb'),input=$('#ae'),msg=(h,c='')=>{if(live()){am.className='am '+c;am.innerHTML=h}};
 S.adding=true;btn.disabled=true;input.disabled=true;
 try{
  let en=strip(input.value).replace(/\s+/g,' ').toLowerCase();
  if(!en)return msg('Введи слово англійською','bad');
  if(en.length>50||!/^[a-z][a-z0-9 '’\-\/().,…]*$/i.test(en))return msg('Введи англійське слово або вираз','bad');
  en=baseWord(en);
  const existing=S.items.find(o=>bare(o.en)===bare(en));
  if(existing){openDetail(existing.id);toast('Це слово вже є у словнику');return}
  if(!navigator.onLine)return msg('Для додавання нового слова потрібен інтернет','bad');
  msg('Підбираю переклад і параметри…');
  const dictionary=wordDictionary(en);
  const fw=await tr(en,'en','uk');if(!live())return;
  if(!fw)return msg('Не вдалося отримати переклад. Спробуй ще раз','bad');
  const cands=[...new Set(fw.list.map(x=>cleanTranslation(x).toLowerCase()).filter(x=>CYR.test(x)))];
  if(!cands.length)return msg('Переклад не знайдено. Перевір написання','bad');
  if(fw.dict===0&&!en.includes(' ')&&lev(translit(cands[0]),en)<=Math.ceil(en.length*.4))return msg('Слово не знайдено. Перевір написання','bad');
  const uk=cands[0],metadata=autoWordMeta(en,uk);
  const it={id:Math.max(100000,...S.custom.map(x=>x.id),...deletedWords.map(x=>x.item.id))+1,en,uk,...metadata,example:null,custom:true};
  if(it.type==='phrasal_verb')it.base_verb=en.split(' ')[0];
  S.custom.push(it);saveKV('custom',S.custom);indexItem(it);S.items.unshift(it);
  // New additions stay in the queue without replacing today's selected words.
  render();openDetail(it.id);toast('Слово додано ✓');enrichAddedWord(it,dictionary);
 }finally{if(tok===S.addTok){S.adding=false;const b=$('#adb');if(b)b.disabled=false;const i=$('#ae');if(i)i.disabled=false}}}
function indexItem(i){S.byId.set(i.id,i);(i.topics||[]).forEach(t=>{if(!S.topics.includes(t)){S.topics.push(t);S.topics.sort()}});i._s=[i.en,i.uk,i.category,(i.topics||[]).join(' ')].join(' ').toLowerCase()}

/* ---------- действия ---------- */
const ACT={
 tab(d){S.tab=d.k;render();$('#app').scrollTop=0;hap()},
 start(d){S.F={cat:$('#fc')?.value||'',topic:$('#ft')?.value||'',lvl:$('#fl')?.value||''};startSession(d.m,S.F);hap()},
 quit(){if(S.Q){clearTimeout(S.Q.tm);S.Q.active=false;S.Q=null}render()},
 more(){const m=dueList().length?'review':'free';S.Q=null;startSession(m,{})},
 speak(d){say(S.byId.get(+d.id))},
 fav(d,b){const p=P(+d.id)||newP(+d.id);p.fav=!p.fav;saveP(p);b.textContent=star(+d.id);hap()},
 got(){hap();nextQ()},
 next(){nextQ()},
 opt(d,b){const Q=S.Q;if(Q.locked)return;const x=Q.ex,i=+d.i,ok=i===x.ci,bs=document.querySelectorAll('.opt');bs[i].classList.add(ok?'ok':'no');if(!ok)bs[x.ci].classList.add('ok');resolve(ok,ok?2:0)},
 chk(){checkType(false)},idk(){checkType(true)},hintword(){showWordHint()},
 show(){const c=$('#cd');c.classList.add('on');hap();if(S.st.sound)say(S.Q.ex.it);$('#rt').innerHTML=`<div class="rates">${[[0,'😵 Не знаю'],[1,'😐 Важко'],[2,'🙂 Добре'],[3,'🔥 Легко']].map(([g,l])=>`<button class="btn" data-a="rate" data-g="${g}">${l}</button>`).join('')}</div>`},
 rate(d){rateCard(+d.g)},
 ml(d,b){const e=S.Q.cur;document.querySelectorAll('[data-a=ml]').forEach(x=>x.classList.remove('sel'));if(b.classList.contains('dn'))return;b.classList.add('sel');e.left=+d.id},
 mr(d,b){const Q=S.Q,e=Q.cur;if(e.left==null||b.classList.contains('dn'))return;
  if(+d.id===e.left){const l=document.querySelector(`[data-a=ml][data-id="${e.left}"]`);l.classList.remove('sel');l.classList.add('dn');b.classList.add('dn');e.left=null;e.n++;hap();
   if(e.n===4){e.ids.forEach(id=>grade({id,k:'mat'},e.bad.has(id)?0:2));updPb();Q.locked=true;Q.tm=setTimeout(nextQ,700)}}
  else{e.bad.add(e.left);b.classList.add('no');setTimeout(()=>b.classList.remove('no'),450);hap()}},
 range(d){S.range=+d.v;render()},cl(d){S.cl=d.v;render()},
 gocat(d){S.W={seg:'all',q:'',cat:d.c,topic:'',lvl:S.cl,n:60};S.tab='words';render()},
 wseg(d){S.W.seg=d.v;S.W.n=60;render()},moreW(){S.W.n+=80;fillList()},
 open(d){openDetail(+d.id)},
 closeSheet(){S.askR&&S.askR(false);S.askR=null;$('#sheet').classList.remove('open')},
 addw(){openAdd()},adgo(){addGo()},
 askyes(){const r=S.askR;S.askR=null;r&&r(true)},askno(){const r=S.askR;S.askR=null;r&&r(false)},
 undow(){undoWords()},
 delw(d){const id=+d.id,item=S.byId.get(id);if(!item?.custom)return;
  if(deletedWords.length&&Date.now()>=undoUntil)clearWordUndo();
  deletedWords.push({item,progress:S.prog.get(id),itemIndex:S.items.indexOf(item),customIndex:S.custom.findIndex(x=>x.id===id),planIndex:S.plan.ids.indexOf(id),planDay:S.plan.day});
  S.custom=S.custom.filter(x=>x.id!==id);saveKV('custom',S.custom);
  S.items=S.items.filter(x=>x.id!==id);S.byId.delete(id);S.prog.delete(id);DB.del('prog',id);S.plan.ids=S.plan.ids.filter(x=>x!==id);saveKV('plan',S.plan);
  S.topics=[];S.items.forEach(indexItem);
  ACT.closeSheet();render();showWordUndo()},
 goal(d){S.st.goal=+d.v;saveSt();ensurePlan();render()},
 lvl(d){S.st.level=d.v;saveSt();ensurePlan();render()},
 cat(d){const c=new Set(S.st.cats||CATS);c.has(d.c)?c.delete(d.c):c.add(d.c);if(!c.size)return toast('Потрібна хоча б одна категорія');S.st.cats=c.size===CATS.length?null:CATS.filter(x=>c.has(x));saveSt();ensurePlan();render()},
 theme(d){S.st.theme=d.v;saveSt();applyTheme();render()},
 tog(d){S.st[d.k]=!S.st[d.k];if(d.k==='reduce'&&S.st.reduce)S.st.anim=false;saveSt();applyTheme();render()},
 onbgo(){S.st.onboarded=true;saveSt();document.body.classList.remove('sess');render();startSession('day')},
 export(){const data=JSON.stringify({app:'nmt-vocab',v:1,at:new Date().toISOString(),prog:[...S.prog.values()],log:[...S.logs.values()],kv:{settings:S.st,streak:S.streak,plan:S.plan,custom:S.custom,hints:S.hints}}),f=new File([data],`nmt-vocab-${dstr(today())}.json`,{type:'application/json'});
  if(navigator.canShare&&navigator.canShare({files:[f]}))navigator.share({files:[f]}).catch(()=>{});else{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}},
 import(){$('#imp').click()},
 async reset(){if(!confirm('Скинути весь прогрес? Налаштування й додані слова збережуться.'))return;await DB.clear();S.prog.clear();S.logs.clear();S.streak={n:0,best:0,last:-9,fz:0};S.plan={day:-1,ids:[]};saveKV('custom',S.custom);saveKV('settings',S.st);saveKV('streak',S.streak);saveKV('hints',S.hints);toast('Прогрес скинуто');render()}};
function rateCard(g){const Q=S.Q;if(Q.locked)return;Q.locked=true;logOf(today()).secs+=Math.min(60,(Date.now()-Q.qs)/1e3);grade(Q.cur,g);hap();updPb();Q.tm=setTimeout(nextQ,260)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&ACT[b.dataset.a])ACT[b.dataset.a](b.dataset,b,e);else if(e.target.id==='sheet')ACT.closeSheet()});
document.addEventListener('pointerdown',e=>{const b=e.target.closest('.btn,.opt');if(!b)return;const r=b.getBoundingClientRect();b.style.setProperty('--x',e.clientX-r.left+'px');b.style.setProperty('--y',e.clientY-r.top+'px');b.classList.remove('rp');void b.offsetWidth;b.classList.add('rp')});
document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;if(e.target.id==='ti')checkType(false);else if(e.target.id==='ae'||e.target.id==='au')ACT.adgo()});
document.addEventListener('change',e=>{if(e.target.id==='imp')importFile(e.target.files[0]);if(['fc','ft','fl'].includes(e.target.id))S.F={cat:$('#fc').value,topic:$('#ft').value,lvl:$('#fl').value}});
/* свайп карточки: ← не знаю, → знаю */
let sw=null;
document.addEventListener('pointerdown',e=>{const c=e.target.closest('#cd');if(c&&!e.target.closest('button'))sw={c,x:e.clientX,dx:0,id:e.pointerId}});
document.addEventListener('pointermove',e=>{if(!sw)return;sw.dx=e.clientX-sw.x;if(Math.abs(sw.dx)>8){sw.c.style.transition='none';sw.c.style.transform=`translateX(${sw.dx}px) rotate(${sw.dx/22}deg)`}});
const swEnd=()=>{if(!sw)return;const{c,dx}=sw;sw=null;c.style.transition='transform .35s cubic-bezier(.3,1.4,.5,1)';
 if(Math.abs(dx)>90&&!S.Q.locked){c.style.transform=`translateX(${dx>0?500:-500}px) rotate(${dx/10}deg)`;rateCard(dx>0?2:0)}
 else{c.style.transform='';if(Math.abs(dx)<8&&!c.classList.contains('on'))ACT.show()}};
document.addEventListener('pointerup',swEnd);document.addEventListener('pointercancel',swEnd);
async function importFile(f){if(!f)return;try{const j=JSON.parse(await f.text());if(j.app!=='nmt-vocab'||!Array.isArray(j.prog))throw 0;if(!confirm('Замінити поточний прогрес імпортованим?'))return;
 await DB.clear();j.prog.forEach(p=>saveP(p));(j.log||[]).forEach(l=>saveL(l));Object.entries(j.kv||{}).forEach(([k,v])=>saveKV(k,v));setTimeout(()=>location.reload(),400)}catch(e){toast('Не вдалося прочитати файл')}}

/* ---------- запуск ---------- */
function normalizeSavedWords(){
 for(const it of [...S.custom]){
  const canonical=baseWord(it.en);if(canonical===it.en)continue;
  const target=S.items.find(o=>o.id!==it.id&&bare(o.en)===bare(canonical));
  if(target){
   const old=S.prog.get(it.id),current=S.prog.get(target.id);
   if(old){
    const progress=current?{...current,stage:Math.max(current.stage,old.stage),first:Math.min(...[current.first,old.first].filter(Boolean))||0,last:Math.max(current.last,old.last),due:Math.min(current.due,old.due),ok:current.ok+old.ok,bad:current.bad+old.bad,lapses:current.lapses+old.lapses,fav:current.fav||old.fav}:{...old,id:target.id};
    S.prog.set(target.id,progress);saveP(progress);
   }
   S.prog.delete(it.id);DB.del('prog',it.id);
   S.plan.ids=[...new Set(S.plan.ids.map(id=>id===it.id?target.id:id))];
   S.custom=S.custom.filter(o=>o.id!==it.id);S.items=S.items.filter(o=>o.id!==it.id);S.byId.delete(it.id);
  }else{
   it.en=canonical;Object.assign(it,autoWordMeta(canonical,it.uk));it.metaVersion=1;indexItem(it);
  }
 }
 S.topics=[];S.items.forEach(indexItem);saveKV('custom',S.custom);saveKV('plan',S.plan);
}
async function refreshCustomMetadata(){
 for(const it of S.custom){
  if(it.metaVersion===2)continue;
  const m=navigator.onLine?await resolveWordMeta(it.en,it.uk):autoWordMeta(it.en,it.uk);
  if(!S.byId.has(it.id))continue;
  Object.assign(it,m);if(!navigator.onLine)it.metaVersion=1;
  indexItem(it);saveKV('custom',S.custom);
 }
 S.topics=[];S.items.forEach(indexItem);
 if(!S.Q?.active){render();const id=+$('#sheet [data-a="speak"]')?.dataset.id;if($('#sheet').classList.contains('open')&&id&&S.byId.get(id)?.custom)openDetail(id)}
}
async function init(){
 try{await DB.open();navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
 const data=await(await fetch('data/vocab_nmt2026.json')).json();
 const kv={};(await DB.all('kv')).forEach(r=>kv[r.k]=r.v);
 S.custom=kv.custom||[];S.items=data.items;S.topics=[];
 S.custom.forEach(it=>{if(it.metaVersion!==2){Object.assign(it,autoWordMeta(it.en,it.uk));it.metaVersion=1}it.example=null;it.uk=cleanTranslation(it.uk)});
 saveKV('custom',S.custom);S.items=[...S.custom,...data.items];
 S.items.forEach(indexItem);
 (await DB.all('prog')).forEach(p=>S.prog.set(p.id,p));(await DB.all('log')).forEach(l=>S.logs.set(l.d,l));
 S.hints=kv.hints||{day:-1,used:0};
 S.st={...DEF,...(kv.settings||{})};S.streak=kv.streak||{n:0,best:0,last:-9,fz:0};S.plan=kv.plan||{day:-1,ids:[]};
 normalizeSavedWords();
 applyTheme();render();
 refreshCustomMetadata();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!(S.Q&&S.Q.active)&&S.st.onboarded)render()});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
 setTimeout(()=>document.querySelectorAll('.ring .p').forEach(c=>c.style.strokeDashoffset=c.dataset.to),60)}
const _r=render;render=function(){_r();setTimeout(()=>document.querySelectorAll('.ring .p').forEach(c=>c.style.strokeDashoffset=c.dataset.to),60)};
init().catch(e=>{$('#app').innerHTML='<div class="view"><h1>Помилка запуску</h1><p class="hint">Відкрий застосунок через веб-сервер (не file://). '+esc(e.message)+'</p></div>'});
