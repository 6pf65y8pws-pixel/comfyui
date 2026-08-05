/* =========================================================
   もちもち調合工房 — ゲーム進行
   ========================================================= */
(function(){
'use strict';

const SAVE_KEY = 'potion_lab_save_v1';
const $  = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const pick  = arr => arr[Math.floor(Math.random()*arr.length)];
const charDef = id => PL.CHARACTERS.find(c => c.id === id);

/* ---------- データ側から使うヘルパ ---------- */
PL.addMat   = (s,id,n) => { s.materials[id] = (s.materials[id]||0) + n; };
PL.anyStat  = (s,key,v) => Object.values(s.chars).some(c => c.unlocked && c[key] >= v);
PL.joinChar = (s,id) => { if (s.chars[id]) s.chars[id].unlocked = true; };

/* ---------- 状態 ---------- */
let S = null;
let renderer = null;
let busy = false;

function newState(){
  const s = {
    ver:1, day:1, ap:4, apMax:4,
    materials:{}, potions:[], nextPid:1,
    chars:{}, locations:{}, recipes:{}, quests:{},
    stats:{ crafted:0, drinks:0, farts:0, pokes:0, gathers:0 },
    sel:'rizetta',
    craft:{ base:'water', slots:[null,null,null] },
    sound:true
  };
  for (const k in PL.LOCATIONS) s.locations[k] = !!PL.LOCATIONS[k].open;
  PL.CHARACTERS.forEach(c => { s.chars[c.id] = freshChar(c); });
  PL.addMat(s,'fukuramigusa',3);
  PL.addMat(s,'manpuku_berry',3);
  PL.addMat(s,'mochigoke',2);
  PL.addMat(s,'awadachi',2);
  PL.addMat(s,'shoka_koso',2);
  return s;
}
function freshChar(c){
  return {
    belly:c.start.belly, weight:c.start.weight, gas:c.start.gas,
    soft:c.start.soft, mood:c.start.mood,
    unlocked: PL.START_CHARS.includes(c.id),
    drinks:0, hold:0,
    rec:{ belly:c.start.belly, weight:c.start.weight, gas:c.start.gas, soft:c.start.soft },
    seen:{ belly:0, weight:0, gas:0, soft:0 },
    notes:[]
  };
}

function save(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch(e){}
}
function load(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.ver !== 1) return null;
    // 後から増えたキャラを補完
    PL.CHARACTERS.forEach(c => { if (!s.chars[c.id]) s.chars[c.id] = freshChar(c); });
    for (const k in PL.LOCATIONS) if (!(k in s.locations)) s.locations[k] = !!PL.LOCATIONS[k].open;
    if (!s.craft) s.craft = { base:'water', slots:[null,null,null] };
    return s;
  } catch(e){ return null; }
}

/* ---------- ログ ---------- */
function log(msg, cls){
  const li = document.createElement('li');
  li.innerHTML = msg;
  if (cls) li.className = cls;
  const ul = $('logList');
  ul.insertBefore(li, ul.firstChild);
  while (ul.children.length > 60) ul.removeChild(ul.lastChild);
}

/* ---------- 演出 ---------- */
let speechTimer = null;
function say(text, ms){
  const b = $('speech');
  b.textContent = text;
  b.classList.remove('hidden');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => b.classList.add('hidden'), ms || 2600);
}
function popup(text, cls){
  const p = document.createElement('div');
  p.className = 'popup' + (cls ? ' '+cls : '');
  p.textContent = text;
  p.style.left = (28 + Math.random()*44) + '%';
  p.style.top  = (44 + Math.random()*16) + '%';
  $('popups').appendChild(p);
  setTimeout(() => p.remove(), 1300);
}
function shake(){
  const v = $('viewport');
  v.classList.remove('shake'); void v.offsetWidth; v.classList.add('shake');
}

/* ---------- ポーション計算 ---------- */
function computePotion(matIds, baseId){
  const base = PL.BASES[baseId];
  const fx = { belly:0, weight:0, gas:0, soft:0 };
  const counts = { belly:0, weight:0, gas:0, soft:0 };
  let mood = base.moodBonus || 0;
  let dur = base.dur, potency = 1, fast = false, stable = false, calm = false;

  matIds.forEach(id => {
    const m = PL.MATERIALS[id]; if (!m) return;
    for (const k in m.fx){
      if (k === 'mood') mood += m.fx[k];
      else { fx[k] += m.fx[k]; if (m.fx[k] > 0) counts[k]++; }
    }
    if (m.mod){
      if (m.mod.dur)     dur *= m.mod.dur;
      if (m.mod.potency) potency *= m.mod.potency;
      if (m.mod.fast)    fast = true;
      if (m.mod.stable)  stable = true;
      if (m.mod.calm)    calm = true;
    }
  });

  // シナジー：同系統の素材が重なると増幅
  const syn = [];
  for (const k in counts){
    if (counts[k] >= 2){ fx[k] *= 1.25 + (counts[k]-2)*0.15; syn.push(k); }
  }
  // ベース補正
  for (const k in fx) fx[k] = fx[k] * base.mul[k] * potency;
  if (calm) mood += 12;

  const power = Math.max.apply(null, PL.FX_KEYS.map(k => Math.abs(fx[k])));
  const rank = power >= 45 ? 'S' : power >= 32 ? 'A' : power >= 20 ? 'B' : 'C';

  // 命名
  let dom = 'none', best = 0;
  PL.FX_KEYS.forEach(k => { if (Math.abs(fx[k]) > best){ best = Math.abs(fx[k]); dom = k; } });
  const negative = dom !== 'none' && fx[dom] < 0;
  const name = negative
    ? 'もどし' + PL.BASE_SUFFIX[baseId]
    : pick(PL.NAME_PARTS[dom]) + PL.BASE_SUFFIX[baseId];

  return {
    name, rank, fx, mood: Math.round(mood), dur:+dur.toFixed(2),
    fast, stable, syn, power:Math.round(power), base:baseId,
    mats: matIds.slice(), negative
  };
}
function recipeKey(matIds, baseId){ return baseId + '|' + matIds.slice().sort().join(','); }

/* ---------- 行動：採取 ---------- */
function gather(locId){
  if (busy) return;
  if (S.ap <= 0){ log('行動力が足りません。<b>就寝</b>して日を改めましょう。','warn'); return; }
  S.ap--; S.stats.gathers++;
  const pool = [];
  for (const id in PL.MATERIALS){
    const m = PL.MATERIALS[id];
    if (m.loc === locId) for (let i=0;i<m.w;i++) pool.push(id);
  }
  const n = 2 + Math.floor(Math.random()*3);
  const got = {};
  for (let i=0;i<n;i++){
    const id = pick(pool);
    PL.addMat(S, id, 1);
    got[id] = (got[id]||0)+1;
  }
  const txt = Object.keys(got).map(id => `${PL.MATERIALS[id].icon}${PL.MATERIALS[id].name}×${got[id]}`).join('、');
  log(`❧ <b>${PL.LOCATIONS[locId].name}</b> にて採取： ${txt}`, 'good');
  PL.Sfx.ok();
  checkQuests(); renderAll(); save();
}

/* ---------- 行動：調合 ---------- */
function craft(){
  if (busy) return;
  const mats = S.craft.slots.filter(Boolean);
  if (!mats.length){ log('素材をスロットに入れてください。','warn'); return; }
  // 在庫確認
  const need = {};
  mats.forEach(id => need[id] = (need[id]||0)+1);
  for (const id in need){
    if ((S.materials[id]||0) < need[id]){ log('素材が足りません。','warn'); return; }
  }
  for (const id in need) S.materials[id] -= need[id];

  const p = computePotion(mats, S.craft.base);
  p.id = S.nextPid++;
  S.potions.push(p);
  S.stats.crafted++;

  const key = recipeKey(mats, S.craft.base);
  if (!S.recipes[key]){
    S.recipes[key] = { name:p.name, rank:p.rank, mats:mats.slice(), base:S.craft.base, day:S.day };
    log(`✦ <b>新たな秘伝を書き留めた</b>　「${p.name}」`, 'big');
    popup('新たな秘伝', 'soft');
  }
  log(`◆ <b>${p.name}</b>（${p.rank}）を調合した。`, 'good');
  PL.Sfx.ok();
  S.craft.slots = [null,null,null];
  checkQuests(); renderAll(); save();
}

/* ---------- 行動：試飲 ---------- */
function drink(potionId){
  if (busy) return;
  if (S.ap <= 0){ log('行動力が足りません。<b>就寝</b>して日を改めましょう。','warn'); return; }
  const idx = S.potions.findIndex(p => p.id === potionId);
  if (idx < 0) return;
  const p = S.potions[idx];
  const cid = S.sel, c = S.chars[cid], def = charDef(cid);
  if (!c || !c.unlocked) return;

  S.potions.splice(idx,1);
  S.ap--; S.stats.drinks++; c.drinks++;
  busy = true; document.body.classList.add('busy');

  const before = { belly:c.belly, weight:c.weight, gas:c.gas, soft:c.soft };
  const resist = 1 - (1 - c.mood/100) * 0.25;
  const delta = {};
  PL.FX_KEYS.forEach(k => { delta[k] = p.fx[k] * def.tol[k] * resist; });

  // ごくごく
  renderer.setExpression('surprise', 1200);
  renderer.squash = 1;
  PL.Sfx.gulp();
  say(pick(def.lines.drink), 2200);
  log(`❖ <b>${def.name}</b> が「${p.name}」を飲み干した。`, 'big');

  const steps = p.fast ? 8 : 14;
  const iv = p.fast ? 240 : 340;
  let i = 0;
  const midTier = {};

  const timer = setInterval(() => {
    i++;
    let biggest = null, biggestAmt = 0;
    PL.FX_KEYS.forEach(k => {
      const d = delta[k]/steps;
      c[k] = clamp(c[k] + d, 0, 100);
      if (Math.abs(d) > biggestAmt){ biggestAmt = Math.abs(d); biggest = k; }
    });

    if (biggest && biggestAmt > 0.4){
      const growing = delta[biggest] > 0;
      renderer.inflatePulse(growing ? 5 + biggestAmt*2.2 : -(3 + biggestAmt));
      if (i % 3 === 1) PL.Sfx.inflate();
    }
    renderer.setState(viewState(c));
    renderStats();

    // 途中セリフ
    if (i === Math.floor(steps/2) && biggest){
      const t = PL.tierOf(c[biggest]);
      if (t >= 1){ say(pick(def.lines[biggest][t-1]), 2400); midTier[biggest] = t; }
    }
    // ガスが溜まっていれば漏れる
    maybeFart(cid, 1.4);

    if (i >= steps){
      clearInterval(timer);
      finishDrink(cid, p, before);
    }
  }, iv);
}

function finishDrink(cid, p, before){
  const c = S.chars[cid], def = charDef(cid);

  // 効果の持続（月光露やハーブティーは変化が抜けにくい）
  if (p.dur > 1) c.hold = Math.max(c.hold, Math.round((p.dur-1)*3)+1);
  c.mood = clamp(c.mood + p.mood + enjoyOf(def, p), 0, 100);

  // 記録
  const diffs = [];
  PL.FX_KEYS.forEach(k => {
    const d = Math.round(c[k] - before[k]);
    if (d !== 0) diffs.push(`${PL.STATS[k].icon}${PL.STATS[k].name} ${d>0?'+':''}${d}`);
    if (c[k] > c.rec[k]) c.rec[k] = Math.round(c[k]);
    const t = PL.tierOf(c[k]);
    if (t > c.seen[k]) c.seen[k] = t;
  });
  c.notes.unshift({ day:S.day, potion:p.name, rank:p.rank, diff:diffs.join(' / ') || '変化なし' });
  c.notes = c.notes.slice(0,8);
  log(`✎ 観察記録： ${diffs.join(' / ') || '目立った変化なし'}`, 'good');

  // 締めのセリフ
  let dom = null, best = 0;
  PL.FX_KEYS.forEach(k => { const a = Math.abs(c[k]-before[k]); if (a > best){ best = a; dom = k; } });
  if (p.negative){
    say(pick(def.lines.revert), 3000);
    renderer.setExpression('happy', 2000);
  } else if (dom){
    const t = PL.tierOf(c[dom]);
    if (t >= 1){
      say(pick(def.lines[dom][t-1]), 3400);
      renderer.setExpression(t>=3 ? 'strain' : t>=2 ? 'shy' : 'happy', 2600);
      if (t >= 3) shake();
    } else {
      say(pick(def.lines.greet), 2600);
    }
  }
  renderer.sparkle(12);

  busy = false; document.body.classList.remove('busy');
  checkQuests(); renderAll(); save();
}

function enjoyOf(def, p){
  const enjoy = { rizetta:3, mint:5, shannon:-5, puti:9, noel:-8, vivi:10 }[def.id] || 0;
  return Math.round(enjoy * (p.power/25)) - (p.negative ? 0 : 2);
}

/* ---------- オナラ ---------- */
function maybeFart(cid, mul){
  const c = S.chars[cid];
  if (c.gas < 35) return false;
  const chance = ((c.gas-30)/100) * 0.22 * (mul||1);
  if (Math.random() > chance) return false;
  doFart(cid);
  return true;
}
function doFart(cid){
  const c = S.chars[cid], def = charDef(cid);
  const power = clamp(c.gas/70, 0.4, 1.6);
  c.gas = clamp(c.gas - (6 + Math.random()*10), 0, 100);
  c.belly = clamp(c.belly - (2 + Math.random()*5), 0, 100);
  c.mood = clamp(c.mood - 1, 0, 100);
  S.stats.farts++;
  renderer.fartBurst(power);
  renderer.setExpression('strain', 900);
  PL.Sfx.fart(power);
  popup(pick(['ぷすー…','ぶふぅっ','ぷすぷす…','すぅ…']), 'gas');
  say(pick(def.lines.fart), 2200);
  if (power > 1.1) shake();
  renderer.setState(viewState(c));
  renderStats();
}

/* ---------- 就寝 ---------- */
function sleep(){
  if (busy) return;
  S.day++; S.ap = S.apMax;
  const holdMul = 0.35;
  Object.keys(S.chars).forEach(id => {
    const c = S.chars[id]; if (!c.unlocked) return;
    const def = charDef(id);
    const m = def.metab * (c.hold > 0 ? holdMul : 1);
    c.belly  = clamp(c.belly  * (1 - 0.22*m), 0, 100);
    c.gas    = clamp(c.gas    * (1 - 0.45*m), 0, 100);
    c.weight = clamp(c.weight * (1 - 0.045*m), 0, 100);
    c.soft   = clamp(c.soft   * (1 - 0.09*m), 0, 100);
    c.mood   = clamp(c.mood + (70 - c.mood)*0.4, 0, 100);
    if (c.hold > 0) c.hold--;
  });
  log(`☾ <b>第 ${S.day} 日</b> の朝。行動力が満ちた。`, 'warn');
  PL.Sfx.ok();
  checkQuests(); renderAll(); save();
}

/* ---------- 目標判定 ---------- */
function checkQuests(){
  PL.QUESTS.forEach(q => {
    if (S.quests[q.id]) return;
    if (q.check(S)){
      S.quests[q.id] = true;
      q.grant(S);
      log(`✧ <b>${q.name}</b> 成就 — ${q.rewardText}`, 'big');
      popup('解放', 'soft');
      PL.Sfx.ok();
    }
  });
}

/* ---------- 表示用の状態 ---------- */
function viewState(c){
  return { belly:c.belly, weight:c.weight, gas:c.gas, soft:c.soft, mood:c.mood };
}

/* =========================================================
   UI
   ========================================================= */
function renderAll(){
  renderHud(); renderCharTabs(); renderCharMeta(); renderStats();
  renderGather(); renderCraft(); renderDrink(); renderCodex(); renderQuests();
}

function renderHud(){
  $('hudDay').textContent = S.day;
  $('hudAp').textContent = S.ap;
  $('hudApMax').textContent = S.apMax;
  $('hudRecipes').textContent = Object.keys(S.recipes).length;
  $('hudPotions').textContent = S.potions.length;
  $('btnSound').textContent = S.sound ? '♪ 入' : '♪ 切';
}

function renderCharTabs(){
  const box = $('charTabs'); box.innerHTML = '';
  PL.CHARACTERS.forEach(def => {
    const c = S.chars[def.id];
    const b = document.createElement('button');
    b.className = 'ctab' + (S.sel===def.id ? ' active':'') + (c.unlocked ? '' : ' locked');
    b.innerHTML = c.unlocked
      ? `<span class="dot" style="background:${def.palette.hair}"></span>${def.name}`
      : `<span class="dot" style="background:#555"></span>???`;
    if (c.unlocked) b.onclick = () => selectChar(def.id);
    box.appendChild(b);
  });
}

function selectChar(id){
  if (busy) return;
  S.sel = id;
  const def = charDef(id);
  renderer.setCharacter(def);
  renderer.setState(viewState(S.chars[id]));
  renderer.setExpression('auto', 0);
  say(pick(def.lines.greet), 2800);
  renderAll(); save();
}

function renderCharMeta(){
  const def = charDef(S.sel), c = S.chars[S.sel];
  $('charName').textContent = def.name;
  $('charTitle').textContent = `${def.title}・${def.age}歳`;
  $('charProfile').textContent = def.profile +
    (c.drinks ? `（試飲 ${c.drinks} 回／代謝 ${def.metab.toFixed(2)}）` : '');
}

function renderStats(){
  const c = S.chars[S.sel];
  const box = $('stats');
  const keys = ['belly','weight','gas','soft','mood'];
  if (box.childElementCount !== keys.length){
    box.innerHTML = keys.map(k => {
      const st = PL.STATS[k];
      return `<div class="stat"><span class="lbl">${st.icon} ${st.name}</span>`+
             `<span class="bar ${st.color}"><i id="bar_${k}"></i></span>`+
             `<span class="val" id="val_${k}"></span></div>`;
    }).join('');
  }
  keys.forEach(k => {
    const v = clamp(c[k],0,100);
    $('bar_'+k).style.width = v.toFixed(1)+'%';
    const tier = (k==='mood') ? '' : ` <small>${PL.TIERS[PL.tierOf(v)]}</small>`;
    $('val_'+k).innerHTML = Math.round(v) + tier;
  });
}

function fxTags(fx, mood){
  const out = [];
  PL.FX_KEYS.forEach(k => {
    const v = Math.round(fx[k]);
    if (!v) return;
    out.push(`<span class="tag ${v<0?'neg':PL.STATS[k].color}">${PL.STATS[k].icon}${v>0?'+':''}${v}</span>`);
  });
  if (mood) out.push(`<span class="tag mood">💗${mood>0?'+':''}${mood}</span>`);
  return out.join('');
}

/* --- 採取タブ --- */
function renderGather(){
  const box = $('locList'); box.innerHTML = '';
  for (const id in PL.LOCATIONS){
    const L = PL.LOCATIONS[id], open = S.locations[id];
    const mats = Object.keys(PL.MATERIALS).filter(m => PL.MATERIALS[m].loc === id)
      .map(m => PL.MATERIALS[m].icon).join('');
    const d = document.createElement('div');
    d.className = 'card' + (open ? ' clickable' : ' locked');
    d.innerHTML = `<div class="ttl"><span>${L.icon} ${open?L.name:'？？？'}</span><span class="tag">⚡1</span></div>`+
                  `<div class="dsc">${open ? L.desc : '未開放'}</div>`+
                  `<div class="row"><span class="tag">${open?mats:'???'}</span></div>`;
    if (open) d.onclick = () => gather(id);
    box.appendChild(d);
  }

  const inv = $('invList'); inv.innerHTML = '';
  const owned = Object.keys(S.materials).filter(id => S.materials[id] > 0);
  if (!owned.length){ inv.innerHTML = '<span class="empty">素材がありません。採取に出かけましょう。</span>'; return; }
  owned.sort();
  owned.forEach(id => {
    const m = PL.MATERIALS[id]; if (!m) return;
    const b = document.createElement('button');
    b.className = 'chip static';
    b.title = m.desc;
    b.innerHTML = `${m.icon} ${m.name} <span class="n">${S.materials[id]}</span>`;
    inv.appendChild(b);
  });
}

/* --- 調合タブ --- */
function renderCraft(){
  const bl = $('baseList'); bl.innerHTML = '';
  for (const id in PL.BASES){
    const B = PL.BASES[id];
    const d = document.createElement('div');
    d.className = 'card clickable' + (S.craft.base===id ? ' selected':'');
    d.innerHTML = `<div class="ttl"><span>${B.icon} ${B.name}</span></div>`+
                  `<div class="dsc">${B.desc}</div><div class="row"><span class="tag">${B.note}</span></div>`;
    d.onclick = () => { S.craft.base = id; renderCraft(); save(); };
    bl.appendChild(d);
  }

  const sl = $('craftSlots'); sl.innerHTML = '';
  S.craft.slots.forEach((id,i) => {
    const d = document.createElement('div');
    if (id){
      const m = PL.MATERIALS[id];
      d.className = 'slot filled';
      d.innerHTML = `<span class="e">${m.icon}</span><span>${m.name}</span><span style="opacity:.6">クリックで戻す</span>`;
      d.onclick = () => { S.craft.slots[i] = null; renderCraft(); save(); };
    } else {
      d.className = 'slot';
      d.innerHTML = `<span class="e">＋</span><span>素材スロット${i+1}</span>`;
    }
    sl.appendChild(d);
  });

  // プレビュー
  const mats = S.craft.slots.filter(Boolean);
  const pv = $('craftPreview');
  if (!mats.length){
    pv.innerHTML = '<span class="empty">素材を選ぶと、できあがる薬の予測が表示されます。</span>';
  } else {
    const p = computePotion(mats, S.craft.base);
    const key = recipeKey(mats, S.craft.base);
    const known = !!S.recipes[key];
    pv.innerHTML =
      `<div class="pname"><span class="rank ${p.rank}">${p.rank}</span> ${p.name} `+
      `${known ? '<span class="tag">既知</span>' : '<span class="tag mood">未知のレシピ</span>'}</div>`+
      `<div class="fx">${fxTags(p.fx, p.mood)}</div>`+
      (p.syn.length ? `<div class="syn">✨ シナジー：${p.syn.map(k=>PL.STATS[k].name).join('・')} が増幅</div>` : '')+
      (p.fast ? '<div class="syn">⚡ 即効性</div>' : '')+
      (p.dur > 1.05 ? `<div class="syn">🌙 効果が抜けにくい（×${p.dur.toFixed(1)}）</div>` : '');
  }
  $('btnCraft').disabled = !mats.length;

  // 素材ピッカー
  const mp = $('matPicker'); mp.innerHTML = '';
  const used = {};
  S.craft.slots.filter(Boolean).forEach(id => used[id] = (used[id]||0)+1);
  const owned = Object.keys(S.materials).filter(id => S.materials[id] > 0).sort();
  if (!owned.length){ mp.innerHTML = '<span class="empty">素材がありません。</span>'; return; }
  owned.forEach(id => {
    const m = PL.MATERIALS[id]; if (!m) return;
    const left = S.materials[id] - (used[id]||0);
    const b = document.createElement('button');
    b.className = 'chip';
    b.title = m.desc + ' ／ ' + fxText(m.fx);
    b.innerHTML = `${m.icon} ${m.name} <span class="n">${left}</span>`;
    b.disabled = left <= 0 || S.craft.slots.every(x => x !== null);
    b.onclick = () => {
      const i = S.craft.slots.indexOf(null);
      if (i < 0) return;
      S.craft.slots[i] = id; renderCraft(); save();
    };
    mp.appendChild(b);
  });
}
function fxText(fx){
  return Object.keys(fx).map(k => `${PL.STATS[k].name}${fx[k]>0?'+':''}${fx[k]}`).join(' ');
}

/* --- 試飲タブ --- */
function renderDrink(){
  const box = $('potionShelf'); box.innerHTML = '';
  if (!S.potions.length){
    box.innerHTML = '<span class="empty">ポーションがありません。調合してください。</span>';
    return;
  }
  const def = charDef(S.sel);
  S.potions.forEach(p => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML =
      `<div class="ttl"><span><span class="rank ${p.rank}">${p.rank}</span> ${p.name}</span></div>`+
      `<div class="fx" style="display:flex;gap:5px;flex-wrap:wrap">${fxTags(p.fx, p.mood)}</div>`+
      `<div class="dsc">${p.mats.map(m=>PL.MATERIALS[m].icon+PL.MATERIALS[m].name).join(' + ')} ／ ${PL.BASES[p.base].name}</div>`;
    const row = document.createElement('div');
    row.className = 'row';
    const b = document.createElement('button');
    b.className = 'btn btn-primary btn-sm';
    b.textContent = `${def.name} に飲んでもらう（⚡1）`;
    b.disabled = S.ap <= 0 || busy;
    b.onclick = () => drink(p.id);
    row.appendChild(b);
    d.appendChild(row);
    box.appendChild(d);
  });
}

/* --- 記録タブ --- */
function renderCodex(){
  const box = $('codexList'); box.innerHTML = '';
  PL.CHARACTERS.forEach(def => {
    const c = S.chars[def.id];
    const d = document.createElement('div');
    d.className = 'card' + (c.unlocked ? '' : ' locked');
    if (!c.unlocked){
      d.innerHTML = `<div class="ttl"><span>？？？</span></div><div class="dsc">まだ来店していません。</div>`;
      box.appendChild(d); return;
    }
    const recs = PL.FX_KEYS.map(k =>
      `<span class="tag ${PL.STATS[k].color}">${PL.STATS[k].icon}最高 ${Math.round(c.rec[k])}（${PL.TIERS[c.seen[k]]}）</span>`
    ).join('');
    const notes = c.notes.length
      ? c.notes.map(n => `<div class="dsc">Day${n.day}「${n.potion}」→ ${n.diff}</div>`).join('')
      : '<div class="dsc">記録なし</div>';
    d.innerHTML =
      `<div class="ttl"><span>${def.name}</span><span class="tag">試飲 ${c.drinks}</span></div>`+
      `<div class="dsc">${def.title}・${def.age}歳／代謝 ${def.metab.toFixed(2)}</div>`+
      `<div class="row">${recs}</div>`+
      `<div style="margin-top:6px;border-top:1px dotted rgba(255,255,255,.12);padding-top:5px">${notes}</div>`;
    box.appendChild(d);
  });

  const rl = $('recipeList'); rl.innerHTML = '';
  const keys = Object.keys(S.recipes);
  if (!keys.length){ rl.innerHTML = '<span class="empty">まだレシピがありません。</span>'; return; }
  keys.forEach(k => {
    const r = S.recipes[k];
    const d = document.createElement('div');
    d.className = 'card clickable';
    d.title = 'クリックで調合台にセット';
    d.innerHTML = `<div class="ttl"><span><span class="rank ${r.rank}">${r.rank}</span> ${r.name}</span></div>`+
                  `<div class="dsc">${r.mats.map(m=>PL.MATERIALS[m].icon).join('')} ／ ${PL.BASES[r.base].name}<br>Day${r.day} 発見</div>`;
    d.onclick = () => {
      S.craft.base = r.base;
      S.craft.slots = [r.mats[0]||null, r.mats[1]||null, r.mats[2]||null];
      switchTab('craft'); renderCraft(); save();
    };
    rl.appendChild(d);
  });
}

/* --- 依頼タブ --- */
function renderQuests(){
  const box = $('questList'); box.innerHTML = '';
  PL.QUESTS.forEach(q => {
    const done = !!S.quests[q.id];
    const d = document.createElement('div');
    d.className = 'card' + (done ? ' done' : '');
    d.innerHTML = `<div class="ttl"><span>${done?'✅':'⬜'} ${q.name}</span></div>`+
                  `<div class="dsc">${q.desc}</div>`+
                  `<div class="row"><span class="tag ${done?'mood':''}">報酬：${q.rewardText}</span></div>`;
    box.appendChild(d);
  });
}

/* --- タブ切り替え --- */
function switchTab(name){
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-'+name));
}

/* =========================================================
   起動
   ========================================================= */
function boot(){
  S = load() || newState();
  PL.Sfx.on = S.sound !== false;

  renderer = new PL.CharRenderer($('charSvg'));
  renderer.onPoke = () => {
    const c = S.chars[S.sel], def = charDef(S.sel);
    S.stats.pokes++;
    PL.Sfx.poke();
    if (Math.random() < 0.5) say(pick(def.lines.poke), 1800);
    if (c.soft >= 45 && Math.random() < 0.35) popup(pick(['ぷにっ','ぽよん','もちっ']), 'soft');
    // 押されるとガスが出やすい
    if (c.gas >= 40 && Math.random() < 0.3) doFart(S.sel);
    renderer.setExpression(c.soft>=60 ? 'shy' : 'surprise', 900);
  };
  if (!S.chars[S.sel] || !S.chars[S.sel].unlocked) S.sel = 'rizetta';
  renderer.setCharacter(charDef(S.sel));
  renderer.setState(viewState(S.chars[S.sel]));
  renderer.start();

  document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  $('btnCraft').onclick = craft;
  $('btnSleep').onclick = sleep;
  $('btnSound').onclick = () => {
    S.sound = !S.sound; PL.Sfx.on = S.sound;
    if (S.sound) PL.Sfx.ok();
    renderHud(); save();
  };
  $('btnReset').onclick = () => {
    if (!confirm('最初からやり直しますか？（記録はすべて消えます）')) return;
    localStorage.removeItem(SAVE_KEY);
    S = newState();
    selectChar('rizetta');
    log('工房をたたみ、新しく始めました。','warn');
    renderAll(); save();
  };

  // 待機中のオナラ
  setInterval(() => {
    if (busy) return;
    const c = S.chars[S.sel];
    if (c && c.unlocked && c.gas >= 45 && Math.random() < 0.28){
      doFart(S.sel); save();
    }
  }, 7000);

  renderAll();
  log('⚗ <b>もちもち調合工房</b> へようこそ。まずは <b>採取</b> から。','big');
  say(pick(charDef(S.sel).lines.greet), 3200);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
