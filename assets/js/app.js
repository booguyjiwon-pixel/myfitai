(function(){
const PRODUCT_IMG={sku1:'assets/images/sku1.webp',sku2:'assets/images/sku2.webp'};
const SS_KEY='msq_state',LS_RESULTS='msq_results',LS_LAST='msq_last',LS_LEADS='msq_leads';
let Q,R,state={step:0,answers:{}},view='quiz',current=null,started=false,completed=false;
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const utm=(()=>{const p=new URLSearchParams(location.search),o={};['utm_source','utm_medium','utm_campaign'].forEach(k=>{if(p.get(k))o[k]=p.get(k)});return o})();
function track(event,props={}){window.dataLayer=window.dataLayer||[];const e={event,...utm,...props,ts:Date.now()};window.dataLayer.push(e);console.debug('[track]',e)}
const lsGet=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
function save(){try{sessionStorage.setItem(SS_KEY,JSON.stringify(state))}catch(e){}}
function restore(){try{const s=JSON.parse(sessionStorage.getItem(SS_KEY));if(s&&typeof s.step==='number')state=s}catch(e){}}

/* ---------- 추천 로직 (설정을 읽는 순수 함수) ---------- */
function sizeFor(table,v,b){let i=table.findIndex(r=>v<=r.max);if(i<0)i=table.length-1;const lowEdge=i>0?table[i-1].max:-Infinity,hiEdge=table[i].max;let boundary=null;if(i<table.length-1&&hiEdge-v<b)boundary=[table[i].size,table[i+1].size];else if(i>0&&v-lowEdge<=b)boundary=[table[i-1].size,table[i].size];return{size:table[i].size,boundary}}
function recommend(a,cfg,quizCfg){
  const order=cfg.sizeOrder,idx=s=>order.indexOf(s),b=cfg.boundaryCm;
  const w=sizeFor(cfg.sizeTable.waist,a.waist,b),h=sizeFor(cfg.sizeTable.hip,a.hip,b);
  let size=idx(w.size)>=idx(h.size)?w.size:h.size,altSize=null,confidence='high';
  const bd=[w,h].filter(x=>x.boundary&&x.boundary.includes(size));
  if(bd.length){const pair=bd[0].boundary;const upper=idx(pair[0])>idx(pair[1])?pair[0]:pair[1],lower=pair[0]===upper?pair[1]:pair[0];
    const q4=(quizCfg.steps.find(s=>s.id==='q4').options.find(o=>o.value===a.q4)||{}).size;
    size=upper;altSize=lower;confidence='low';
    if(q4&&idx(q4)<idx(lower)){}/* 평소 사이즈가 더 작아도 큰 쪽 유지 */}
  const W=cfg.weights,areas=a.q3||[];let s1=W.sku1Base,s2=0;
  if((areas.includes('belly')||areas.includes('waist'))&&a.q5==='mid')s2+=W.sku2BellyWaistMid;
  if(a.q5==='high')s2+=W.sku2WantsAdjust;
  const product=s2>s1?'sku2':'sku1',other=product==='sku1'?'sku2':'sku1';
  const alt=Math.abs(s1-s2)<=W.closeGap?other:null;
  let pressure=cfg.pressure.map[a.q5]||'low';const notes=[];
  if(a.q5==='high')notes.push(cfg.messages.highCapped);
  if(a.q2==='csection'){pressure=cfg.pressure.csectionStepDown[pressure]||pressure;notes.push(cfg.messages.csection)}
  if(confidence==='low')notes.unshift(cfg.messages.boundary);
  const areaLabels=areas.map(v=>(quizCfg.steps.find(s=>s.id==='q3').options.find(o=>o.value===v)||{}).label).filter(Boolean);
  const reasons=[`허리·골반 둘레를 각각 사이즈표에 맞춰 보고, 더 큰 쪽인 ${size}를 골랐어요.`,
    product==='sku2'?`${areaLabels.join(', ')} 부위와 압박 강도 선택을 보고 압박을 조절할 수 있는 밴드를 먼저 추천해요.`:`매일 편하게 입기 좋은 데일리 팬티를 먼저 추천해요${areaLabels.length?` (신경 쓰이는 부위: ${areaLabels.join(', ')})`:''}.`,
    `선택하신 압박 강도를 기준으로 '${cfg.pressure.labels[pressure]}'로 안내해요.`];
  return{product,size,altSize,pressure,alt,confidence,reasons,notes};
}

/* ---------- 공통 UI ---------- */
function optBtn(o,{multi,pressed,row}){return row?`<button type="button" class="opt" aria-pressed="${pressed}" data-v="${esc(o.value)}"><span class="big">${esc(o.label)}</span>${o.desc?`<span class="d">${esc(o.desc)}</span>`:''}</button>`
  :`<button type="button" class="opt${multi?' multi':''}" aria-pressed="${pressed}" data-v="${esc(o.value)}"><span>${esc(o.label)}</span><span class="mk" aria-hidden="true"></span></button>`}

function renderHero(){const q1=Q.steps[0];$('#hero-q-title').textContent=q1.title;
  $('#hero-opts').innerHTML=q1.options.slice(0,4).map(o=>optBtn(o,{pressed:false})).join('')+`<button type="button" class="link-btn" data-more style="align-self:flex-start">다른 기간 보기</button>`;
  $('#hero-opts').addEventListener('click',e=>{const b=e.target.closest('.opt,[data-more]');if(!b)return;
    if(b.dataset.v){state={step:0,answers:{q1:b.dataset.v}};save();track('cta_click',{location:'hero_card'});openQuiz(true);goStep(1)}else{track('cta_click',{location:'hero_card'});openQuiz()}});}

const FAQ=[
 ['치수는 어떻게 재나요?','줄자를 바닥과 수평이 되게 몸에 한 바퀴 둘러 재요. 허리는 배꼽 위 가장 잘록한 곳, 골반은 엉덩이에서 가장 튀어나온 곳을 기준으로 해요. 조이지 말고 줄자가 살짝 닿는 정도로 재 주세요.'],
 ['입력한 정보는 어떻게 쓰이나요?','추천 결과를 만드는 데 사용해요. 사진은 받지 않고, 치수는 연락처와 따로 보관해요. 저장 범위와 보관 기간은 개인정보 정책이 확정되면 안내해 드릴게요.'],
 ['제왕절개 후에도 사용할 수 있나요?','회복 상태에 대해서는 담당 의료진과 상의해 주세요. 퀴즈는 분만 유형에 따라 압박 강도를 조정해 안내하며 의료 조언이 아니에요.'],
 ['사이즈가 안 맞으면?','교환·환불 정책은 확정 후 안내해 드릴게요.'],
 ['언제 출시되나요?','확정되면 알려드릴게요. 출시 알림을 신청하시면 가장 먼저 소식을 받으실 수 있어요.'],
 ['체험단은 어떻게 선정하나요?','선정 기준과 발표 일정은 확정 후 안내해 드릴게요. 체험단은 후기 작성이 조건이며, 후기에는 제품 제공 사실(협찬) 표기가 필요해요.']];
function renderFaq(){$('#faq-list').innerHTML=FAQ.map(([q,a],i)=>`<div class="faq-item"><button class="faq-q" type="button" aria-expanded="false" aria-controls="faq-a${i}" id="faq-q${i}"><span>${q}</span><span class="chev" aria-hidden="true"></span></button><div class="faq-a" id="faq-a${i}" role="region" aria-labelledby="faq-q${i}"><div><p>${a}</p></div></div></div>`).join('');
  $('#faq-list').addEventListener('click',e=>{const b=e.target.closest('.faq-q');if(b)b.setAttribute('aria-expanded',b.getAttribute('aria-expanded')!=='true')})}

/* ---------- 퀴즈 ---------- */
const total=()=>Q.steps.length;
function openQuiz(keep){if(!keep&&completed){state={step:0,answers:{}};completed=false}
  view='quiz';$('#quiz').classList.add('open');document.body.style.overflow='hidden';if(!started){started=true;track('quiz_start')}render()}
function closeQuiz(){$('#quiz').classList.remove('open');document.body.style.overflow='';if(view==='quiz'&&started&&!completed){track('quiz_abandon',{step:state.step+1});started=false}
  if(location.hash.startsWith('#result='))history.replaceState(null,'',location.pathname+location.search)}
function goStep(n){state.step=Math.max(0,Math.min(total()-1,n));save();render()}
function answered(st){const v=state.answers[st.id];if(st.type==='multi')return Array.isArray(v)&&v.length>0;if(st.type==='number')return v!==undefined&&v!==''&&!isNaN(v);return!!v}
function numValid(st){const v=+state.answers[st.id];return v>=st.min&&v<=st.max}
function render(){if(view==='result')return renderResult();
  const st=Q.steps[state.step],n=state.step+1,v=state.answers[st.id];
  $('#quiz-count').innerHTML=`${n} / ${total()}${Q.beta?'<span class="beta">베타</span>':''}`;
  $('#quiz-progress').style.width=(n/total()*100)+'%';$('#quiz-back').disabled=state.step===0;$('#quiz-foot').hidden=false;
  let h=`<h2 id="quiz-title">${esc(st.title)}</h2>`;if(st.hint)h+=`<p class="hint">${esc(st.hint)}</p>`;
  if(st.type==='single'||st.type==='multi'){const multi=st.type==='multi',row=st.layout==='row';
    h+=`<div class="${row?'row-opts':'opt-list'}" role="group" aria-labelledby="quiz-title">${st.options.map(o=>optBtn(o,{multi,row,pressed:multi?(v||[]).includes(o.value):v===o.value})).join('')}</div>`;
    const sel=st.options.find(o=>o.value===v);if(sel&&sel.note)h+=`<p class="note">${esc(sel.note)}</p>`;
    if(st.id==='q5'&&v==='high')h+=`<p class="note">${esc(R.messages.highCapped)}</p>`;
    if(st.id==='q2')h+=`<p class="privacy-line">회복 상태에 대해서는 담당 의료진과 상의해 주세요.</p>`}
  else if(st.type==='number'){const bad=answered(st)&&!numValid(st);
    h+=`<div class="field"><label for="num-in" class="lbl">${st.id==='waist'?'허리 둘레':'골반(엉덩이) 둘레'} (${st.unit})</label><div class="num-wrap"><input id="num-in" class="input${bad?' invalid':''}" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(st.placeholder||'')}" value="${v??''}" aria-describedby="num-err num-help"><span class="unit">${st.unit}</span></div><p class="err-text" id="num-err" aria-live="polite">${bad?esc(Q.messages.rangeError)+` (${st.min}~${st.max}${st.unit})`:''}</p></div>
    <div class="measure-help" id="num-help"><strong>재는 방법</strong><span>${esc(st.help)}</span></div><p class="privacy-line">${esc(Q.messages.privacy)}</p>`}
  $('#quiz-body').innerHTML=h;$('#quiz-body').scrollTop=0;
  const ok=st.required?answered(st)&&(st.type!=='number'||numValid(st)):(st.type!=='number'||!answered(st)||numValid(st));
  $('#quiz-next').disabled=!ok;$('#quiz-next').textContent=n===total()?'결과 보기':(!st.required&&!answered(st)?'건너뛰기':'다음');
  $('#quiz-req').textContent=ok?'':(st.type==='number'&&answered(st)?'':Q.messages.requiredError);
  const inp=$('#num-in');if(inp){inp.addEventListener('input',()=>{const raw=inp.value.replace(/[^\d.]/g,'');if(raw!==inp.value)inp.value=raw;state.answers[st.id]=raw===''?'':+raw;save();
      const good=raw!==''&&numValid(st);$('#quiz-next').disabled=!good;inp.classList.toggle('invalid',raw!==''&&!good);$('#num-err').textContent=raw!==''&&!good?`${Q.messages.rangeError} (${st.min}~${st.max}${st.unit})`:'';$('#quiz-req').textContent=raw===''?Q.messages.requiredError:''});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('#quiz-next').disabled)next()});if(matchMedia('(min-width:768px)').matches)inp.focus()}
}
$('#quiz-body').addEventListener('click',e=>{if(view!=='quiz')return;const b=e.target.closest('.opt');if(!b)return;const st=Q.steps[state.step];
  if(st.type==='multi'){const a=new Set(state.answers[st.id]||[]);a.has(b.dataset.v)?a.delete(b.dataset.v):(a.size<(st.maxSelect||99)&&a.add(b.dataset.v));state.answers[st.id]=[...a];save();render()}
  else{state.answers[st.id]=b.dataset.v;save();render();const sel=st.options.find(o=>o.value===b.dataset.v);if(!sel.note&&!(st.id==='q5'&&b.dataset.v==='high'))setTimeout(next,220)}});
function next(){const st=Q.steps[state.step];track('quiz_step_complete',{step:state.step+1});if(state.step<total()-1)goStep(state.step+1);else finish()}
function finish(){const a=state.answers;const res=recommend({...a,waist:+a.waist,hip:+a.hip},R,Q);const id=Math.random().toString(36).slice(2,10);
  const stored={...res,id,at:Date.now(),q1:a.q1};const all=lsGet(LS_RESULTS,{});all[id]=stored;lsSet(LS_RESULTS,all);lsSet(LS_LAST,id);
  current=stored;completed=true;view='result';track('quiz_complete',{product:res.product,size:res.size,pressure:res.pressure,confidence:res.confidence});
  history.replaceState(null,'',location.pathname+location.search+'#result='+id);updateResultLink();render()}
$('#quiz-next').addEventListener('click',next);
$('#quiz-back').addEventListener('click',()=>{if(view==='result'){view='quiz';render();return}goStep(state.step-1)});
$('#quiz-close').addEventListener('click',closeQuiz);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#quiz').classList.contains('open'))closeQuiz()});

/* ---------- 결과 ---------- */
function renderResult(){const r=current,P=R.products[r.product],pl=R.pressure.labels;
  $('#quiz-count').innerHTML=`추천 결과${Q.beta?'<span class="beta">'+esc(R.messages.beta)+'</span>':''}`;$('#quiz-progress').style.width='100%';$('#quiz-back').disabled=!completed;$('#quiz-foot').hidden=true;
  const altP=r.alt&&R.products[r.alt];
  $('#quiz-body').innerHTML=`<div class="res-top"><p class="eyebrow">내 사이즈 찾기 결과</p><h2 id="quiz-title">이 제품을 추천해요</h2></div>
  <article class="card res-card"><div class="img-box"><span class="badge">콘셉트 이미지</span><img src="${PRODUCT_IMG[r.product]}" alt="${esc(P.name)} 콘셉트 이미지" loading="lazy" decoding="async"></div>
  <div class="inner"><div><span class="label-soon">출시 예정</span></div><h3>${esc(P.name)}</h3><p style="color:var(--ink-soft);font-size:15px">${esc(P.desc)}</p>
  <div class="res-meta"><div><span class="k">추천 사이즈</span><span class="v">${r.size}${r.altSize?`<small>또는 ${r.altSize}</small>`:''}</span></div><div><span class="k">추천 압박 강도</span><span class="v">${pl[r.pressure]}</span></div></div>
  <ul class="reasons">${r.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${r.notes.map(x=>`<p class="callout">${esc(x)}</p>`).join('')}</div></article>
  ${altP?`<div class="alt"><div class="thumb"><img src="${PRODUCT_IMG[r.alt]}" alt="" loading="lazy" decoding="async"></div><div><p class="t">함께 볼 만한 대안</p><p class="n">${esc(altP.name)}</p><p class="small">${esc(altP.tag)}</p></div></div>`:''}
  <div class="feedback" id="feedback"><span class="lbl">도움이 됐나요?</span><div class="seg" role="group" aria-label="도움이 됐나요?"><button type="button" data-fb="yes" aria-pressed="false">예</button><button type="button" data-fb="no" aria-pressed="false">아니오</button><button type="button" data-fb="size_unsure" aria-pressed="false">사이즈가 애매해요</button></div><p class="small" id="fb-msg" aria-live="polite"></p></div>
  <section class="card next-box" aria-label="다음 단계"><h3>결과가 마음에 드셨다면</h3><div class="tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-tab="lead">① 출시 알림 받기</button><button type="button" role="tab" aria-selected="false" data-tab="trial">② 체험단 지원하기</button></div><div id="tab-panel"></div></section>
  <p class="disclaimer">${esc(R.messages.disclaimer)}</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-outline" type="button" id="retry">다시 하기</button><button class="btn btn-outline" type="button" id="res-close">페이지로 돌아가기</button></div>`;
  $('#quiz-body').scrollTop=0;
  const panel=$('#tab-panel');const showTab=t=>{$('#quiz-body').querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));panel.innerHTML='';panel.appendChild(t==='lead'?leadForm('lead-form','result'):trialForm())};showTab('lead');
  $('#quiz-body').querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
  $('#feedback').addEventListener('click',e=>{const b=e.target.closest('[data-fb]');if(!b)return;$('#feedback').querySelectorAll('[data-fb]').forEach(x=>x.setAttribute('aria-pressed',x===b));$('#fb-msg').textContent='의견 감사해요.';track('result_feedback',{helpful:b.dataset.fb})});
  $('#retry').addEventListener('click',()=>{state={step:0,answers:{}};save();completed=false;view='quiz';started=true;track('quiz_start');history.replaceState(null,'',location.pathname+location.search);render()});
  $('#res-close').addEventListener('click',closeQuiz);
  track('result_view',{product:r.product});
}
function showStoredResult(id){const r=lsGet(LS_RESULTS,{})[id];if(!r)return false;current=r;completed=true;view='result';$('#quiz').classList.add('open');document.body.style.overflow='hidden';history.replaceState(null,'',location.pathname+location.search+'#result='+id);render();return true}
function updateResultLink(){const id=lsGet(LS_LAST,null),btn=$('#view-result-link');btn.hidden=!(id&&lsGet(LS_RESULTS,{})[id])}
$('#view-result-link').addEventListener('click',()=>showStoredResult(lsGet(LS_LAST,null)));

/* ---------- 폼 ---------- */
function validContact(type,v){v=v.trim();return type==='email'?/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v):/^01\d{8,9}$/.test(v.replace(/[-\s]/g,''))}
const normC=(t,v)=>t==='email'?v.trim().toLowerCase():v.replace(/\D/g,'');
function contactBlock(uid){return`<div class="field"><span class="lbl" id="${uid}-ct-l">연락 방법</span><div class="seg" role="group" aria-labelledby="${uid}-ct-l" data-ctype><button type="button" data-v="email" aria-pressed="true">이메일</button><button type="button" data-v="phone" aria-pressed="false">휴대폰</button></div></div>
<div class="field"><label for="${uid}-contact" data-clabel>이메일</label><input class="input" id="${uid}-contact" name="contact" type="email" autocomplete="email" placeholder="you@example.com"></div>`}
function consentBlock(uid,showLink){return`<div class="consents"><label class="chk"><input type="checkbox" name="c_collect"><span><span class="req">(필수)</span> 개인정보 수집·이용에 동의합니다.</span></label>${showLink?`<label class="chk"><input type="checkbox" name="c_link"><span><span class="optl">(선택)</span> 퀴즈 결과를 연락처와 연결해 저장하는 데 동의합니다.</span></label>`:''}<label class="chk"><input type="checkbox" name="c_marketing"><span><span class="optl">(선택)</span> 광고성 정보 수신에 동의합니다.</span></label></div>`}
function wireContact(f){let type='email';const seg=f.querySelector('[data-ctype]'),inp=f.querySelector('[name=contact]'),lab=f.querySelector('[data-clabel]');
  seg.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;type=b.dataset.v;seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));
    lab.textContent=type==='email'?'이메일':'휴대폰 번호';inp.type=type==='email'?'email':'tel';inp.inputMode=type==='email'?'email':'numeric';inp.autocomplete=type==='email'?'email':'tel';inp.placeholder=type==='email'?'you@example.com':'010-0000-0000';inp.value='';inp.classList.remove('invalid')});
  return()=>type}
function lockSubmit(f){const s=f.querySelector('[type=submit]'),req=f.querySelectorAll('input[type=checkbox][data-required],input[name=c_collect]');const upd=()=>{s.disabled=![...req].every(c=>c.checked)};req.forEach(c=>c.addEventListener('change',upd));upd()}
function leadForm(id,location){const f=document.createElement('form');f.className='form';f.id=id;f.noValidate=true;const showLink=!!current;
  f.innerHTML=`${contactBlock(id)}${consentBlock(id,showLink)}<div class="hp" aria-hidden="true"><label>웹사이트<input name="website" tabindex="-1" autocomplete="off"></label></div><button class="btn btn-block${location==='bottom'?' btn-white':''}" type="submit">출시 알림 신청</button><p class="form-msg" aria-live="polite"></p>`;
  const getType=wireContact(f);lockSubmit(f);
  f.addEventListener('submit',e=>{e.preventDefault();const msg=f.querySelector('.form-msg'),inp=f.querySelector('[name=contact]');msg.className='form-msg';msg.textContent='';
    if(f.website.value)return;const t=getType();if(!validContact(t,inp.value)){inp.classList.add('invalid');msg.classList.add('err');msg.textContent=t==='email'?'이메일 주소를 다시 확인해 주세요.':'휴대폰 번호를 다시 확인해 주세요.';inp.focus();return}
    if(!f.c_collect.checked){msg.classList.add('err');msg.textContent='필수 동의 항목에 체크해 주세요.';return}
    inp.classList.remove('invalid');const leads=lsGet(LS_LEADS,{}),key=normC(t,inp.value);
    if(leads['lead:'+key]){done(f,'이미 신청하셨어요','확정되면 알려드릴게요');return}
    leads['lead:'+key]={at:Date.now(),consent_link_quiz:!!(f.c_link&&f.c_link.checked),consent_marketing:f.c_marketing.checked,result_id:f.c_link&&f.c_link.checked&&current?current.id:null,source:utm.utm_source||'direct'};lsSet(LS_LEADS,leads);
    track('lead_submit',{linked:!!(f.c_link&&f.c_link.checked),location});done(f,'신청이 완료됐어요','확정되면 알려드릴게요')});
  return f}
function trialForm(){const f=document.createElement('form');f.className='form';f.id='trial-form';f.noValidate=true;const q1=Q.steps[0],pre=state.answers.q1||(current&&current.q1)||'';
  f.innerHTML=`<p class="callout">20명을 모집해요. 체험단은 후기 작성이 조건이며, 후기에는 제품 제공 사실(협찬) 표기가 필요해요. 선정 기준·발표 일정·지원 마감일은 확정 후 안내해 드릴게요.</p>
  <div class="field"><label for="tr-name">이름 (닉네임 가능)</label><input class="input" id="tr-name" name="name" autocomplete="nickname"></div>${contactBlock('tr')}
  <div class="field"><span class="lbl" id="tr-pp-l">출산 후 경과 기간</span><div class="seg" role="group" aria-labelledby="tr-pp-l" data-pp>${q1.options.map(o=>`<button type="button" data-v="${o.value}" aria-pressed="${o.value===pre}">${esc(o.label)}</button>`).join('')}</div></div>
  <div class="field"><span class="lbl" id="tr-rv-l">SNS·맘카페 후기 작성 의향</span><div class="seg" role="group" aria-labelledby="tr-rv-l" data-rv><button type="button" data-v="yes" aria-pressed="false">있어요</button><button type="button" data-v="no" aria-pressed="false">없어요</button></div></div>
  <p class="small">배송지는 선정된 분께만 따로 받아요.</p>${consentBlock('tr',!!current)}<div class="hp" aria-hidden="true"><label>웹사이트<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <button class="btn btn-block" type="submit">체험단 지원하기</button><p class="form-msg" aria-live="polite"></p>`;
  const getType=wireContact(f);lockSubmit(f);let pp=pre,rv='';
  f.querySelector('[data-pp]').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;pp=b.dataset.v;f.querySelectorAll('[data-pp] button').forEach(x=>x.setAttribute('aria-pressed',x===b))});
  f.querySelector('[data-rv]').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;rv=b.dataset.v;f.querySelectorAll('[data-rv] button').forEach(x=>x.setAttribute('aria-pressed',x===b))});
  f.addEventListener('submit',e=>{e.preventDefault();const msg=f.querySelector('.form-msg'),inp=f.querySelector('[name=contact]');msg.className='form-msg err';if(f.website.value)return;const t=getType();
    if(!f.name.value.trim()){msg.textContent='이름이나 닉네임을 입력해 주세요.';f.name.classList.add('invalid');f.name.focus();return}f.name.classList.remove('invalid');
    if(!validContact(t,inp.value)){inp.classList.add('invalid');msg.textContent=t==='email'?'이메일 주소를 다시 확인해 주세요.':'휴대폰 번호를 다시 확인해 주세요.';inp.focus();return}inp.classList.remove('invalid');
    if(!pp){msg.textContent='출산 후 경과 기간을 골라주세요.';return}if(!rv){msg.textContent='후기 작성 의향을 골라주세요.';return}
    if(!f.c_collect.checked){msg.textContent='필수 동의 항목에 체크해 주세요.';return}
    const leads=lsGet(LS_LEADS,{}),key='trial:'+normC(t,inp.value);if(leads[key]){done(f,'이미 지원하셨어요','선정 결과는 확정 후 안내해 드릴게요');return}
    leads[key]={at:Date.now(),post_partum_period:pp,review_willingness:rv,result_id:f.c_link&&f.c_link.checked&&current?current.id:null,consent_marketing:f.c_marketing.checked};lsSet(LS_LEADS,leads);
    track('trial_apply');done(f,'지원이 완료됐어요','선정 기준과 발표 일정은 확정 후 안내해 드릴게요')});
  return f}
function done(f,t,s){const d=document.createElement('div');d.className='done-box';d.setAttribute('role','status');d.innerHTML=`<strong>${esc(t)}</strong><span>${esc(s)}</span>`;f.replaceWith(d)}

/* ---------- 초기화 ---------- */
document.querySelectorAll('[data-policy]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();alert('정책 문서는 확정 후 연결됩니다.')}));
document.addEventListener('click',e=>{const b=e.target.closest('[data-cta]');if(!b)return;track('cta_click',{location:b.dataset.cta});openQuiz()});
new IntersectionObserver(([en])=>$('#site-header').classList.toggle('scrolled',!en.isIntersecting),{rootMargin:'-64px 0px 0px 0px'}).observe($('#hero .cta-row'));
window.addEventListener('pagehide',()=>{if(started&&!completed)track('quiz_abandon',{step:state.step+1})});
Promise.all([fetch('quiz.config.json').then(r=>r.json()),fetch('recommend.config.json').then(r=>r.json())]).then(([q,r])=>{Q=q;R=r;
  document.querySelectorAll('[data-brand]').forEach(el=>el.textContent=Q.brandName);
  restore();renderHero();renderFaq();updateResultLink();
  $('[data-lead-mount="bottom"]').appendChild(leadForm('lead-form-bottom','bottom'));
  const m=location.hash.match(/^#result=(\w+)/);if(m)showStoredResult(m[1]);
  track('page_view',{referrer:document.referrer||null});
}).catch(err=>console.error('설정 파일을 불러오지 못했어요',err));
})();
