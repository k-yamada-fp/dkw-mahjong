const CONFIG={SUPABASE_URL:'https://sgimotrjhedwihrduwet.supabase.co',SUPABASE_KEY:'sb_publishable_ZccyvUUPt1_7IMnTdO2iCQ_1XyRoh8L',TOURNAMENT_ID:'dkw-2026-10-24',POLL_MS:10000};
const sb=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY);
const SEATS=['E','S','W','N'],SEAT_LABEL={E:'東',S:'南',W:'西',N:'北'},UNI_ORDER=['W','K','D'],UNI_NAME={W:'早稲田',K:'慶応',D:'同志社'};
const state={participants:[],matchups:[],scores:[],activeRound:1,individualRound:null,individualMode:'ranking',selectedPlayerCode:null,loading:false};
const $=id=>document.getElementById(id);
const escapeHtml=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const round1=v=>Math.round((Number(v)+Number.EPSILON)*10)/10;
function formatScore(v){if(v===null||v===undefined||v==='')return'—';const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${n.toFixed(1)}`:'—'}
function scoreClass(v){const n=Number(v);return !Number.isFinite(n)||n===0?'':n>0?'positive':'negative'}
function pMap(){return new Map(state.participants.map(p=>[p.player_code,p]))}
function displayName(p){return p?.display_name?.trim()||p?.placeholder_name||'未登録'}
function scoreKey(r,t){return`${r}-${t}`}
function sMap(){return new Map(state.scores.map(s=>[scoreKey(s.round_no,s.table_no),s]))}
function matchupFor(r,t){return state.matchups.filter(m=>+m.round_no===+r&&+m.table_no===+t).sort((a,b)=>SEATS.indexOf(a.seat)-SEATS.indexOf(b.seat))}
function matchupByPlayer(r,c){return state.matchups.find(m=>+m.round_no===+r&&m.player_code===c)}
function scoreForPlayerRound(c,r){const m=matchupByPlayer(r,c);if(!m)return null;const s=state.scores.find(x=>+x.round_no===+r&&+x.table_no===+m.table_no);if(!s)return null;const col={E:'east_score',S:'south_score',W:'west_score',N:'north_score'}[m.seat];return s[col]===null||s[col]===undefined?null:Number(s[col])}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),2600)}
function showView(name){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));$(`view-${name}`)?.classList.add('active');document.querySelector(`.nav-btn[data-view="${name}"]`)?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}
async function fetchAll(){if(state.loading)return;state.loading=true;$('syncStatus').textContent='更新中...';try{const[p,m,s]=await Promise.all([sb.from('participants').select('*').eq('tournament_id',CONFIG.TOURNAMENT_ID).order('university_code').order('slot_no'),sb.from('matchups').select('*').eq('tournament_id',CONFIG.TOURNAMENT_ID).order('round_no').order('table_no'),sb.from('table_scores').select('*').eq('tournament_id',CONFIG.TOURNAMENT_ID).order('round_no').order('table_no')]);const e=p.error||m.error||s.error;if(e)throw e;state.participants=p.data||[];state.matchups=m.data||[];state.scores=s.data||[];renderAll();const dates=state.scores.map(x=>new Date(x.updated_at)).filter(d=>!isNaN(d));$('syncStatus').textContent=dates.length?`最新得点 ${new Date(Math.max(...dates.map(d=>d.getTime()))).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'得点未入力'}catch(e){console.error(e);$('syncStatus').textContent='通信エラー';toast('読み込みに失敗しました')}finally{state.loading=false}}
function renderAll(){renderTabs();renderMatchups();renderIndividualRoundTabs();renderIndividual();renderPersonSelector();renderPersonHistory();renderIndividualMode();renderUniversities()}
function renderTabs(){const hasR5=state.matchups.some(m=>+m.round_no===5);$('matchupRoundTabs').innerHTML=[1,2,3,4,5].map(r=>`<button class="round-tab ${state.activeRound===r?'active':''}" data-r="${r}">第${r}回戦${r===5&&!hasR5?'（未作成）':''}</button>`).join('');document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{state.activeRound=+b.dataset.r;renderTabs();renderMatchups()})}
function renderMatchups(){const host=$('matchupsContent'),rows=state.matchups.filter(m=>+m.round_no===state.activeRound);if(!rows.length){host.innerHTML=`<div class="empty-state">第${state.activeRound}回戦の組み合わせはまだ作成されていません。</div>`;return}const pm=pMap(),sm=sMap();let h='<div class="matchup-grid">';for(let t=1;t<=6;t++){const seats=matchupFor(state.activeRound,t),sc=sm.get(scoreKey(state.activeRound,t));h+=`<article class="table-card"><div class="table-card-head"><h3>${t}卓</h3><span class="table-score-state">${sc?'得点入力済み':'未入力'}</span></div>`+seats.map(m=>{const p=pm.get(m.player_code),col={E:'east_score',S:'south_score',W:'west_score',N:'north_score'}[m.seat],v=sc?Number(sc[col]):null;return`<div class="seat-row"><span class="seat-mark">${SEAT_LABEL[m.seat]}</span><div class="player-name">${escapeHtml(displayName(p))}<span class="player-sub"><span class="university-badge ${p?.university_code||''}">${escapeHtml(p?.university_name||'')}</span> ${escapeHtml(p?.placeholder_name||'')}</span></div><span class="score-value ${scoreClass(v)}">${formatScore(v)}</span></div>`}).join('')+'</article>'}host.innerHTML=h+'</div>'}
function individualRoundStatus(roundNo){
  const rows=state.scores.filter(s=>+s.round_no===+roundNo);
  const entered=rows.length;
  const totalsOk=rows.filter(s=>Math.abs(Number(s.score_total))<0.05).length;
  if(entered===0)return{entered:0,status:'not-started',label:'未開始',clickable:false};
  if(entered===6&&totalsOk===6)return{entered:6,status:'confirmed',label:roundNo===5?'最終確定':'確定',clickable:true};
  return{entered,status:'provisional',label:'暫定',clickable:true};
}
function latestAvailableIndividualRound(){
  for(let r=5;r>=1;r--){
    if(individualRoundStatus(r).entered>0)return r;
  }
  return null;
}
function ensureIndividualRound(){
  const latest=latestAvailableIndividualRound();
  if(state.individualRound===null){
    state.individualRound=latest;
    return;
  }
  if(individualRoundStatus(state.individualRound).entered===0){
    state.individualRound=latest;
  }
}
function renderIndividualRoundTabs(){
  ensureIndividualRound();
  const host=$('individualRoundTabs');
  host.innerHTML=[1,2,3,4,5].map(r=>{
    const st=individualRoundStatus(r);
    return `<button class="round-tab individual-rank-tab ${state.individualRound===r?'active':''}" data-individual-round="${r}" ${st.clickable?'':'disabled'}>
      第${r}回戦終了・${st.label}
    </button>`;
  }).join('');
  host.querySelectorAll('[data-individual-round]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const r=+btn.dataset.individualRound;
      if(!individualRoundStatus(r).clickable)return;
      state.individualRound=r;
      renderIndividualRoundTabs();
      renderIndividual();
    });
  });
}
function playerResultsThrough(cutoffRound){
  return state.participants.map(p=>{
    const scores={};
    let total=0,rounds=0;
    for(let r=1;r<=cutoffRound;r++){
      const v=scoreForPlayerRound(p.player_code,r);
      scores[r]=v;
      if(v!==null){total=round1(total+v);rounds++}
    }
    return{p,scores,total:round1(total),rounds};
  }).sort((a,b)=>
    b.total-a.total||
    a.p.university_code.localeCompare(b.p.university_code)||
    a.p.slot_no-b.p.slot_no
  );
}
function ranks(rows,field='total'){
  let prev=null,rank=0;
  return rows.map((x,i)=>{
    const v=+x[field];
    const r=prev!==null&&Math.abs(v-prev)<.0001?rank:i+1;
    prev=v;rank=r;
    return{...x,rank:r};
  });
}
function renderIndividual(){
  const table=$('individualTable');
  const notice=$('individualRoundNotice');
  ensureIndividualRound();

  if(state.individualRound===null){
    notice.textContent='まだ得点が入力されていません。得点が1卓以上入ると、その回戦終了時点の暫定順位を確認できます。';
    table.innerHTML='<tbody><tr><td style="text-align:center;padding:32px;color:#667789;">順位データはまだありません。</td></tr></tbody>';
    return;
  }

  const cutoff=state.individualRound;
  const st=individualRoundStatus(cutoff);
  if(st.status==='confirmed'){
    notice.textContent=cutoff===5
      ? '第5回戦が全6卓入力済みです。最終順位です。'
      : `第${cutoff}回戦は全6卓入力済みです。第${cutoff}回戦終了時点の確定順位です。`;
  }else{
    notice.textContent=`第${cutoff}回戦は進行中です。現在${st.entered}/6卓入力済みの暫定順位です。`;
  }

  const rows=ranks(playerResultsThrough(cutoff));
  const roundHeaders=Array.from({length:cutoff},(_,i)=>i+1);

  table.innerHTML=`<thead><tr><th>順位</th><th>名前</th><th>大学</th>${roundHeaders.map(r=>`<th>${r}回戦</th>`).join('')}<th>累計</th></tr></thead><tbody>`+
    rows.map(x=>`<tr>
      <td class="rank-cell">${x.rank}</td>
      <td><strong>${escapeHtml(displayName(x.p))}</strong><br><span class="player-sub">${escapeHtml(x.p.placeholder_name)}</span></td>
      <td><span class="university-badge ${x.p.university_code}">${escapeHtml(x.p.university_name)}</span></td>
      ${roundHeaders.map(r=>`<td class="score-value ${scoreClass(x.scores[r])}">${formatScore(x.scores[r])}</td>`).join('')}
      <td class="total-cell score-value ${scoreClass(x.total)}">${formatScore(x.total)}</td>
    </tr>`).join('')+'</tbody>';
}
function renderIndividualMode(){
  const ranking=$('individualRankingMode'),person=$('individualPersonMode');
  if(!ranking||!person)return;
  const isRanking=state.individualMode==='ranking';
  ranking.classList.toggle('hidden',!isRanking);
  person.classList.toggle('hidden',isRanking);
  document.querySelectorAll('[data-individual-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.individualMode===state.individualMode));
}
function currentPersonSelection(){
  if(!state.selectedPlayerCode)return null;
  return state.participants.find(p=>p.player_code===state.selectedPlayerCode)||null;
}
function renderPersonSelector(){
  const host=$('personSelector'); if(!host)return;
  const selected=currentPersonSelection();
  const order=['D','K','W'],names={D:'同志社',K:'慶応',W:'早稲田'};
  host.innerHTML=order.map(code=>{const members=state.participants.filter(p=>p.university_code===code).sort((a,b)=>a.slot_no-b.slot_no);return `<section class="person-university-group"><h3><span class="university-badge ${code}">${names[code]}</span></h3><div class="person-name-buttons">${members.map(p=>`<button class="person-name-btn ${selected?.player_code===p.player_code?'active':''}" data-person-code="${p.player_code}">${escapeHtml(displayName(p))}</button>`).join('')}</div></section>`}).join('');
  host.querySelectorAll('[data-person-code]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedPlayerCode=btn.dataset.personCode;renderPersonSelector();renderPersonHistory();}));
}
function rankForPlayerAtRound(playerCode,roundNo){const row=ranks(playerResultsThrough(roundNo)).find(x=>x.p.player_code===playerCode);return row?.rank??null;}
function cumulativeForPlayerAtRound(playerCode,roundNo){let total=0;for(let r=1;r<=roundNo;r++){const v=scoreForPlayerRound(playerCode,r);if(v!==null)total=round1(total+v);}return round1(total);}
function renderPersonHistory(){
  const table=$('personHistoryTable'),summary=$('personSummary'); if(!table||!summary)return;
  const p=currentPersonSelection();
  if(!p){summary.innerHTML='<div class="empty-state">上の名前ボタンを押すと、その人の成績推移を表示します。</div>';table.innerHTML='';return;}
  const rows=[1,2,3,4,5].map(r=>{const st=individualRoundStatus(r),score=scoreForPlayerRound(p.player_code,r),cumulative=cumulativeForPlayerAtRound(p.player_code,r),rank=st.entered>0?rankForPlayerAtRound(p.player_code,r):null;return{round:r,status:st,score,cumulative,rank};});
  const latest=latestAvailableIndividualRound(),latestTotal=latest?cumulativeForPlayerAtRound(p.player_code,latest):0,latestRank=latest?rankForPlayerAtRound(p.player_code,latest):null;
  summary.innerHTML=`<div class="person-summary-card"><div><span class="university-badge ${p.university_code}">${escapeHtml(p.university_name)}</span><h2>${escapeHtml(displayName(p))}</h2><div class="player-sub">${escapeHtml(p.placeholder_name)}</div></div><div class="person-summary-stats"><div><span>現在累計</span><strong class="${scoreClass(latestTotal)}">${latest?formatScore(latestTotal):'—'}</strong></div><div><span>現在順位</span><strong>${latestRank?`${latestRank}位`:'—'}</strong></div></div></div>`;
  table.innerHTML=`<thead><tr><th>回戦終了時</th><th>状態</th><th>その回の得点</th><th>累計得点</th><th>その時点の順位</th></tr></thead><tbody>`+rows.map(row=>{const ns=row.status.status==='not-started',statusText=ns?'未開始':row.status.status==='confirmed'?(row.round===5?'最終確定':'確定'):`暫定 ${row.status.entered}/6卓`;return `<tr class="${ns?'person-row-not-started':''}"><td><strong>第${row.round}回戦終了</strong></td><td>${statusText}</td><td class="score-value ${scoreClass(row.score)}">${ns?'—':formatScore(row.score)}</td><td class="score-value ${scoreClass(row.cumulative)}">${ns?'—':formatScore(row.cumulative)}</td><td class="rank-cell">${ns?'—':`${row.rank}位`}</td></tr>`}).join('')+'</tbody>';
}
function universityResults(){const pr=playerResultsThrough(5);return UNI_ORDER.map(code=>{const mem=pr.filter(x=>x.p.university_code===code),rt={};for(let r=1;r<=5;r++)rt[r]=round1(mem.reduce((a,x)=>a+(x.scores[r]??0),0));return{code,name:UNI_NAME[code],roundTotals:rt,total:round1(mem.reduce((a,x)=>a+x.total,0))}}).sort((a,b)=>b.total-a.total||UNI_ORDER.indexOf(a.code)-UNI_ORDER.indexOf(b.code))}
function renderUniversities(){const rows=ranks(universityResults());$('universityCards').innerHTML=rows.map(x=>`<div class="university-card ${x.code}"><div class="rank">${x.rank}位</div><div class="name">${x.name}</div><div class="total">${formatScore(x.total)}</div></div>`).join('');$('universityTable').innerHTML=`<thead><tr><th>順位</th><th>大学</th><th>参加者</th>${[1,2,3,4,5].map(r=>`<th>${r}回戦</th>`).join('')}<th>合計</th></tr></thead><tbody>`+rows.map(x=>`<tr><td class="rank-cell">${x.rank}</td><td><span class="university-badge ${x.code}">${x.name}</span></td><td>8名</td>${[1,2,3,4,5].map(r=>`<td class="score-value ${scoreClass(x.roundTotals[r])}">${formatScore(x.roundTotals[r])}</td>`).join('')}<td class="total-cell score-value ${scoreClass(x.total)}">${formatScore(x.total)}</td></tr>`).join('')+'</tbody>'}
document.querySelectorAll('[data-individual-mode]').forEach(btn=>{btn.addEventListener('click',()=>{state.individualMode=btn.dataset.individualMode;if(state.individualMode==='person')state.selectedPlayerCode=null;renderIndividualMode();if(state.individualMode==='person'){renderPersonSelector();renderPersonHistory();}});});
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('homeButton').onclick=()=>showView('matchups');$('refreshPublicButton').onclick=fetchAll;fetchAll();setInterval(()=>{if(document.visibilityState==='visible')fetchAll()},CONFIG.POLL_MS);
