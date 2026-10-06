const CONFIG = {
  SUPABASE_URL: 'https://sgimotrjhedwihrduwet.supabase.co',
  SUPABASE_KEY: 'sb_publishable_ZccyvUUPt1_7IMnTdO2iCQ_1XyRoh8L',
  TOURNAMENT_ID: 'dkw-2026-10-24',
  ADMIN_EMAIL: 'kohei.yamada@gmail.com',
  POLL_MS: 10000,
};

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const SEATS = ['E', 'S', 'W', 'N'];
const SEAT_LABEL = { E: '東', S: '南', W: '西', N: '北' };
const UNI_ORDER = ['W', 'K', 'D'];
const UNI_NAME = { W: '早稲田', K: '慶応', D: '同志社' };

const state = {
  tournament: null,
  participants: [],
  matchups: [],
  scores: [],
  activeRound: 1,
  adminRound: 1,
  adminUser: null,
  r5Preview: null,
  r5TieInfo: [],
  modalRound: null,
  modalTable: null,
  loading: false,
  loadPromise: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

function scoreClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'positive' : 'negative';
}

function round1(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function scoreKey(roundNo, tableNo) {
  return `${roundNo}-${tableNo}`;
}

function participantMap() {
  return new Map(state.participants.map(p => [p.player_code, p]));
}

function scoreMap() {
  return new Map(state.scores.map(s => [scoreKey(s.round_no, s.table_no), s]));
}

function displayName(p) {
  if (!p) return '未登録';
  return p.display_name?.trim() || p.placeholder_name;
}

function matchupFor(roundNo, tableNo) {
  return state.matchups
    .filter(m => Number(m.round_no) === Number(roundNo) && Number(m.table_no) === Number(tableNo))
    .sort((a, b) => SEATS.indexOf(a.seat) - SEATS.indexOf(b.seat));
}

function matchupByPlayer(roundNo, playerCode) {
  return state.matchups.find(m =>
    Number(m.round_no) === Number(roundNo) && m.player_code === playerCode
  );
}

function scoreForPlayerRound(playerCode, roundNo) {
  const m = matchupByPlayer(roundNo, playerCode);
  if (!m) return null;
  const s = state.scores.find(row =>
    Number(row.round_no) === Number(roundNo) && Number(row.table_no) === Number(m.table_no)
  );
  if (!s) return null;
  const col = { E: 'east_score', S: 'south_score', W: 'west_score', N: 'north_score' }[m.seat];
  return s[col] === null || s[col] === undefined ? null : Number(s[col]);
}

function latestUpdate() {
  const dates = state.scores.map(s => new Date(s.updated_at)).filter(d => !Number.isNaN(d.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

function setSyncStatus(message) {
  $('syncStatus').textContent = message;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = $(`view-${name}`);
  if (view) view.classList.add('active');
  const nav = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (nav) nav.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showAdminView(name) {
  document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  $(`admin-${name}`).classList.add('active');
  document.querySelector(`.admin-tab[data-admin-view="${name}"]`).classList.add('active');
}

async function fetchAllData() {
  // 既に通信中なら、その通信が終わるまで必ず待つ。
  // 第5回戦作成時に「通信中だから古いstateを使う」事故を防ぐ。
  if (state.loadPromise) return state.loadPromise;

  state.loading = true;
  setSyncStatus('更新中...');
  state.loadPromise = (async () => {
    try {
      const [t, p, m, s] = await Promise.all([
        sb.from('tournaments').select('*').eq('id', CONFIG.TOURNAMENT_ID).single(),
        sb.from('participants').select('*').eq('tournament_id', CONFIG.TOURNAMENT_ID).order('university_code').order('slot_no'),
        sb.from('matchups').select('*').eq('tournament_id', CONFIG.TOURNAMENT_ID).order('round_no').order('table_no'),
        sb.from('table_scores').select('*').eq('tournament_id', CONFIG.TOURNAMENT_ID).order('round_no').order('table_no'),
      ]);
      const error = t.error || p.error || m.error || s.error;
      if (error) throw error;

      state.tournament = t.data;
      state.participants = p.data || [];
      state.matchups = m.data || [];
      state.scores = s.data || [];

      renderAll();
      const last = latestUpdate();
      setSyncStatus(last
        ? `最新得点 ${last.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
        : '得点未入力');
    } catch (err) {
      console.error(err);
      setSyncStatus('通信エラー');
      toast(`読み込みに失敗しました: ${err.message || err}`);
      throw err;
    } finally {
      state.loading = false;
    }
  })();

  try {
    return await state.loadPromise;
  } finally {
    state.loadPromise = null;
  }
}

function renderAll() {
  renderRoundTabs();
  renderMatchups();
  renderIndividual();
  renderUniversities();
  renderAdminRoundStatus();
  renderAdminScoreTables();
  renderParticipantEditor();
  renderRound5ExistingState();
}

function renderRoundTabs() {
  const publicTabs = $('matchupRoundTabs');
  const adminTabs = $('adminRoundTabs');
  const hasR5 = state.matchups.some(m => Number(m.round_no) === 5);

  publicTabs.innerHTML = [1,2,3,4,5].map(r => `
    <button class="round-tab ${state.activeRound === r ? 'active' : ''}" data-public-round="${r}">
      第${r}回戦${r === 5 && !hasR5 ? '（未作成）' : ''}
    </button>`).join('');

  adminTabs.innerHTML = [1,2,3,4,5].map(r => `
    <button class="round-tab ${state.adminRound === r ? 'active' : ''}" data-admin-round="${r}" ${r === 5 && !hasR5 ? 'disabled' : ''}>
      第${r}回戦
    </button>`).join('');

  publicTabs.querySelectorAll('[data-public-round]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeRound = Number(btn.dataset.publicRound);
      renderRoundTabs();
      renderMatchups();
    });
  });

  adminTabs.querySelectorAll('[data-admin-round]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.adminRound = Number(btn.dataset.adminRound);
      renderRoundTabs();
      renderAdminScoreTables();
    });
  });
}

function renderMatchups() {
  const host = $('matchupsContent');
  const rows = state.matchups.filter(m => Number(m.round_no) === state.activeRound);
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state">第${state.activeRound}回戦の組み合わせはまだ作成されていません。</div>`;
    return;
  }

  const pMap = participantMap();
  const sMap = scoreMap();
  let html = '<div class="matchup-grid">';
  for (let tableNo = 1; tableNo <= 6; tableNo++) {
    const seats = matchupFor(state.activeRound, tableNo);
    const score = sMap.get(scoreKey(state.activeRound, tableNo));
    html += `
      <article class="table-card">
        <div class="table-card-head">
          <h3>${tableNo}卓</h3>
          <span class="table-score-state">${score ? '得点入力済み' : '未入力'}</span>
        </div>
        ${seats.map(m => {
          const p = pMap.get(m.player_code);
          const col = { E:'east_score', S:'south_score', W:'west_score', N:'north_score' }[m.seat];
          const val = score ? Number(score[col]) : null;
          return `
            <div class="seat-row">
              <span class="seat-mark">${SEAT_LABEL[m.seat]}</span>
              <div class="player-name">
                ${escapeHtml(displayName(p))}
                <span class="player-sub"><span class="university-badge ${p?.university_code || ''}">${escapeHtml(p?.university_name || '')}</span> ${escapeHtml(p?.placeholder_name || '')}</span>
              </div>
              <span class="score-value ${scoreClass(val)}">${formatScore(val)}</span>
            </div>`;
        }).join('')}
      </article>`;
  }
  html += '</div>';
  host.innerHTML = html;
}

function buildPlayerResults() {
  return state.participants.map(p => {
    const scores = {};
    let total = 0;
    let rounds = 0;
    for (let r = 1; r <= 5; r++) {
      const v = scoreForPlayerRound(p.player_code, r);
      scores[r] = v;
      if (v !== null) {
        total = round1(total + v);
        rounds++;
      }
    }
    return { p, scores, total: round1(total), rounds };
  }).sort((a, b) =>
    b.total - a.total ||
    a.p.university_code.localeCompare(b.p.university_code) ||
    a.p.slot_no - b.p.slot_no
  );
}

function addCompetitionRanks(rows, scoreField = 'total') {
  let prior = null;
  let priorRank = 0;
  return rows.map((row, i) => {
    const val = Number(row[scoreField]);
    const rank = prior !== null && Math.abs(val - prior) < 0.0001 ? priorRank : i + 1;
    prior = val;
    priorRank = rank;
    return { ...row, rank };
  });
}

function renderIndividual() {
  const table = $('individualTable');
  const rows = addCompetitionRanks(buildPlayerResults());
  table.innerHTML = `
    <thead>
      <tr>
        <th>順位</th><th>選手</th><th>大学</th>
        <th>1回戦</th><th>2回戦</th><th>3回戦</th><th>4回戦</th><th>5回戦</th><th>合計</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          <td class="rank-cell">${row.rounds ? row.rank : '—'}</td>
          <td><strong>${escapeHtml(displayName(row.p))}</strong><br><span class="player-sub">${escapeHtml(row.p.placeholder_name)}</span></td>
          <td><span class="university-badge ${row.p.university_code}">${escapeHtml(row.p.university_name)}</span></td>
          ${[1,2,3,4,5].map(r => `<td class="score-value ${scoreClass(row.scores[r])}">${formatScore(row.scores[r])}</td>`).join('')}
          <td class="total-cell score-value ${scoreClass(row.total)}">${row.rounds ? formatScore(row.total) : '—'}</td>
        </tr>`).join('')}
    </tbody>`;
}

function buildUniversityResults() {
  const players = buildPlayerResults();
  return UNI_ORDER.map(code => {
    const members = players.filter(x => x.p.university_code === code);
    const roundTotals = {};
    for (let r = 1; r <= 5; r++) {
      roundTotals[r] = round1(members.reduce((sum, x) => sum + (x.scores[r] ?? 0), 0));
    }
    const total = round1(members.reduce((sum, x) => sum + x.total, 0));
    return { code, name: UNI_NAME[code], roundTotals, total };
  }).sort((a,b) => b.total - a.total || UNI_ORDER.indexOf(a.code) - UNI_ORDER.indexOf(b.code));
}

function renderUniversities() {
  const rows = addCompetitionRanks(buildUniversityResults());
  $('universityCards').innerHTML = rows.map(row => `
    <div class="university-card ${row.code}">
      <div class="rank">${row.rank}位</div>
      <div class="name">${escapeHtml(row.name)}</div>
      <div class="total">${formatScore(row.total)}</div>
    </div>`).join('');

  $('universityTable').innerHTML = `
    <thead><tr><th>順位</th><th>大学</th><th>参加者</th><th>1回戦</th><th>2回戦</th><th>3回戦</th><th>4回戦</th><th>5回戦</th><th>合計</th></tr></thead>
    <tbody>
      ${rows.map(row => `
        <tr>
          <td class="rank-cell">${row.rank}</td>
          <td><span class="university-badge ${row.code}">${escapeHtml(row.name)}</span></td>
          <td>8名</td>
          ${[1,2,3,4,5].map(r => `<td class="score-value ${scoreClass(row.roundTotals[r])}">${formatScore(row.roundTotals[r])}</td>`).join('')}
          <td class="total-cell score-value ${scoreClass(row.total)}">${formatScore(row.total)}</td>
        </tr>`).join('')}
    </tbody>`;
}

function roundStatus(roundNo) {
  const rows = state.scores.filter(s => Number(s.round_no) === roundNo);
  const zeroOk = rows.filter(s => Math.abs(Number(s.score_total)) < 0.05).length;
  return {
    entered: rows.length,
    zeroOk,
    complete: rows.length === 6 && zeroOk === 6,
  };
}

function renderAdminRoundStatus() {
  const host = $('adminRoundStatus');
  if (!state.adminUser) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = [1,2,3,4,5].map(r => {
    const st = roundStatus(r);
    return `
      <div class="status-card ${st.complete ? 'status-ok' : 'status-warn'}">
        <strong>第${r}回戦 ${st.complete ? 'OK' : `${st.entered}/6卓`}</strong>
        <span>合計チェック ${st.zeroOk}/${st.entered || 0}</span>
      </div>`;
  }).join('');
}

function renderAdminScoreTables() {
  const host = $('adminScoreTables');
  if (!state.adminUser) {
    host.innerHTML = '';
    return;
  }
  const pMap = participantMap();
  const sMap = scoreMap();
  const rows = state.matchups.filter(m => Number(m.round_no) === state.adminRound);
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state">第${state.adminRound}回戦の組み合わせがありません。</div>`;
    return;
  }

  let html = '';
  for (let tableNo = 1; tableNo <= 6; tableNo++) {
    const seats = matchupFor(state.adminRound, tableNo);
    const score = sMap.get(scoreKey(state.adminRound, tableNo));
    html += `
      <article class="table-card admin-score-card">
        <div class="table-card-head">
          <h3>${tableNo}卓</h3>
          <span class="table-score-state">${score ? `保存済み ${new Date(score.updated_at).toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit'})}` : '未入力'}</span>
        </div>
        ${seats.map(m => {
          const p = pMap.get(m.player_code);
          const col = { E:'east_score', S:'south_score', W:'west_score', N:'north_score' }[m.seat];
          const val = score ? Number(score[col]) : null;
          return `
            <div class="seat-row">
              <span class="seat-mark">${SEAT_LABEL[m.seat]}</span>
              <div class="player-name">${escapeHtml(displayName(p))}<span class="player-sub">${escapeHtml(p?.university_name || '')}</span></div>
              <span class="score-value ${scoreClass(val)}">${formatScore(val)}</span>
            </div>`;
        }).join('')}
        <div class="admin-score-actions">
          <button class="primary-btn" type="button" data-edit-score="${state.adminRound}-${tableNo}">
            ${score ? '得点を修正' : '得点を入力'}
          </button>
        </div>
      </article>`;
  }
  host.innerHTML = html;
  host.querySelectorAll('[data-edit-score]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [r,t] = btn.dataset.editScore.split('-').map(Number);
      openScoreModal(r,t);
    });
  });
}

function renderParticipantEditor() {
  const host = $('participantEditor');
  if (!state.adminUser) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = UNI_ORDER.map(code => {
    const rows = state.participants
      .filter(p => p.university_code === code)
      .sort((a,b) => a.slot_no - b.slot_no);
    return `
      <div class="university-editor">
        <h3><span class="university-badge ${code}">${UNI_NAME[code]}</span></h3>
        ${rows.map(p => `
          <label class="participant-row">
            <span class="participant-code">${escapeHtml(p.placeholder_name)}</span>
            <input data-player-name="${escapeHtml(p.player_code)}" value="${escapeHtml(p.display_name || '')}" placeholder="氏名を入力">
          </label>`).join('')}
      </div>`;
  }).join('');
}

async function saveParticipants() {
  if (!state.adminUser) return;
  const btn = $('saveParticipantsButton');
  btn.disabled = true;
  btn.textContent = '保存中...';
  try {
    const inputs = [...document.querySelectorAll('[data-player-name]')];
    for (const input of inputs) {
      const code = input.dataset.playerName;
      const value = input.value.trim() || null;
      const { error } = await sb
        .from('participants')
        .update({ display_name: value })
        .eq('tournament_id', CONFIG.TOURNAMENT_ID)
        .eq('player_code', code);
      if (error) throw error;
    }
    await fetchAllData();
    toast('参加者名を共有保存しました');
  } catch (err) {
    console.error(err);
    toast(`参加者名の保存に失敗しました: ${err.message || err}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '参加者名を保存';
  }
}

function openScoreModal(roundNo, tableNo) {
  state.modalRound = roundNo;
  state.modalTable = tableNo;
  const seats = matchupFor(roundNo, tableNo);
  const pMap = participantMap();
  const score = scoreMap().get(scoreKey(roundNo, tableNo));
  $('scoreModalSub').textContent = `第${roundNo}回戦`;
  $('scoreModalTitle').textContent = `${tableNo}卓 得点入力`;
  $('scoreInputs').innerHTML = seats.map(m => {
    const p = pMap.get(m.player_code);
    const col = { E:'east_score', S:'south_score', W:'west_score', N:'north_score' }[m.seat];
    const val = score ? Number(score[col]) : '';
    return `
      <label class="score-input-row">
        <span class="seat-mark">${SEAT_LABEL[m.seat]}</span>
        <span class="player-name">${escapeHtml(displayName(p))}<span class="player-sub">${escapeHtml(p?.university_name || '')}</span></span>
        <input type="number" step="0.1" inputmode="decimal" data-score-seat="${m.seat}" value="${val}">
      </label>`;
  }).join('');
  $('scoreFormMessage').textContent = '';
  $('clearScoreButton').disabled = !score;
  $('scoreModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('scoreInputs').querySelectorAll('[data-score-seat]').forEach(input => {
    input.addEventListener('input', updateScoreTotal);
  });
  updateScoreTotal();
  setTimeout(() => $('scoreInputs').querySelector('input')?.focus(), 50);
}

function closeScoreModal() {
  $('scoreModal').classList.add('hidden');
  document.body.style.overflow = '';
  state.modalRound = null;
  state.modalTable = null;
}

function getModalScores() {
  const inputs = [...$('scoreInputs').querySelectorAll('[data-score-seat]')];
  const result = {};
  let complete = true;
  for (const input of inputs) {
    if (input.value.trim() === '') {
      complete = false;
      result[input.dataset.scoreSeat] = null;
    } else {
      const n = Number(input.value);
      result[input.dataset.scoreSeat] = Number.isFinite(n) ? round1(n) : null;
      if (!Number.isFinite(n)) complete = false;
    }
  }
  return { result, complete };
}

function updateScoreTotal() {
  const { result } = getModalScores();
  const nums = Object.values(result).filter(v => v !== null);
  const total = round1(nums.reduce((a,b) => a+b, 0));
  $('scoreTotal').textContent = formatScore(total);
  $('scoreTotal').className = scoreClass(total);
}

async function saveModalScore(event) {
  event.preventDefault();
  if (!state.adminUser) return;
  const { result, complete } = getModalScores();
  const msg = $('scoreFormMessage');
  if (!complete) {
    msg.textContent = '4人全員の得点を入力してください。';
    return;
  }
  const total = round1(Object.values(result).reduce((a,b) => a+b, 0));
  if (Math.abs(total) >= 0.05) {
    msg.textContent = `4人合計が0.0ではありません（現在 ${formatScore(total)}）。`;
    return;
  }

  const submit = $('scoreForm').querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = '保存中...';
  msg.textContent = '';
  try {
    const payload = {
      tournament_id: CONFIG.TOURNAMENT_ID,
      round_no: state.modalRound,
      table_no: state.modalTable,
      east_score: result.E,
      south_score: result.S,
      west_score: result.W,
      north_score: result.N,
      entered_by: state.adminUser.id,
    };
    const { data, error } = await sb
      .from('table_scores')
      .upsert(payload, { onConflict: 'tournament_id,round_no,table_no' })
      .select()
      .single();
    if (error) throw error;
    await fetchAllData();
    closeScoreModal();
    toast(`第${payload.round_no}回戦 ${payload.table_no}卓を共有保存しました`);
  } catch (err) {
    console.error(err);
    msg.textContent = `保存に失敗しました。入力値は残っています。${err.message ? ` (${err.message})` : ''}`;
  } finally {
    submit.disabled = false;
    submit.textContent = '共有保存';
  }
}

async function clearModalScore() {
  if (!state.adminUser || !state.modalRound || !state.modalTable) return;
  if (!confirm(`第${state.modalRound}回戦 ${state.modalTable}卓の得点をクリアしますか？`)) return;
  const btn = $('clearScoreButton');
  btn.disabled = true;
  try {
    const { error } = await sb
      .from('table_scores')
      .delete()
      .eq('tournament_id', CONFIG.TOURNAMENT_ID)
      .eq('round_no', state.modalRound)
      .eq('table_no', state.modalTable);
    if (error) throw error;
    await fetchAllData();
    closeScoreModal();
    toast('この卓の得点をクリアしました');
  } catch (err) {
    console.error(err);
    $('scoreFormMessage').textContent = `クリアに失敗しました: ${err.message || err}`;
    btn.disabled = false;
  }
}

function secureShuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function prepareRound5() {
  const btn = $('prepareRound5Button');
  btn.disabled = true;
  btn.textContent = '最新得点を確認中...';
  state.r5Preview = null;
  state.r5TieInfo = [];
  $('round5Preview').innerHTML = '';
  try {
    await fetchAllData();

    const checks = [];
    let allGood = true;
    for (let r = 1; r <= 4; r++) {
      const st = roundStatus(r);
      const good = st.entered === 6 && st.zeroOk === 6;
      checks.push({ r, st, good });
      if (!good) allGood = false;
    }
    renderR5Checks(checks);

    if (!allGood) {
      $('round5Preview').innerHTML = `<div class="empty-state">第1〜4回戦の全24卓が「入力済み・合計0.0」になるまで第5回戦は作成できません。</div>`;
      return;
    }

    const rows = state.participants.map(p => {
      const four = [1,2,3,4].map(r => scoreForPlayerRound(p.player_code, r));
      if (four.some(v => v === null)) throw new Error(`${displayName(p)} の第1〜4回戦得点が揃っていません。`);
      return { p, total: round1(four.reduce((a,b) => a+b, 0)) };
    }).sort((a,b) => b.total - a.total);

    const randomized = [];
    for (let i = 0; i < rows.length;) {
      let j = i + 1;
      while (j < rows.length && Math.abs(rows[j].total - rows[i].total) < 0.0001) j++;
      const group = rows.slice(i, j);
      if (group.length > 1) {
        state.r5TieInfo.push({
          score: group[0].total,
          players: group.map(x => displayName(x.p)),
        });
      }
      randomized.push(...(group.length > 1 ? secureShuffle(group) : group));
      i = j;
    }

    const seatMode = $('r5SeatMode').value;
    const seatOrder = seatMode === 'north-first' ? ['N','W','S','E'] : ['E','S','W','N'];

    state.r5Preview = randomized.map((row, idx) => ({
      position: idx + 1,
      table_no: Math.floor(idx / 4) + 1,
      seat: seatOrder[idx % 4],
      player_code: row.p.player_code,
      total: row.total,
    }));

    renderR5Preview();
  } catch (err) {
    console.error(err);
    $('round5Preview').innerHTML = `<div class="empty-state">${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '第5回戦を作成';
  }
}

function renderR5Checks(checks) {
  $('round5Check').innerHTML = checks.map(({r,st,good}) => `
    <div class="check-item ${good ? 'check-ok' : 'check-bad'}">
      <strong>第${r}回戦 ${good ? 'OK' : '要確認'}</strong>
      ${st.entered}/6卓入力・合計OK ${st.zeroOk}/${st.entered || 0}
    </div>`).join('');
}

function renderR5Preview() {
  if (!state.r5Preview) return;
  const pMap = participantMap();
  const tieText = state.r5TieInfo.length
    ? `同点者ランダムあり：${state.r5TieInfo.map(x => `${formatScore(x.score)}（${x.players.join('・')}）`).join(' / ')}`
    : '同点者なし';

  let html = `
    <div class="preview-head">
      <div>
        <h3>第5回戦プレビュー</h3>
        <div class="preview-note">第1〜4回戦確定得点から作成 / ${escapeHtml(tieText)}</div>
      </div>
      <button class="primary-btn" id="confirmRound5Button" type="button">この組み合わせで確定</button>
    </div>
    <div class="matchup-grid" style="margin-top:14px;">`;

  for (let tableNo = 1; tableNo <= 6; tableNo++) {
    const rows = state.r5Preview.filter(x => x.table_no === tableNo)
      .sort((a,b) => SEATS.indexOf(a.seat) - SEATS.indexOf(b.seat));
    html += `
      <article class="table-card">
        <div class="table-card-head"><h3>${tableNo}卓</h3><span class="table-score-state">${rows.map(x => `${x.position}位`).join(' / ')}</span></div>
        ${rows.map(x => {
          const p = pMap.get(x.player_code);
          return `
            <div class="seat-row">
              <span class="seat-mark">${SEAT_LABEL[x.seat]}</span>
              <div class="player-name">${escapeHtml(displayName(p))}<span class="player-sub"><span class="university-badge ${p?.university_code || ''}">${escapeHtml(p?.university_name || '')}</span> 第1〜4回戦 ${x.position}位</span></div>
              <span class="score-value ${scoreClass(x.total)}">${formatScore(x.total)}</span>
            </div>`;
        }).join('')}
      </article>`;
  }
  html += '</div>';
  $('round5Preview').innerHTML = html;
  $('confirmRound5Button').addEventListener('click', confirmRound5);
}

async function confirmRound5() {
  if (!state.r5Preview || !state.adminUser) return;
  const existingMatchups = state.matchups.filter(m => Number(m.round_no) === 5);
  const existingScores = state.scores.filter(s => Number(s.round_no) === 5);

  if (existingScores.length) {
    toast('第5回戦の得点が既にあるため、組み合わせの作り直しはできません。');
    return;
  }
  if (existingMatchups.length) {
    if (!confirm('第5回戦の組み合わせは既にあります。得点未入力のため、削除して作り直しますか？')) return;
  } else {
    if (!confirm('この第5回戦組み合わせを確定して参加者画面へ公開しますか？')) return;
  }

  const btn = $('confirmRound5Button');
  btn.disabled = true;
  btn.textContent = '確定中...';
  try {
    if (existingMatchups.length) {
      const del = await sb
        .from('matchups')
        .delete()
        .eq('tournament_id', CONFIG.TOURNAMENT_ID)
        .eq('round_no', 5);
      if (del.error) throw del.error;
    }

    const payload = state.r5Preview.map(x => ({
      tournament_id: CONFIG.TOURNAMENT_ID,
      round_no: 5,
      table_no: x.table_no,
      seat: x.seat,
      player_code: x.player_code,
      source: 'generated',
    }));
    const { error } = await sb.from('matchups').insert(payload);
    if (error) throw error;

    state.r5Preview = null;
    await fetchAllData();
    state.activeRound = 5;
    state.adminRound = 5;
    renderAll();
    toast('第5回戦を確定し、参加者画面へ公開しました');
  } catch (err) {
    console.error(err);
    toast(`第5回戦の確定に失敗しました: ${err.message || err}`);
    btn.disabled = false;
    btn.textContent = 'この組み合わせで確定';
  }
}

function renderRound5ExistingState() {
  if (!state.adminUser) return;
  const r5 = state.matchups.filter(m => Number(m.round_no) === 5);
  if (r5.length === 24 && !state.r5Preview) {
    $('round5Check').innerHTML = `
      <div class="check-item check-ok" style="grid-column:1/-1;">
        <strong>第5回戦は確定済みです</strong>
        24名の組み合わせが参加者画面に公開されています。得点未入力なら「第5回戦を作成」から再作成できます。
      </div>`;
  }
}

async function verifyAdminSession(session) {
  if (!session?.user) return false;
  const { data, error } = await sb
    .from('tournament_admins')
    .select('tournament_id,user_id')
    .eq('tournament_id', CONFIG.TOURNAMENT_ID)
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error || !data) return false;
  state.adminUser = session.user;
  return true;
}

function renderAdminAuth() {
  const loggedIn = Boolean(state.adminUser);
  $('adminLoginCard').classList.toggle('hidden', loggedIn);
  $('adminPanel').classList.toggle('hidden', !loggedIn);
  $('logoutButton').classList.toggle('hidden', !loggedIn);
  if (loggedIn) renderAll();
}

async function adminLogin(event) {
  event.preventDefault();
  const password = $('adminPassword').value;
  const msg = $('loginMessage');
  const submit = $('adminLoginForm').querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = '確認中...';
  msg.textContent = '';
  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email: CONFIG.ADMIN_EMAIL,
      password,
    });
    if (error) throw new Error('パスワードが違うか、ログインできませんでした。');
    const ok = await verifyAdminSession(data.session);
    if (!ok) {
      await sb.auth.signOut();
      throw new Error('このアカウントには大会幹事権限がありません。');
    }
    $('adminPassword').value = '';
    renderAdminAuth();
    await fetchAllData();
    toast('幹事モードでログインしました');
  } catch (err) {
    console.error(err);
    msg.textContent = err.message || String(err);
  } finally {
    submit.disabled = false;
    submit.textContent = 'ログイン';
  }
}

async function adminLogout() {
  await sb.auth.signOut();
  state.adminUser = null;
  state.r5Preview = null;
  renderAdminAuth();
  toast('ログアウトしました');
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  // 分離版の幹事ページには公開画面の一部ボタンが存在しないため、
  // 存在する要素だけイベントを設定する。
  $('homeButton')?.addEventListener('click', () => showView('matchups'));
  $('refreshPublicButton')?.addEventListener('click', fetchAllData);
  $('adminLink')?.addEventListener('click', () => showView('admin'));
  $('adminLoginForm').addEventListener('submit', adminLogin);
  $('logoutButton').addEventListener('click', adminLogout);
  $('saveParticipantsButton').addEventListener('click', saveParticipants);
  $('prepareRound5Button').addEventListener('click', prepareRound5);
  $('r5SeatMode').addEventListener('change', () => {
    if (state.r5Preview) prepareRound5();
  });

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => showAdminView(btn.dataset.adminView));
  });

  $('closeScoreModal').addEventListener('click', closeScoreModal);
  $('scoreModal').addEventListener('click', e => {
    if (e.target.dataset.closeModal === 'true') closeScoreModal();
  });
  $('scoreForm').addEventListener('submit', saveModalScore);
  $('clearScoreButton').addEventListener('click', clearModalScore);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('scoreModal').classList.contains('hidden')) closeScoreModal();
  });
}

async function init() {
  bindEvents();
  const { data } = await sb.auth.getSession();
  if (data.session) {
    const ok = await verifyAdminSession(data.session);
    if (!ok) await sb.auth.signOut();
  }
  renderAdminAuth();
  await fetchAllData();

  setInterval(() => {
    // 閲覧者だけ自動更新。幹事が参加者名などを編集中に、
    // ポーリングで入力途中の画面を書き戻さないようにする。
    if (document.visibilityState === 'visible' && !state.adminUser && $('scoreModal').classList.contains('hidden')) {
      fetchAllData().catch(() => {});
    }
  }, CONFIG.POLL_MS);
}

init();
