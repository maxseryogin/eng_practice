'use strict';
/* ===== NMT Vocabulary — вся логика. Данные: data/vocab_nmt2026.json (не изменяются). ===== */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INT=[0,1,3,7,14,30,60];                       // интервалы (дни) по ступеням; ступень 7 = выучено
const today=()=>Math.floor((Date.now()-new Date().getTimezoneOffset()*6e4)/864e5);
const dstr=d=>new Date(d*864e5).toISOString().slice(0,10);
const shuf=a=>{a=a.slice();for(let i=a.length;i>1;){const j=Math.random()*i--|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const pl=(n,w)=>w[n%10===1&&n%100!==11?0:n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?1:2];
const CATS=['Vocabulary','Idioms','Collocations','Verb + preposition','Phrasal verbs','Synonyms','Antonyms','Word formation','Formal vs informal'];
const DEF={goal:8,level:'both',cats:null,sound:true,haptic:true,theme:'dark',anim:true,reduce:false,onboarded:false};
const S={items:[],byId:new Map(),prog:new Map(),logs:new Map(),st:{},streak:{},plan:{day:-1,ids:[]},tab:'home',W:{seg:'all',q:'',cat:'',topic:'',lvl:'',n:60},F:{cat:'',topic:'',lvl:''},range:7,cl:'',Q:null,topics:[]};

/* ---------- IndexedDB ---------- */
const DB={d:null,
 open(){return new Promise((ok,no)=>{const r=indexedDB.open('nmtvocab',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('prog',{keyPath:'id'});d.createObjectStore('log',{keyPath:'d'});d.createObjectStore('kv',{keyPath:'k'})};r.onsuccess=()=>{this.d=r.result;ok()};r.onerror=()=>no(r.error)})},
 all(s){return new Promise(ok=>{if(!this.d)return ok([]);const q=this.d.transaction(s).objectStore(s).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>ok([])})},
 put(s,v){try{this.d.transaction(s,'readwrite').objectStore(s).put(v)}catch(e){}},
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
const stLabel=s=>s>=7?'Выучено':s>=4?'Закрепляется':s>=1?'Изучается':'Новое';
const meta=it=>[(it.topics||[]).join(' · '),it.level].filter(Boolean).join(' · ');
const speakText=it=>strip(it.en.replace('→',', ')).replace(/\(.*?\)/g,'');
function say(it){try{const u=new SpeechSynthesisUtterance(typeof it==='string'?it:speakText(it));u.lang='en-US';u.rate=.9;const v=speechSynthesis.getVoices().find(v=>/^en[-_]US/.test(v.lang));if(v)u.voice=v;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
function hap(){if(!S.st.haptic)return;try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}try{$('#hl').click()}catch(e){}}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2400)}
function applyTheme(){const th=S.st.theme,dk=th==='dark'||(th==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.dataset.theme=dk?'dark':'light';document.documentElement.classList.toggle('calm',S.st.reduce||!S.st.anim);$('meta[name=theme-color]').content=dk?'#05070f':'#eef1fb'}

/* ---------- планирование дня ---------- */
const inScope=i=>(!S.st.cats||S.st.cats.includes(i.category))&&(S.st.level==='both'||!i.level||i.level===S.st.level);
function ensurePlan(){
 const t=today(),g=S.st.goal;if(S.plan.day!==t)S.plan={day:t,ids:[]};
 const ids=S.plan.ids,done=ids.filter(isNewDone),pend=ids.filter(i=>!isNewDone(i));
 let keep=done.concat(pend.slice(0,Math.max(0,g-done.length)));
 if(keep.length<g){const used=new Set(keep);const main=[],spec=[];
  for(const i of S.items){if(P(i.id)?.first||used.has(i.id)||!inScope(i))continue;(i.type==='word'||i.type==='phrase'?main:spec).push(i.id)}
  let m=0,s=0;for(let j=keep.length;j<g;j++){const wantSpec=j%4===3;let id;
   if(wantSpec&&s<spec.length)id=spec[s++];else if(m<main.length)id=main[m++];else if(s<spec.length)id=spec[s++];else break;keep.push(id)}}
 if(keep.length!==ids.length||keep.some((v,i)=>v!==ids[i])){S.plan.ids=keep;saveKV('plan',S.plan)}
 return S.plan.ids}
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
 if(mode!=='prac'&&mode!=='mat'){
  if(mode==='retry'){if(ok){if(!p.stage)p.stage=1;p.due=t+1}else p.due=t}
  else if(ok){p.stage=Math.min(7,p.stage+(g===3?2:(g===1&&p.stage)?0:1));p.due=p.stage>=7?1e9:t+(g===1?1:INT[p.stage])}
  else{p.lapses++;p.stage=p.stage?Math.max(1,p.stage-2):0;p.due=t}}
 if(!ok&&mode!=='mat'&&!e.r)Q.queue.splice(Math.min(3,Q.queue.length),0,{id:e.id,k:e.k,r:true});
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
 let bag=[];for(const k in W)for(let i=0;i<W[k];i++)bag.push(k);let kind=pick(bag);
 const mc=(label,prompt,ans,ds,sub)=>{if(ds.length<2)return{kind:'card',it};const opts=shuf([ans,...ds]);return{kind:'mc',it,label,prompt,sub,opts,ci:opts.indexOf(ans)}};
 switch(kind){
  case'wf':return{kind:'type',it,label:'Образуй слово',prompt:strip(it.en.split('→')[0])+' → ___',hint:[it.rule,it.uk].filter(Boolean).join(' · '),ans:variants(it)};
  case'type':return{kind:'type',it,label:'Напиши по-английски',prompt:it.uk,ans:variants(it)};
  case'mc2':return mc('Выбери английский вариант',it.uk,strip(it.en),distract(it,'en'));
  case'cloze':return mc('Заполни пропуск',cz.stem,cz.b,cz.d,it.uk);
  case'anto':return mc('Выбери антоним',strip(it.en),strip(it.antonym),distract(it,'antonym'),it.uk);
  case'formal':return mc('Выбери неформальный вариант',strip(it.en),strip(it.informal),distract(it,'informal'),'formal: '+it.uk);
  case'card':return{kind:'card',it};
  default:return mc('Выбери перевод',strip(it.en),it.uk,distract(it,'uk'))}}

/* ---------- сессия ---------- */
function startSession(mode,o={}){
 let q=[],practice=false;
 if(mode==='day'||mode==='review'){
  const rev=shuf(dueList().sort((a,b)=>a.due-b.due).slice(0,50)).map(p=>({id:p.id,k:'rev'}));
  const nw=mode==='day'?ensurePlan().filter(id=>!isNewDone(id)).map(id=>({id,k:'new'})):[];
  const step=Math.ceil((rev.length+1)/(nw.length+1));let ri=0;
  nw.forEach((n,i)=>{const u=Math.min(rev.length,(i+1)*step);while(ri<u)q.push(rev[ri++]);q.push(n)});q.push(...rev.slice(ri));
  if(!q.length)return startSession('free',o)}
 else{practice=true;let ids;
  if(mode==='hard')ids=mistakes().slice(0,20).map(p=>p.id);
  else if(mode==='fav')ids=shuf([...S.prog.values()].filter(p=>p.fav).map(p=>p.id)).slice(0,20);
  else{const pool=S.items.filter(i=>(!o.cat||i.category===o.cat)&&(!o.topic||(i.topics||[]).includes(o.topic))&&(!o.lvl||i.level===o.lvl)),seen=pool.filter(i=>P(i.id)?.first);ids=shuf(seen.length>=8?seen:pool).slice(0,20).map(i=>i.id)}
  q=ids.map(id=>({id,k:'prac'}));if(!q.length)return toast('Пока нечего тренировать')}
 const cand=q.filter(e=>(e.k==='rev'||e.k==='prac')).map(e=>e.id).filter(id=>{const it=S.byId.get(id);return!arrow(it)&&it.en.length<=28&&it.uk.length<=42});
 for(let i=7;i<q.length&&cand.length>=4;i+=8)q.splice(i,0,{k:'match',ids:shuf(cand).slice(0,4)});
 S.Q={active:true,mode,practice,queue:q,total:q.filter(e=>e.k!=='match').length,done:0,ok:0,bad:0,nw:0,rv:0,streakUp:false};
 render();shell();nextQ()}
function shell(){$('#app').innerHTML=`<div class="view in"><div class="sh"><button class="x" data-a="quit" aria-label="Закрыть">✕</button><div class="bar pb"><i></i></div><small id="pc"></small></div><div id="qb"></div></div>`;$('#app').scrollTop=0}
function updPb(){const Q=S.Q;$('.pb i').style.width=Math.min(100,Q.done/Math.max(1,Q.total)*100)+'%';$('#pc').textContent=Math.min(Q.done,Q.total)+' / '+Q.total}
function nextQ(){const Q=S.Q;clearTimeout(Q.tm);if(!Q||!Q.active)return;if(!Q.queue.length)return finish();
 Q.cur=Q.queue.shift();Q.qs=Date.now();Q.locked=false;Q.ex=null;const e=Q.cur;let h;
 if(e.k==='new')h=studyV(S.byId.get(e.id));else if(e.k==='match')h=matchV(e);else{Q.ex=buildEx(e);h=exV(Q.ex)}
 $('#qb').innerHTML=`<div class="slide">${h}</div>`;updPb();$('#app').scrollTop=0;
 if(e.k==='new'&&S.st.sound)say(S.byId.get(e.id));
 if(Q.ex&&Q.ex.kind==='type')setTimeout(()=>$('#ti')&&$('#ti').focus(),380)}
const star=id=>P(id)?.fav?'⭐':'☆';
function extras(it){const r=[],add=(k,v)=>{if(v&&(!Array.isArray(v)||v.length))r.push(`<div><span>${k}</span>${esc(Array.isArray(v)?v.join(', '):v)}</div>`)};
 add('Синонимы',it.synonyms);add('Антоним',it.antonym&&it.antonym+(it.antonym_uk?' — '+it.antonym_uk:''));add('Informal',it.informal);add('Базовый глагол',it.base_verb);
 add('Правило',it.rule);add('Группа',it.group);add('Заметка',it.note);if(it.synonym_of&&typeof it.synonym_of!=='number')add('Синоним для',it.synonym_of);
 return r.length?`<div class="ext">${r.join('')}</div>`:''}
function studyV(it){return`<div class="lab">Новое</div><div class="glass study"><div class="en">${esc(strip(it.en))}</div><div class="uk">${esc(it.uk)}</div><div class="meta">${esc(meta(it))}</div>${it.example?`<p class="ex">${esc(it.example)}</p>`:''}${extras(it)}<div class="srow"><button class="ib" data-a="speak" data-id="${it.id}" aria-label="Произнести">🔊</button><button class="ib" data-a="fav" data-id="${it.id}" aria-label="Избранное">${star(it.id)}</button></div></div><button class="btn pri big" data-a="got">Понятно</button>`}
function exV(x){const it=x.it;
 if(x.kind==='card')return`<div class="lab">Карточка</div><div class="flip" id="cd"><div class="fi"><div class="face f glass"><div class="en">${esc(strip(it.en))}</div><div class="meta">${esc(meta(it))}</div><button class="ib" data-a="speak" data-id="${it.id}">🔊</button></div><div class="face b glass"><div class="uk">${esc(it.uk)}</div>${it.example?`<p class="ex">${esc(it.example)}</p>`:''}${extras(it)}</div></div></div><div id="rt"><button class="btn" data-a="show">Показать перевод</button><p class="hint" style="text-align:center;margin-top:12px">или свайп: ← не знаю · знаю →</p></div>`;
 if(x.kind==='type')return`<div class="lab">${x.label}</div><div class="glass qcard"><h2 class="pr">${esc(x.prompt)}</h2>${x.hint?`<p class="sub">${esc(x.hint)}</p>`:''}</div><input id="ti" type="text" placeholder="Введи ответ" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"><div class="two"><button class="btn" data-a="idk">Не знаю</button><button class="btn pri" data-a="chk">Проверить</button></div><div id="fb"></div>`;
 return`<div class="lab">${x.label}</div><div class="glass qcard"><h2 class="pr">${esc(x.prompt)}</h2>${x.sub?`<p class="sub">${esc(x.sub)}</p>`:''}</div><div class="opts">${x.opts.map((o,i)=>`<button class="opt" data-a="opt" data-i="${i}"><b>${'ABCD'[i]}</b><span>${esc(o)}</span></button>`).join('')}</div><div id="fb"></div>`}
function matchV(e){const its=e.ids.map(id=>S.byId.get(id));e.bad=new Set();e.left=null;e.n=0;
 return`<div class="lab">Соедини пары</div><div class="mt"><div class="opts">${its.map(i=>`<button class="opt" data-a="ml" data-id="${i.id}"><span>${esc(strip(i.en))}</span></button>`).join('')}</div><div class="opts">${shuf(its).map(i=>`<button class="opt" data-a="mr" data-id="${i.id}"><span>${esc(i.uk)}</span></button>`).join('')}</div></div><div id="fb"></div>`}
function resolve(ok,g){const Q=S.Q;if(Q.locked)return;Q.locked=true;const e=Q.cur,it=S.byId.get(e.id);
 logOf(today()).secs+=Math.min(60,(Date.now()-Q.qs)/1e3);grade(e,g);hap();if(S.st.sound)say(it);updPb();
 $('#fb').innerHTML=`<div class="fb ${ok?'ok':'bad'}"><div class="ft">${ok?'Верно':'Запомни'}</div><div class="fa">${esc(strip(it.en))} — ${esc(it.uk)}</div>${it.example?`<div class="fe">${esc(it.example)}</div>`:''}<button class="btn pri" data-a="next">Дальше</button></div>`;
 const c=$('.qcard');if(c){c.classList.add(ok?'pop':'shake')}if(ok&&!it.example)Q.tm=setTimeout(nextQ,950);
 $('#fb').scrollIntoView({block:'nearest',behavior:'smooth'})}
function checkType(giveUp){const Q=S.Q;if(Q.locked)return;const inp=$('#ti'),ok=!giveUp&&Q.ex.ans.includes(norm(inp.value));if(!giveUp&&!inp.value.trim())return;inp.classList.add(ok?'ok':'no');inp.blur();resolve(ok,ok?2:0)}
function finish(){const Q=S.Q,t=today(),L=S.logs.get(t)||{};Q.queue=[];Q.cur=null;checkStreak();const acc=Q.ok+Q.bad?Math.round(Q.ok/(Q.ok+Q.bad)*100):0,sn=streakNow();
 $('#app').innerHTML=`<div class="view in sum"><h1>${acc>=70?'Отлично! 🎉':'Готово 👏'}</h1><p class="hint">${Q.practice?'Тренировка завершена':S.plan.ids.every(isNewDone)?'Цель дня выполнена':'Сессия завершена'}</p><div class="grid"><div class="glass tile"><b>${Q.nw}</b><span>Новых</span></div><div class="glass tile"><b>${Q.rv}</b><span>Повторил</span></div><div class="glass tile"><b>${acc}%</b><span>Точность</span></div><div class="glass tile"><b>🔥 ${sn}</b><span>${pl(sn,['день','дня','дней'])} подряд</span></div></div><div class="stack"><button class="btn pri big" data-a="quit">Продолжить завтра</button><button class="btn" data-a="more">Повторить ещё</button></div></div>`;
 if(acc>=70||Q.streakUp)confetti();hap()}

/* ---------- экраны ---------- */
const T=[['home','🏠','Главная'],['learn','📚','Учить'],['stats','📊','Статистика'],['words','🔎','Слова'],['set','⚙️','Настройки']];
function render(){const Q=S.Q;document.body.classList.toggle('sess',!!(Q&&Q.active));if(Q&&Q.active)return;
 if(!S.st.onboarded){document.body.classList.add('sess');return onb()}
 $('#tabs').innerHTML=T.map(([k,i,l])=>`<button data-a="tab" data-k="${k}" class="${S.tab===k?'on':''}"><span>${i}</span>${l}</button>`).join('');
 const f={home,learn,stats,words,set:settings}[S.tab];$('#app').innerHTML=`<div class="view in">${f()}</div>`;if(S.tab==='words')bindWords()}
function onb(){const s=S.st;$('#app').innerHTML=`<div class="view in onb"><h1>Welcome to NMT Vocabulary</h1><p>8 новых слов каждый день — без зубрёжки.</p><div class="lab">Уровень</div><div class="seg">${[['A1-A2','A1-A2'],['B1-B2','B1-B2'],['both','Оба']].map(([v,l])=>`<button class="${s.level===v?'on':''}" data-a="lvl" data-v="${v}">${l}</button>`).join('')}</div><div class="lab">Слов в день</div><div class="seg">${[5,8,10,15].map(n=>`<button class="${s.goal===n?'on':''}" data-a="goal" data-v="${n}">${n}</button>`).join('')}</div><div style="height:22px"></div><button class="btn pri big" data-a="onbgo">Начать обучение</button></div>`}
const counts=()=>{let learned=0,intro=0,ok=0,bad=0;S.prog.forEach(p=>{if(p.first)intro++;if(p.stage>=7)learned++});S.logs.forEach(l=>{ok+=l.ok;bad+=l.bad});return{learned,intro,ok,bad,acc:ok+bad?Math.round(ok/(ok+bad)*100):0}};
function home(){const t=today(),ids=ensurePlan(),done=ids.filter(isNewDone).length,left=ids.length-done,due=dueList().length,sn=streakNow(),L=S.logs.get(t)||{ok:0,bad:0,nw:0,rv:0},c=counts();
 const h=new Date().getHours(),g=h<5?'Доброй ночи':h<12?'Доброе утро':h<18?'Добрый день':'Добрый вечер',frac=ids.length?done/ids.length:1,R=57,C=2*Math.PI*R,all=left===0&&due===0;
 return`<div class="top"><div><div class="app-n">NMT Vocabulary</div><h1>${g} 👋</h1></div><span class="pill hot"><span class="fl">🔥</span><b>${sn}</b></span></div>
 <div class="glass hero"><div class="ring"><svg width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="rg"><stop offset="0" stop-color="#6ee7d8"/><stop offset="1" stop-color="#8f86ff"/></linearGradient></defs><circle class="t" cx="64" cy="64" r="${R}"/><circle class="p" cx="64" cy="64" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-to="${C*(1-frac)}"/></svg><div>${done}<small>из ${ids.length}</small></div></div>
 <div class="hs"><div class="big">${left}</div><div>${pl(left,['новое','новых','новых'])} сегодня</div><div class="big" style="font-size:28px">${due}</div><div style="margin:3px 0 0">на повторение</div></div></div>
 ${all?`<div class="glass done"><h2>Ты всё сделал на сегодня 🎉</h2><p>Можно повторить сложное или потренироваться свободно.</p></div><div class="two stack"><button class="btn" data-a="start" data-m="hard">Сложные</button><button class="btn" data-a="start" data-m="free">Свободная</button></div>`
 :`<div class="stack"><button class="btn pri big" data-a="start" data-m="day">${done>0||L.ok+L.bad>0?'Продолжить обучение':'Начать обучение'}</button>${left===0?'':due?`<button class="btn" data-a="start" data-m="review">Только повторение · ${due}</button>`:''}</div>`}
 <div class="grid"><div class="glass tile"><b>${L.nw}</b><span>Новые сегодня</span></div><div class="glass tile"><b>${due}</b><span>На повторение</span></div><div class="glass tile"><b>${c.learned}</b><span>Выучено всего</span></div><div class="glass tile"><b>${c.acc}%</b><span>Точность</span></div></div>
 <div class="glass tile" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><span>Серия: <b style="display:inline">${sn} ${pl(sn,['день','дня','дней'])}</b></span><span>❄️ заморозок: ${S.streak.fz||0}</span></div><div class="bar"><i style="width:${(sn%7)/7*100}%"></i></div><span style="font-size:12px">Каждые 7 дней серии — одна заморозка на пропущенный день</span></div>`}
const sel=(id,v,opts,ph)=>`<select id="${id}" aria-label="${ph}"><option value="">${ph}</option>${opts.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
function learn(){const due=dueList().length,left=ensurePlan().filter(id=>!isNewDone(id)).length,mk=mistakes().length,fv=[...S.prog.values()].filter(p=>p.fav).length,F=S.F;
 const row=(m,t,s,dis)=>`<button class="glass row" ${dis?'disabled style="opacity:.45"':`data-a="start" data-m="${m}"`}><div><b>${t}</b><span>${s}</span></div><em>›</em></button>`;
 return`<div class="top"><h1>Учить</h1></div>${row('day','Сегодняшний план',`${left} новых · ${due} повторений`,!left&&!due)}${row('review','Только повторение',due+' на сегодня',!due)}${row('hard','Сложные слова',mk+' в списке ошибок',!mk)}${row('fav','Избранное',fv+' слов',!fv)}
 <div class="lab">Свободная тренировка (20 заданий)</div><div class="sel" id="fsel">${sel('fc',F.cat,CATS,'Категория')}${sel('ft',F.topic,S.topics,'Тема')}${sel('fl',F.lvl,['A1-A2','B1-B2'],'Уровень')}</div><button class="btn" data-a="start" data-m="free">Начать тренировку</button>`}
function bars(a,mx){const n=a.length,w=300/n,M=mx||Math.max(1,...a.map(x=>x.v+(x.v2||0)));
 return`<svg class="ch" viewBox="0 0 300 118"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a)"/><stop offset="1" stop-color="var(--b)"/></linearGradient></defs>${a.map((x,i)=>{const h1=x.v/M*84,h2=(x.v2||0)/M*84,bx=i*w+w*.17,bw=w*.66,r=Math.min(5,bw/2);
 return`<rect x="${bx}" y="${96-h1}" width="${bw}" height="${Math.max(h1,x.v?2:1)}" rx="${r}" fill="${x.v?'url(#g1)':'var(--tint)'}"/>${h2?`<rect x="${bx}" y="${96-h1-h2-1}" width="${bw}" height="${h2}" rx="${r}" fill="var(--hot)" opacity=".85"/>`:''}${n<=7||i%5===n%5?`<text x="${bx+bw/2}" y="112">${x.l}</text>`:''}`}).join('')}</svg>`}
function line(v,lb){const M=Math.max(1,...v),n=v.length,pts=v.map((y,i)=>[i/(n-1)*300,90-y/M*78]),d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
 return`<svg class="ch" viewBox="0 0 300 112"><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a)" stop-opacity=".4"/><stop offset="1" stop-color="var(--a)" stop-opacity="0"/></linearGradient></defs><path d="${d} L300 90 L0 90Z" fill="url(#g2)"/><path d="${d}" fill="none" stroke="var(--a)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="108">${lb[0]}</text><text x="288" y="108">${lb[1]}</text></svg>`}
function stats(){const t=today(),c=counts(),L=S.logs.get(t)||{nw:0,rv:0},sn=streakNow(),secs=[...S.logs.values()].reduce((s,l)=>s+(l.secs||0),0),r=S.range,days=Array.from({length:r},(_,i)=>t-r+1+i),WD=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
 const lab=d=>r<=7?WD[new Date(d*864e5).getUTCDay()]:new Date(d*864e5).getUTCDate(),firsts=[...S.prog.values()].map(p=>p.first).filter(Boolean),
 act=days.map(d=>{const l=S.logs.get(d);return{v:l?l.rv:0,v2:l?l.nw:0,l:lab(d)}}),accs=days.map(d=>{const l=S.logs.get(d),n=l?l.ok+l.bad:0;return{v:n?Math.round(l.ok/n*100):0,l:lab(d)}}),cum=days.map(d=>firsts.filter(f=>f<=d).length),
 strk=Array.from({length:14},(_,i)=>{const d=t-13+i,l=S.logs.get(d);return l&&l.ok+l.bad>0?'on':''});
 const arr=S.items.filter(i=>!S.cl||i.level===S.cl),cats=CATS.map(k=>{const a=arr.filter(i=>i.category===k);if(!a.length)return'';const m=a.reduce((s,i)=>s+Math.min(7,P(i.id)?.stage||0)/7,0)/a.length,intro=a.filter(i=>P(i.id)?.first).length,pc=Math.round(m*100);
  return`<button class="glass cat" data-a="gocat" data-c="${esc(k)}"><div><span>${k}</span><small>${intro}/${a.length} · ${pc}%</small></div><div class="bar" style="display:block"><i style="width:${pc}%"></i></div></button>`}).join('');
 return`<div class="top"><h1>Статистика</h1></div><div class="grid"><div class="glass tile"><b>${c.intro}</b><span>Всего изучено</span></div><div class="glass tile"><b>${c.learned}</b><span>Выучено (ступень 7)</span></div><div class="glass tile"><b>${L.nw} / ${L.rv}</b><span>Новых / повторений сегодня</span></div><div class="glass tile"><b>${c.acc}%</b><span>${c.ok} верных, ${c.bad} ошибок</span></div><div class="glass tile"><b>🔥 ${sn}</b><span>Серия</span></div><div class="glass tile"><b>${S.streak.best||0}</b><span>Лучшая серия</span></div></div>
 <div class="glass tile" style="margin-bottom:14px"><b>${secs>=3600?(secs/3600).toFixed(1)+' ч':Math.round(secs/60)+' мин'}</b><span>Время обучения</span></div>
 <div class="seg"><button class="${r===7?'on':''}" data-a="range" data-v="7">7 дней</button><button class="${r===30?'on':''}" data-a="range" data-v="30">30 дней</button></div>
 <div class="glass chbox"><div class="lab">Занятия по дням · <span style="color:var(--hot)">новые</span> / повторения</div>${bars(act)}</div>
 <div class="glass chbox"><div class="lab">Изучено слов (накопительно)</div>${line(cum,[lab(days[0]),'сегодня'])}</div>
 <div class="glass chbox"><div class="lab">Точность по дням, %</div>${bars(accs,100)}</div>
 <div class="glass chbox"><div class="lab">Серия — последние 14 дней</div><div class="dots">${strk.map(c=>`<i class="${c}"></i>`).join('')}</div><div style="height:8px"></div></div>
 <div class="lab" style="margin-top:20px">Категории</div><div class="seg">${[['','Все'],['A1-A2','A1-A2'],['B1-B2','B1-B2']].map(([v,l])=>`<button class="${S.cl===v?'on':''}" data-a="cl" data-v="${v}">${l}</button>`).join('')}</div>${cats}`}
function words(){const W=S.W;return`<div class="top"><h1>Слова</h1></div><div class="seg">${[['all','Все'],['fav','⭐ Избранное'],['err','Мои ошибки']].map(([v,l])=>`<button class="${W.seg===v?'on':''}" data-a="wseg" data-v="${v}">${l}</button>`).join('')}</div><input type="search" id="wq" placeholder="Search vocabulary..." value="${esc(W.q)}"><div class="sel">${sel('wc',W.cat,CATS,'Категория')}${sel('wt',W.topic,S.topics,'Тема')}${sel('wl2',W.lvl,['A1-A2','B1-B2'],'Уровень')}</div>${W.seg==='err'?`<button class="btn pri" style="margin-bottom:14px" data-a="start" data-m="hard">Повторить сложные</button>`:''}<div id="wl"></div>`}
function wlist(){const W=S.W,q=W.q.trim().toLowerCase();let list=S.items;
 if(W.seg==='fav')list=list.filter(i=>P(i.id)?.fav);if(W.seg==='err'){const m=new Map(mistakes().map((p,i)=>[p.id,i]));list=list.filter(i=>m.has(i.id)).sort((a,b)=>m.get(a.id)-m.get(b.id))}
 list=list.filter(i=>(!W.cat||i.category===W.cat)&&(!W.topic||(i.topics||[]).includes(W.topic))&&(!W.lvl||i.level===W.lvl)&&(!q||i._s.includes(q)));
 if(!list.length)return`<p class="hint" style="text-align:center;padding:30px 0">${W.seg==='fav'?'Нажми ☆ на карточке слова, чтобы сохранить его сюда':W.seg==='err'?'Ошибок пока нет — отлично!':'Ничего не найдено'}</p>`;
 const part=list.slice(0,W.n);return part.map(i=>{const p=P(i.id),pc=p&&p.ok+p.bad?Math.round(p.ok/(p.ok+p.bad)*100):null;
  return`<button class="glass row" data-a="open" data-id="${i.id}"><div><b>${esc(strip(i.en))}</b><span>${esc(i.uk)}</span></div><em>${W.seg==='err'&&pc!==null?`<span class="mark${pc>=70?' g':''}">${pc}%</span><br>`:''}${esc([i.level,(i.topics||[])[0]].filter(Boolean).join(' · '))}${p&&p.fav?' ⭐':''}</em></button>`}).join('')+(list.length>W.n?`<button class="btn" data-a="moreW">Показать ещё (${list.length-W.n})</button>`:'')}
function fillList(){$('#wl').innerHTML=wlist()}
function bindWords(){fillList();let t;$('#wq').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{S.W.q=e.target.value;S.W.n=60;fillList()},140)};
 [['wc','cat'],['wt','topic'],['wl2','lvl']].forEach(([id,k])=>{$('#'+id).onchange=e=>{S.W[k]=e.target.value;S.W.n=60;fillList()}})}
function settings(){const s=S.st,tg=(k,l)=>`<div class="sr"><span>${l}</span><button class="sw ${s[k]?'on':''}" data-a="tog" data-k="${k}" role="switch" aria-checked="${!!s[k]}" aria-label="${l}"></button></div>`,cats=s.cats||CATS;
 return`<div class="top"><h1>Настройки</h1></div><div class="lab">Слов в день</div><div class="seg">${[5,8,10,15].map(n=>`<button class="${s.goal===n?'on':''}" data-a="goal" data-v="${n}">${n}</button>`).join('')}</div>
 <div class="lab">Уровень</div><div class="seg">${[['A1-A2','A1-A2'],['B1-B2','B1-B2'],['both','Оба']].map(([v,l])=>`<button class="${s.level===v?'on':''}" data-a="lvl" data-v="${v}">${l}</button>`).join('')}</div>
 <div class="lab">Темы и категории для новых слов</div><div class="chips">${CATS.map(c=>`<button class="chip ${cats.includes(c)?'on':''}" data-a="cat" data-c="${esc(c)}">${c}</button>`).join('')}</div>
 <div class="lab">Оформление</div><div class="seg">${[['dark','Тёмная'],['light','Светлая'],['auto','Авто']].map(([v,l])=>`<button class="${s.theme===v?'on':''}" data-a="theme" data-v="${v}">${l}</button>`).join('')}</div>
 <div class="glass set">${tg('sound','Озвучка (авто-произношение)')}${tg('haptic','Вибрация')}${tg('anim','Анимации')}${tg('reduce','Уменьшить движение')}</div>
 <div class="lab">Данные</div><div class="stack"><button class="btn" data-a="export">Экспорт прогресса (JSON)</button><button class="btn" data-a="import">Импорт прогресса</button><button class="btn" style="color:var(--no)" data-a="reset">Сбросить прогресс</button></div><input type="file" id="imp" accept="application/json,.json" hidden>
 <p class="hint" style="text-align:center">NMT Vocabulary · ${S.items.length} элементов · всё хранится только на этом устройстве</p>`}
function openDetail(id){const it=S.byId.get(id),p=P(id)||{stage:0,ok:0,bad:0,due:0,first:0},t=today();
 const nx=!p.first?'—':p.stage>=7?'выучено':p.due<=t?'сегодня':'через '+(p.due-t)+' дн.';
 $('#sheet').innerHTML=`<div class="glass"><div class="study" style="padding:6px 0 0"><div class="en">${esc(strip(it.en))}</div><div class="uk">${esc(it.uk)}</div><div class="meta">${esc([it.category,meta(it)].filter(Boolean).join(' · '))}</div>${it.example?`<p class="ex">${esc(it.example)}</p>`:''}${extras(it)}<div class="srow"><button class="ib" data-a="speak" data-id="${id}">🔊</button><button class="ib" data-a="fav" data-id="${id}">${star(id)}</button></div></div><div class="grid" style="margin:18px 0 12px"><div class="tile glass"><b style="font-size:19px">${stLabel(p.stage)}</b><span>Ступень ${p.stage}/7 · повтор: ${nx}</span></div><div class="tile glass"><b style="font-size:19px">${p.ok} ✓ / ${p.bad} ✗</b><span>${p.ok+p.bad?Math.round(p.ok/(p.ok+p.bad)*100)+'% верно':'ещё не отвечал'}</span></div></div><button class="btn" data-a="closeSheet">Закрыть</button></div>`;
 $('#sheet').classList.add('open')}
function confetti(){if(S.st.reduce||!S.st.anim)return;const c=$('#fx'),x=c.getContext('2d');c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;const cs=['#6ee7d8','#8f86ff','#ffb36b','#ff6b9a','#5be3a1'],d=devicePixelRatio,
 ps=Array.from({length:130},()=>({x:innerWidth/2*d,y:innerHeight*.35*d,vx:(Math.random()-.5)*16*d,vy:(-Math.random()*14-4)*d,s:(4+Math.random()*6)*d,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:pick(cs)}));let f=0;
 (function tick(){x.clearRect(0,0,c.width,c.height);ps.forEach(p=>{p.vy+=.35*d;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.globalAlpha=Math.max(0,1-f/150);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);x.restore()});if(++f<150)requestAnimationFrame(tick);else x.clearRect(0,0,c.width,c.height)})()}

/* ---------- действия ---------- */
const ACT={
 tab(d){S.tab=d.k;render();$('#app').scrollTop=0;hap()},
 start(d){S.F={cat:$('#fc')?.value||'',topic:$('#ft')?.value||'',lvl:$('#fl')?.value||''};startSession(d.m,S.F);hap()},
 quit(){if(S.Q){clearTimeout(S.Q.tm);S.Q.active=false;S.Q=null}render()},
 more(){const m=dueList().length?'review':'free';S.Q=null;startSession(m,{})},
 speak(d){say(S.byId.get(+d.id))},
 fav(d,b){const p=P(+d.id)||newP(+d.id);p.fav=!p.fav;saveP(p);b.textContent=star(+d.id);hap()},
 got(){const Q=S.Q,e=Q.cur,p=P(e.id)||newP(e.id),t=today();if(!p.first){p.first=t;p.last=t;p.due=t;logOf(t).nw++;saveL(logOf(t));Q.nw++}saveP(p);Q.queue.splice(Math.min(3,Q.queue.length),0,{id:e.id,k:'q0'});hap();nextQ()},
 next(){nextQ()},
 opt(d,b){const Q=S.Q;if(Q.locked)return;const x=Q.ex,i=+d.i,ok=i===x.ci,bs=document.querySelectorAll('.opt');bs[i].classList.add(ok?'ok':'no');if(!ok)bs[x.ci].classList.add('ok');resolve(ok,ok?2:0)},
 chk(){checkType(false)},idk(){checkType(true)},
 show(){const c=$('#cd');c.classList.add('on');hap();if(S.st.sound)say(S.Q.ex.it);$('#rt').innerHTML=`<div class="rates">${[[0,'😵 Не знаю'],[1,'😐 Сложно'],[2,'🙂 Хорошо'],[3,'🔥 Легко']].map(([g,l])=>`<button class="btn" data-a="rate" data-g="${g}">${l}</button>`).join('')}</div>`},
 rate(d){rateCard(+d.g)},
 ml(d,b){const e=S.Q.cur;document.querySelectorAll('[data-a=ml]').forEach(x=>x.classList.remove('sel'));if(b.classList.contains('dn'))return;b.classList.add('sel');e.left=+d.id},
 mr(d,b){const Q=S.Q,e=Q.cur;if(e.left==null||b.classList.contains('dn'))return;
  if(+d.id===e.left){const l=document.querySelector(`[data-a=ml][data-id="${e.left}"]`);l.classList.remove('sel');l.classList.add('dn');b.classList.add('dn');e.left=null;e.n++;hap();
   if(e.n===4){e.ids.forEach(id=>grade({id,k:'mat'},e.bad.has(id)?0:2));updPb();Q.locked=true;Q.tm=setTimeout(nextQ,700)}}
  else{e.bad.add(e.left);b.classList.add('no');setTimeout(()=>b.classList.remove('no'),450);hap()}},
 range(d){S.range=+d.v;render()},cl(d){S.cl=d.v;render()},
 gocat(d){S.W={seg:'all',q:'',cat:d.c,topic:'',lvl:S.cl,n:60};S.tab='words';render()},
 wseg(d){S.W.seg=d.v;S.W.n=60;render()},moreW(){S.W.n+=80;fillList()},
 open(d){openDetail(+d.id)},closeSheet(){$('#sheet').classList.remove('open')},
 goal(d){S.st.goal=+d.v;saveSt();ensurePlan();render()},
 lvl(d){S.st.level=d.v;saveSt();ensurePlan();render()},
 cat(d){const c=new Set(S.st.cats||CATS);c.has(d.c)?c.delete(d.c):c.add(d.c);if(!c.size)return toast('Нужна хотя бы одна категория');S.st.cats=c.size===CATS.length?null:CATS.filter(x=>c.has(x));saveSt();ensurePlan();render()},
 theme(d){S.st.theme=d.v;saveSt();applyTheme();render()},
 tog(d){S.st[d.k]=!S.st[d.k];if(d.k==='reduce'&&S.st.reduce)S.st.anim=false;saveSt();applyTheme();render()},
 onbgo(){S.st.onboarded=true;saveSt();document.body.classList.remove('sess');render();startSession('day')},
 export(){const data=JSON.stringify({app:'nmt-vocab',v:1,at:new Date().toISOString(),prog:[...S.prog.values()],log:[...S.logs.values()],kv:{settings:S.st,streak:S.streak,plan:S.plan}}),f=new File([data],`nmt-vocab-${dstr(today())}.json`,{type:'application/json'});
  if(navigator.canShare&&navigator.canShare({files:[f]}))navigator.share({files:[f]}).catch(()=>{});else{const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}},
 import(){$('#imp').click()},
 async reset(){if(!confirm('Сбросить весь прогресс? Настройки сохранятся.'))return;await DB.clear();S.prog.clear();S.logs.clear();S.streak={n:0,best:0,last:-9,fz:0};S.plan={day:-1,ids:[]};saveKV('settings',S.st);saveKV('streak',S.streak);toast('Прогресс сброшен');render()}};
function rateCard(g){const Q=S.Q;if(Q.locked)return;Q.locked=true;logOf(today()).secs+=Math.min(60,(Date.now()-Q.qs)/1e3);grade(Q.cur,g);hap();updPb();Q.tm=setTimeout(nextQ,260)}
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&ACT[b.dataset.a])ACT[b.dataset.a](b.dataset,b,e);else if(e.target.id==='sheet')ACT.closeSheet()});
document.addEventListener('pointerdown',e=>{const b=e.target.closest('.btn,.opt');if(!b)return;const r=b.getBoundingClientRect();b.style.setProperty('--x',e.clientX-r.left+'px');b.style.setProperty('--y',e.clientY-r.top+'px');b.classList.remove('rp');void b.offsetWidth;b.classList.add('rp')});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='ti')checkType(false)});
document.addEventListener('change',e=>{if(e.target.id==='imp')importFile(e.target.files[0]);if(['fc','ft','fl'].includes(e.target.id))S.F={cat:$('#fc').value,topic:$('#ft').value,lvl:$('#fl').value}});
/* свайп карточки: ← не знаю, → знаю */
let sw=null;
document.addEventListener('pointerdown',e=>{const c=e.target.closest('#cd');if(c&&!e.target.closest('button'))sw={c,x:e.clientX,dx:0,id:e.pointerId}});
document.addEventListener('pointermove',e=>{if(!sw)return;sw.dx=e.clientX-sw.x;if(Math.abs(sw.dx)>8){sw.c.style.transition='none';sw.c.style.transform=`translateX(${sw.dx}px) rotate(${sw.dx/22}deg)`}});
const swEnd=()=>{if(!sw)return;const{c,dx}=sw;sw=null;c.style.transition='transform .35s cubic-bezier(.3,1.4,.5,1)';
 if(Math.abs(dx)>90&&!S.Q.locked){c.style.transform=`translateX(${dx>0?500:-500}px) rotate(${dx/10}deg)`;rateCard(dx>0?2:0)}
 else{c.style.transform='';if(Math.abs(dx)<8&&!c.classList.contains('on'))ACT.show()}};
document.addEventListener('pointerup',swEnd);document.addEventListener('pointercancel',swEnd);
async function importFile(f){if(!f)return;try{const j=JSON.parse(await f.text());if(j.app!=='nmt-vocab'||!Array.isArray(j.prog))throw 0;if(!confirm('Заменить текущий прогресс импортированным?'))return;
 await DB.clear();j.prog.forEach(p=>saveP(p));(j.log||[]).forEach(l=>saveL(l));Object.entries(j.kv||{}).forEach(([k,v])=>saveKV(k,v));setTimeout(()=>location.reload(),400)}catch(e){toast('Не удалось прочитать файл')}}

/* ---------- запуск ---------- */
async function init(){
 try{await DB.open();navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
 const data=await(await fetch('data/vocab_nmt2026.json')).json();S.items=data.items;
 const tp=new Set();S.items.forEach(i=>{S.byId.set(i.id,i);(i.topics||[]).forEach(t=>tp.add(t));i._s=[i.en,i.uk,i.category,(i.topics||[]).join(' ')].join(' ').toLowerCase()});S.topics=[...tp].sort();
 (await DB.all('prog')).forEach(p=>S.prog.set(p.id,p));(await DB.all('log')).forEach(l=>S.logs.set(l.d,l));
 const kv={};(await DB.all('kv')).forEach(r=>kv[r.k]=r.v);
 S.st={...DEF,...(kv.settings||{})};S.streak=kv.streak||{n:0,best:0,last:-9,fz:0};S.plan=kv.plan||{day:-1,ids:[]};
 applyTheme();render();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!(S.Q&&S.Q.active)&&S.st.onboarded)render()});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
 setTimeout(()=>document.querySelectorAll('.ring .p').forEach(c=>c.style.strokeDashoffset=c.dataset.to),60)}
const _r=render;render=function(){_r();setTimeout(()=>document.querySelectorAll('.ring .p').forEach(c=>c.style.strokeDashoffset=c.dataset.to),60)};
init().catch(e=>{$('#app').innerHTML='<div class="view"><h1>Ошибка запуска</h1><p class="hint">Открой приложение через веб-сервер (не file://). '+esc(e.message)+'</p></div>'});
