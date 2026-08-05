/* =========================================================
   もちもち調合工房 — キャラクター描画 + ソフトボディ物理
   ・約7頭身のセミリアル体型（顔立ちはアニメ調）
   ・胴体シルエットと腹部の球を「ひとつの輪郭」として合成するので、
     膨らむほど実際に体の線がせり出す
   ・腹部はバネ質点のリング。押した位置が局所的にへこみ、波が伝播する
   ========================================================= */
window.PL = window.PL || {};

const SVGNS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI*2;

function el(tag, attrs){
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function lerp(a,b,t){ return a+(b-a)*t; }

/* 色ユーティリティ */
function hex2rgb(h){
  const n = parseInt(h.slice(1),16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}
function mix(a,b,t){
  const A = typeof a==='string'?hex2rgb(a):a, B = typeof b==='string'?hex2rgb(b):b;
  return `rgb(${Math.round(lerp(A[0],B[0],t))},${Math.round(lerp(A[1],B[1],t))},${Math.round(lerp(A[2],B[2],t))})`;
}

/* Catmull-Rom を三次ベジェに変換した閉パス */
function smoothClosedPath(pts){
  const n = pts.length;
  if (n < 3) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i=0;i<n;i++){
    const p0=pts[(i-1+n)%n], p1=pts[i], p2=pts[(i+1)%n], p3=pts[(i+2)%n];
    d += `C${(p1.x+(p2.x-p0.x)/6).toFixed(1)},${(p1.y+(p2.y-p0.y)/6).toFixed(1)} `+
         `${(p2.x-(p3.x-p1.x)/6).toFixed(1)},${(p2.y-(p3.y-p1.y)/6).toFixed(1)} `+
         `${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d+'Z';
}
/* 開いた滑らかパス */
function smoothOpenPath(pts){
  const n = pts.length;
  if (n < 2) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i=0;i<n-1;i++){
    const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(n-1,i+2)];
    d += `C${(p1.x+(p2.x-p0.x)/6).toFixed(1)},${(p1.y+(p2.y-p0.y)/6).toFixed(1)} `+
         `${(p2.x-(p3.x-p1.x)/6).toFixed(1)},${(p2.y-(p3.y-p1.y)/6).toFixed(1)} `+
         `${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/* ---------- ソフトボディ・リング ---------- */
class SoftRing {
  constructor(n){
    this.n = n;
    this.off = new Float64Array(n);
    this.vel = new Float64Array(n);
    this.acc = new Float64Array(n);
  }
  step(dt, k, damp, coup){
    const n=this.n, off=this.off, vel=this.vel, acc=this.acc;
    const sub = 2, h = dt/sub;
    for (let s=0;s<sub;s++){
      for (let i=0;i<n;i++){
        const prev = off[(i-1+n)%n], next = off[(i+1)%n];
        acc[i] = -k*off[i] - damp*vel[i] + coup*(prev+next-2*off[i]);
      }
      for (let i=0;i<n;i++){
        vel[i] += acc[i]*h;
        off[i] += vel[i]*h;
        if (off[i]> 34){ off[i]= 34; vel[i]*=-0.3; }
        if (off[i]<-26){ off[i]=-26; vel[i]*=-0.3; }
      }
    }
  }
  impulse(angle, amount, spread=3.2){
    const n=this.n;
    const c = ((angle/TAU)*n + n*4) % n;
    for (let i=0;i<n;i++){
      let d = Math.abs(i-c); d = Math.min(d, n-d);
      const w = Math.exp(-(d*d)/(2*spread*spread));
      if (w > 0.01) this.vel[i] += amount*w;
    }
  }
  pulse(amount){
    for (let i=0;i<this.n;i++) this.vel[i] += amount*(0.75+Math.random()*0.5);
  }
  /** 角度 theta における変位（線形補間） */
  at(theta){
    const n = this.n;
    const f = (((theta/TAU)*n) % n + n) % n;
    const i = Math.floor(f), t = f-i;
    return lerp(this.off[i], this.off[(i+1)%n], t);
  }
}
PL.SoftRing = SoftRing;

/* =========================================================
   キャラクター描画
   ========================================================= */
const VB = { w:300, h:470, cx:150 };

class CharRenderer {
  constructor(svg){
    this.svg = svg;
    svg.setAttribute('viewBox', `0 0 ${VB.w} ${VB.h}`);
    this.t = 0;
    this.belly = new SoftRing(32);
    this.flesh = new SoftRing(18);      // 胴体全体の揺れ
    this.parts = {};
    this.particles = [];
    this.pool = [];
    this.expr = 'auto';
    this.exprTimer = 0;
    this.squash = 0;
    this.onPoke = null;
    this.state = { belly:0, weight:0, gas:0, soft:30, mood:60 };
    this.char = null;
    this.geo = { bellyCx:VB.cx, bellyCy:230, bellyR:26 };
    this._build();
    this._bindPointer();
    this._raf = null;
  }

  /* ---------- DOM ---------- */
  _build(){
    const svg = this.svg;
    svg.innerHTML = '';
    const defs = el('defs');
    const P = this.parts;

    const linGrad = (id, x1,y1,x2,y2) => {
      const g = el('linearGradient', { id, x1, y1, x2, y2 });
      const s1 = el('stop',{offset:'0%'}), s2 = el('stop',{offset:'55%'}), s3 = el('stop',{offset:'100%'});
      g.appendChild(s1); g.appendChild(s2); g.appendChild(s3);
      defs.appendChild(g); return {s1,s2,s3};
    };
    const radGrad = (id, cx,cy,r) => {
      const g = el('radialGradient', { id, cx, cy, r });
      const s1 = el('stop',{offset:'0%'}), s2 = el('stop',{offset:'100%'});
      g.appendChild(s1); g.appendChild(s2);
      defs.appendChild(g); return {s1,s2};
    };

    this.gSkin  = linGrad('gSkin',  '18%','0%','88%','100%');
    this.gSkin2 = linGrad('gSkin2', '20%','0%','85%','100%');
    this.gCloth = linGrad('gCloth', '20%','0%','85%','100%');
    this.gSkirt = linGrad('gSkirt', '25%','0%','80%','100%');
    this.gHair  = linGrad('gHair',  '25%','0%','80%','100%');
    this.gShine = radGrad('gShine', '50%','50%','50%');
    this.gShine.s1.setAttribute('stop-color','#fff');
    this.gShine.s1.setAttribute('stop-opacity','.45');
    this.gShine.s2.setAttribute('stop-color','#fff');
    this.gShine.s2.setAttribute('stop-opacity','0');

    const blur = (id, sd) => {
      const f = el('filter', { id, x:'-60%', y:'-60%', width:'220%', height:'220%' });
      f.appendChild(el('feGaussianBlur', { stdDeviation:sd }));
      defs.appendChild(f);
    };
    blur('bl2', 2); blur('bl4', 4); blur('bl7', 7);

    // クリップ（毎フレーム d を更新）
    const mkClip = (id) => {
      const c = el('clipPath', { id });
      const p = el('path', { d:'' });
      c.appendChild(p); defs.appendChild(c); return p;
    };
    this.clipBodyPath = mkClip('clipBody');
    this.clipEyeLPath = mkClip('clipEyeL');
    this.clipEyeRPath = mkClip('clipEyeR');
    this.clipHeadPath = mkClip('clipHead');

    svg.appendChild(defs);
    const add = (tag, attrs, parent) => { const n = el(tag, attrs); (parent||svg).appendChild(n); return n; };

    P.shadow = add('ellipse', { cx:VB.cx, cy:441, rx:64, ry:9, fill:'rgba(0,0,0,.34)', filter:'url(#bl4)' });
    P.hairBack = add('path', { d:'', fill:'url(#gHair)' });

    // 脚
    P.legL = add('path', { d:'', fill:'url(#gSkin2)' });
    P.legR = add('path', { d:'', fill:'url(#gSkin2)' });
    P.legShL = add('path', { d:'', fill:'rgba(150,86,72,.20)', filter:'url(#bl4)' });
    P.legShR = add('path', { d:'', fill:'rgba(150,86,72,.20)', filter:'url(#bl4)' });
    P.shoeL = add('path', { d:'', fill:'#4a3f63' });
    P.shoeR = add('path', { d:'', fill:'#4a3f63' });

    // 胴体（素肌のシルエット）
    P.body = add('path', { d:'', fill:'url(#gSkin)' });
    P.bodyFx = add('g', { 'clip-path':'url(#clipBody)' });
    P.rim        = add('path', { d:'', fill:'none', stroke:'rgba(150,80,66,.34)', 'stroke-width':14, filter:'url(#bl7)' }, P.bodyFx);
    P.underBust  = add('path', { d:'', fill:'none', stroke:'rgba(150,80,66,.30)', 'stroke-width':6, filter:'url(#bl4)', 'stroke-linecap':'round' }, P.bodyFx);
    P.bellyShine = add('ellipse', { fill:'url(#gShine)' }, P.bodyFx);
    P.underBelly = add('path', { d:'', fill:'none', stroke:'rgba(146,74,62,.42)', 'stroke-width':7, filter:'url(#bl4)', 'stroke-linecap':'round' }, P.bodyFx);
    P.foldL = add('path', { d:'', fill:'none', stroke:'rgba(150,80,66,.26)', 'stroke-width':5, filter:'url(#bl4)', 'stroke-linecap':'round' }, P.bodyFx);
    P.foldR = add('path', { d:'', fill:'none', stroke:'rgba(150,80,66,.26)', 'stroke-width':5, filter:'url(#bl4)', 'stroke-linecap':'round' }, P.bodyFx);
    P.navel = add('path', { d:'', fill:'none', stroke:'rgba(140,74,60,.75)', 'stroke-width':3, 'stroke-linecap':'round', filter:'url(#bl2)' }, P.bodyFx);
    P.bodyLine = add('path', { d:'', fill:'none', stroke:'rgba(120,62,52,.40)', 'stroke-width':1.3 });

    // ボトムス → トップス の順（お腹が上に乗る）
    P.skirt   = add('path', { d:'', fill:'url(#gSkirt)' });
    P.skirtSh = add('path', { d:'', fill:'rgba(0,0,0,.18)', filter:'url(#bl4)' });
    P.bottomLines = add('path', { d:'', fill:'none', stroke:'rgba(0,0,0,.18)', 'stroke-width':1.4 });
    P.top     = add('path', { d:'', fill:'url(#gCloth)' });
    P.topSh   = add('path', { d:'', fill:'none', stroke:'rgba(0,0,0,.22)', 'stroke-width':5, filter:'url(#bl4)' });
    P.deco    = add('path', { d:'', fill:'none', stroke:'rgba(255,255,255,.55)', 'stroke-width':2, 'stroke-linecap':'round' });

    // 上着 → 腕 → 袖
    P.acc     = add('path', { d:'', fill:'rgba(255,255,255,.82)', stroke:'rgba(0,0,0,.12)', 'stroke-width':1 });
    P.armL = add('path', { d:'', fill:'url(#gSkin2)' });
    P.armR = add('path', { d:'', fill:'url(#gSkin2)' });
    P.armShL = add('path', { d:'', fill:'rgba(150,86,72,.18)', filter:'url(#bl4)' });
    P.armShR = add('path', { d:'', fill:'rgba(150,86,72,.18)', filter:'url(#bl4)' });
    P.sleeveL = add('path', { d:'', fill:'url(#gCloth)', stroke:'rgba(0,0,0,.12)', 'stroke-width':1 });
    P.sleeveR = add('path', { d:'', fill:'url(#gCloth)', stroke:'rgba(0,0,0,.12)', 'stroke-width':1 });

    P.hairSide = add('path', { d:'', fill:'url(#gHair)' });   // 肩から前に垂れる髪

    // 首・頭
    P.neck   = add('path', { d:'', fill:'url(#gSkin2)' });
    P.neckSh = add('path', { d:'', fill:'rgba(140,74,62,.34)', filter:'url(#bl4)' });
    P.head = add('g', {});
    const H = P.head;
    P.face  = add('path', { d:'', fill:'url(#gSkin)' }, H);
    P.earL  = add('path', { d:'', fill:'url(#gSkin2)' }, H);
    P.earR  = add('path', { d:'', fill:'url(#gSkin2)' }, H);
    P.faceFx = add('g', { 'clip-path':'url(#clipHead)' }, H);
    P.cheekSh = add('path', { d:'', fill:'none', stroke:'rgba(150,80,66,.28)', 'stroke-width':8, filter:'url(#bl7)' }, P.faceFx);
    P.blushL = add('ellipse', { rx:9, ry:4.6, filter:'url(#bl2)', opacity:.5 }, P.faceFx);
    P.blushR = add('ellipse', { rx:9, ry:4.6, filter:'url(#bl2)', opacity:.5 }, P.faceFx);

    P.eyeWL = add('path', { d:'', fill:'#fdf7f6' }, H);
    P.eyeWR = add('path', { d:'', fill:'#fdf7f6' }, H);
    P.irisL = add('g', { 'clip-path':'url(#clipEyeL)' }, H);
    P.irisR = add('g', { 'clip-path':'url(#clipEyeR)' }, H);
    P.iL  = add('circle', { r:5 }, P.irisL);
    P.iLd = add('circle', { r:5, fill:'none', 'stroke-width':1.4, stroke:'rgba(30,16,30,.5)' }, P.irisL);
    P.pL  = add('circle', { r:2.1, fill:'#241626' }, P.irisL);
    P.hL  = add('circle', { r:1.9, fill:'#fff' }, P.irisL);
    P.hL2 = add('circle', { r:1.0, fill:'rgba(255,255,255,.7)' }, P.irisL);
    P.iR  = add('circle', { r:5 }, P.irisR);
    P.iRd = add('circle', { r:5, fill:'none', 'stroke-width':1.4, stroke:'rgba(30,16,30,.5)' }, P.irisR);
    P.pR  = add('circle', { r:2.1, fill:'#241626' }, P.irisR);
    P.hR  = add('circle', { r:1.9, fill:'#fff' }, P.irisR);
    P.hR2 = add('circle', { r:1.0, fill:'rgba(255,255,255,.7)' }, P.irisR);

    P.lashL = add('path', { d:'', fill:'none', stroke:'#3d2436', 'stroke-width':2.6, 'stroke-linecap':'round' }, H);
    P.lashR = add('path', { d:'', fill:'none', stroke:'#3d2436', 'stroke-width':2.6, 'stroke-linecap':'round' }, H);
    P.lidL  = add('path', { d:'', fill:'none', stroke:'rgba(120,70,80,.5)', 'stroke-width':1, 'stroke-linecap':'round' }, H);
    P.lidR  = add('path', { d:'', fill:'none', stroke:'rgba(120,70,80,.5)', 'stroke-width':1, 'stroke-linecap':'round' }, H);
    P.browL = add('path', { d:'', fill:'none', 'stroke-width':1.9, 'stroke-linecap':'round', opacity:.85 }, H);
    P.browR = add('path', { d:'', fill:'none', 'stroke-width':1.9, 'stroke-linecap':'round', opacity:.85 }, H);
    P.nose  = add('path', { d:'', fill:'none', stroke:'rgba(150,88,76,.55)', 'stroke-width':1.4, 'stroke-linecap':'round' }, H);
    P.mouth = add('path', { d:'', fill:'none', stroke:'#b0575c', 'stroke-width':1.8, 'stroke-linecap':'round' }, H);
    P.lip   = add('path', { d:'', fill:'rgba(200,105,110,.5)' }, H);

    P.hairFront = add('path', { d:'', fill:'url(#gHair)' }, H);
    P.hairHi    = add('path', { d:'', fill:'rgba(255,255,255,.20)', filter:'url(#bl4)' }, H);
    P.glasses   = add('g', {}, H);

    // エフェクト
    P.fx = add('g', {});
    P.sweat = add('g', { opacity:0 }, P.fx);
    for (let i=0;i<3;i++){
      P.sweat.appendChild(el('path', { d:'M0,0 q3.5,5 0,8 q-3.5,-3 0,-8', fill:'rgba(160,215,245,.9)',
        stroke:'rgba(90,160,200,.8)', 'stroke-width':.7, transform:`translate(${i*15-15},${i*4})` }));
    }
    P.wobL = add('path', { d:'', fill:'none', stroke:'rgba(255,255,255,.55)', 'stroke-width':2.2, 'stroke-linecap':'round', opacity:0 }, P.fx);
    P.wobR = add('path', { d:'', fill:'none', stroke:'rgba(255,255,255,.55)', 'stroke-width':2.2, 'stroke-linecap':'round', opacity:0 }, P.fx);
    P.pgroup = add('g', {}, P.fx);
  }

  /* ---------- ポインタ ---------- */
  _bindPointer(){
    const svg = this.svg;
    let down = false, lastAng = 0;
    const toLocal = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const m = svg.getScreenCTM();
      return m ? pt.matrixTransform(m.inverse()) : null;
    };
    const hit = (p) => {
      const g = this.geo;
      const dx = p.x-g.bellyCx, dy = p.y-g.bellyCy;
      const d = Math.hypot(dx,dy);
      return { d, ang:Math.atan2(dy,dx), inside: d < g.bellyR+18 };
    };
    const press = (e) => {
      const p = toLocal(e); if (!p) return;
      const h = hit(p); if (!h.inside) return;
      down = true; lastAng = h.ang;
      if (svg.setPointerCapture && e.pointerId != null){
        try { svg.setPointerCapture(e.pointerId); } catch(_){}
      }
      const soft = this.state.soft/100;
      this.belly.impulse(h.ang, -(60+soft*120), 2.4);
      this.flesh.impulse(h.ang, -(10+soft*22), 3);
      this.showWobble();
      if (this.onPoke) this.onPoke(h);
      e.preventDefault();
    };
    const move = (e) => {
      if (!down) return;
      const p = toLocal(e); if (!p) return;
      const h = hit(p);
      let da = h.ang-lastAng;
      while (da >  Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      if (Math.abs(da) > 0.06){
        const soft = this.state.soft/100;
        this.belly.impulse(h.ang, -(18+soft*40), 2.0);
        lastAng = h.ang;
        this.showWobble();
      }
    };
    const up = () => {
      if (!down) return;
      down = false;
      const soft = this.state.soft/100;
      this.belly.impulse(lastAng, 34+soft*70, 2.8);
    };
    svg.addEventListener('pointerdown', press);
    svg.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    svg.addEventListener('pointerleave', up);
  }

  /* ---------- 外部API ---------- */
  setCharacter(def){
    this.char = def;
    const p = def.palette;
    const setLin = (g,a,b,c) => {
      g.s1.setAttribute('stop-color', a);
      g.s2.setAttribute('stop-color', b);
      g.s3.setAttribute('stop-color', c);
    };
    setLin(this.gSkin,  mix(p.skin,'#fff8f2',.32), p.skin, mix(p.skin,'#b8705a',.30));
    setLin(this.gSkin2, mix(p.skin,'#fff8f2',.24), p.skin, mix(p.skin,'#b8705a',.28));
    setLin(this.gCloth, mix(p.cloth,'#ffffff',.35), p.cloth, p.cloth2);
    setLin(this.gSkirt, mix(p.cloth2,'#ffffff',.28), p.cloth2, mix(p.cloth2,'#000000',.35));
    setLin(this.gHair,  mix(p.hair,'#ffffff',.30), p.hair, p.hair2);

    const P = this.parts;
    P.blushL.setAttribute('fill', p.blush);
    P.blushR.setAttribute('fill', p.blush);
    P.iL.setAttribute('fill', p.eye); P.iR.setAttribute('fill', p.eye);
    const browCol = mix(p.hair2, '#3a2430', .45);
    P.browL.setAttribute('stroke', browCol); P.browR.setAttribute('stroke', browCol);
    P.lashL.setAttribute('stroke', mix(p.hair2,'#241624',.55));
    P.lashR.setAttribute('stroke', mix(p.hair2,'#241624',.55));
    P.shoeL.setAttribute('fill', mix(p.cloth2,'#000000',.45));
    P.shoeR.setAttribute('fill', mix(p.cloth2,'#000000',.45));
    P.acc.setAttribute('fill', def.accessory==='coat' ? 'rgba(252,252,255,.92)' : 'rgba(255,255,255,.82)');

    P.glasses.innerHTML = '';
    if (def.accessory === 'glasses'){
      const mk = (cx) => el('rect', { x:cx-9, y:-6.5, width:18, height:13, rx:5,
        fill:'rgba(210,240,255,.16)', stroke:'rgba(215,238,255,.85)', 'stroke-width':1.3 });
      P.glasses.appendChild(mk(-11)); P.glasses.appendChild(mk(11));
      P.glasses.appendChild(el('path',{ d:'M-2,0 H2', stroke:'rgba(215,238,255,.85)', 'stroke-width':1.3 }));
    }
    this.belly.off.fill(0); this.belly.vel.fill(0);
    this.flesh.off.fill(0); this.flesh.vel.fill(0);
  }

  setState(s){ this.state = s; }
  setExpression(e, ms){ this.expr = e; this.exprTimer = (ms||0)/1000; }
  showWobble(){ this._wobble = 1; }

  inflatePulse(amount){
    this.belly.pulse(amount);
    this.flesh.pulse(amount*0.4);
    this.showWobble();
  }

  fartBurst(power=1){
    const g = this.geo;
    const n = Math.round(5+power*7);
    for (let i=0;i<n;i++){
      const side = Math.random()<.5 ? -1 : 1;
      this.particles.push({ type:'gas',
        x: g.bellyCx + side*(g.bellyR*0.6+6) + (Math.random()-.5)*10,
        y: g.bellyCy + g.bellyR*0.5 + Math.random()*20,
        vx: side*(22+Math.random()*44)*power, vy: 6+Math.random()*24,
        r: 4+Math.random()*8*power, life:0, max:0.75+Math.random()*0.6 });
    }
    this.belly.impulse(Math.PI/2, -50*power, 4);
    this.belly.pulse(-12*power);
  }

  sparkle(n=10){
    const g = this.geo;
    for (let i=0;i<n;i++){
      const a = Math.random()*TAU;
      this.particles.push({ type:'star',
        x: g.bellyCx + Math.cos(a)*(g.bellyR+8), y: g.bellyCy + Math.sin(a)*(g.bellyR+8),
        vx: Math.cos(a)*28, vy: Math.sin(a)*28-18, r:2.5+Math.random()*2.5,
        life:0, max:0.7+Math.random()*0.4 });
    }
  }

  start(){
    if (this._raf) return;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now-last)/1000); last = now;
      this.update(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop(){ if (this._raf){ cancelAnimationFrame(this._raf); this._raf=null; } }

  update(dt){
    this.t += dt;
    const soft = clamp(this.state.soft,0,100)/100;
    const k    = 120 - soft*68;
    const damp = 5.6 - soft*3.8;
    const coup = 44 + soft*26;
    this.belly.step(dt, k, damp, coup);
    this.flesh.step(dt, k*1.25, damp*1.3, coup*0.8);

    this._idle = (this._idle||0) - dt;
    if (this._idle <= 0){
      this._idle = 1.8 + Math.random()*2.4;
      const amp = (1.5+soft*8) * (0.4 + this.state.belly/100);
      this.belly.impulse(Math.random()*TAU, amp, 4);
    }
    if (this.exprTimer > 0){ this.exprTimer -= dt; if (this.exprTimer<=0) this.expr='auto'; }
    this._wobble = Math.max(0, (this._wobble||0) - dt*1.5);
    this.squash *= Math.exp(-dt*4);

    this._layout();
    this._particles(dt);
  }

  /* =========================================================
     体型レイアウト
     ========================================================= */
  _layout(){
    const P = this.parts, S = this.state;
    const belly = clamp(S.belly,0,100), weight = clamp(S.weight,0,100);
    const gas = clamp(S.gas,0,100), soft = clamp(S.soft,0,100), mood = clamp(S.mood,0,100);
    const wt = weight/100;
    const cx = VB.cx;
    const OF = (this.char && this.char.outfit) || { top:'blouse', sleeve:1, bottom:'skirt', over:null };

    const breathe = Math.sin(this.t*1.45)*(0.9 + belly/100*2.2);
    const bob = Math.sin(this.t*1.45)*1.3;
    const sq = this.squash;

    /* --- 骨格の基準 y --- */
    const yNeck = 108, yShoulder = 120, yBust = 150, yUnderBust = 174,
          yWaist = 198, yLowBelly = 222, yHip = 244, yCrotch = 262, yBottom = 282,
          yKnee = 336, yAnkle = 424, yFoot = 438;

    /* --- 腹部のふくらみ（ガウス関数で滑らかに膨らませる） --- */
    const bulgeA  = belly*0.42 + weight*0.10;                       // 半幅の増分
    const bulgeCy = 216 + belly*0.10 + weight*0.05 + breathe*0.25;  // ふくらみの中心
    const bulgeS  = 26 + belly*0.30 + weight*0.12;                  // 縦の半径
    // 楕円状のふくらみ。丸みが出るよう指数を 0.72 にしている
    const gaussAt = (y) => {
      const t = (y-bulgeCy)/bulgeS;
      const v = 1 - t*t;
      return v <= 0 ? 0 : Math.pow(v, 0.72);
    };

    /* --- 素の体型（半幅） --- */
    const fl = (i) => this.flesh.off[i % this.flesh.n] * (0.30 + soft/100*0.8);
    const prof = [
      { y:yNeck,      w:10.5 + wt*1.5 },
      { y:yShoulder,  w:33.0 + wt*7  + fl(0) },
      { y:132,        w:36.5 + wt*8  + fl(1) },
      { y:yBust,      w:35.0 + wt*12 + fl(2) },
      { y:yUnderBust, w:29.5 + wt*18 + fl(3) },
      { y:yWaist,     w:26.0 + wt*24 + fl(4) },
      { y:yLowBelly,  w:29.0 + wt*26 + fl(5) },
      { y:yHip,       w:39.0 + wt*25 + fl(6) },
      { y:yCrotch,    w:36.0 + wt*22 + fl(7) },
      { y:yBottom,    w:21.0 + wt*13 }
    ];
    const profAt = (y) => {
      if (y <= prof[0].y) return prof[0].w;
      for (let i=1;i<prof.length;i++){
        if (y <= prof[i].y){
          const a = prof[i-1], b = prof[i];
          const t = (y-a.y)/(b.y-a.y);
          return lerp(a.w, b.w, t*t*(3-2*t));
        }
      }
      return prof[prof.length-1].w;
    };

    /* --- 押した場所が局所的に揺れる（ふくらみの範囲だけ） --- */
    const perturb = (y, right) => {
      const g = gaussAt(y);
      if (g < 0.02) return 0;
      const base = Math.asin(clamp((y-bulgeCy)/bulgeS, -1, 1));
      const th = right ? base : Math.PI - base;
      return this.belly.at(th) * g * (0.5 + soft/100*0.9);
    };
    const halfW = (y, right) =>
      profAt(y) + bulgeA*gaussAt(y) + perturb(y,right) + breathe*0.30*gaussAt(y);

    this.geo = { bellyCx:cx, bellyCy:bulgeCy, bellyR: profAt(bulgeCy) + bulgeA };

    /* --- シルエット --- */
    const rightPts = [], leftPts = [];
    for (let y=yNeck; y<=yBottom+0.01; y+=4.5){
      rightPts.push({ x: cx + halfW(y,true),  y });
      leftPts .push({ x: cx - halfW(y,false), y });
    }
    const bodyD = smoothClosedPath(rightPts.concat(leftPts.reverse()));
    P.body.setAttribute('d', bodyD);
    P.bodyLine.setAttribute('d', bodyD);
    this.clipBodyPath.setAttribute('d', bodyD);

    /* --- 体の陰影 --- */
    P.rim.setAttribute('d', bodyD);
    const bulge = clamp(bulgeA/26, 0, 1);
    const bR = profAt(bulgeCy) + bulgeA;

    P.bellyShine.setAttribute('cx', cx - bR*0.28);
    P.bellyShine.setAttribute('cy', bulgeCy - bulgeS*0.34);
    P.bellyShine.setAttribute('rx', bR*0.62);
    P.bellyShine.setAttribute('ry', bulgeS*0.55);
    P.bellyShine.setAttribute('opacity', (0.42 + soft/100*0.40).toFixed(2));

    P.underBust.setAttribute('d',
      `M${cx-profAt(yUnderBust)*0.70},${yUnderBust-4} Q${cx},${yUnderBust+8} ${cx+profAt(yUnderBust)*0.70},${yUnderBust-4}`);

    const ubY = bulgeCy + bulgeS*0.74;
    P.underBelly.setAttribute('d',
      `M${cx-bR*0.74},${ubY-6} Q${cx},${ubY+bulgeS*0.26} ${cx+bR*0.74},${ubY-6}`);
    P.underBelly.setAttribute('opacity', (0.20+bulge*0.70).toFixed(2));

    const foldA = clamp((weight-45)/55, 0, 1);
    P.foldL.setAttribute('d', `M${cx-profAt(yWaist)*0.96},${yWaist-6} q8,9 1,17`);
    P.foldR.setAttribute('d', `M${cx+profAt(yWaist)*0.96},${yWaist-6} q-8,9 -1,17`);
    P.foldL.setAttribute('opacity', foldA); P.foldR.setAttribute('opacity', foldA);

    const navY = bulgeCy + bulgeS*0.20;
    P.navel.setAttribute('d', `M${cx},${navY-2.5} q${2.2+belly*0.016},3 0,${6+belly*0.03}`);

    /* --- 脚 --- */
    const thigh = 17.5 + wt*26, calf = 12.5 + wt*15, ankleW = 6 + wt*4.5;
    const legDX = 13 + wt*10, kneeDX = 12.5 + wt*7, ankDX = 11 + wt*5;
    [[-1,'L'],[1,'R']].forEach(([s,tag]) => {
      const pts = [
        { x: cx + s*legDX,         y: yHip+4,   w: thigh },
        { x: cx + s*(legDX*0.94),  y: yKnee-34, w: thigh*0.80 },
        { x: cx + s*kneeDX,        y: yKnee,    w: calf*1.10 },
        { x: cx + s*(kneeDX*0.98), y: yKnee+40, w: calf },
        { x: cx + s*ankDX,         y: yAnkle,   w: ankleW }
      ];
      P['leg'+tag].setAttribute('d', this._tube(pts));
      P['legSh'+tag].setAttribute('d', this._tube(pts.map(p => ({ x:p.x - s*p.w*0.42, y:p.y, w:p.w*0.5 }))));
      const fx = cx + s*ankDX;
      P['shoe'+tag].setAttribute('d',
        `M${fx-7},${yAnkle-2} q7,-3 13,1 L${fx+7},${yFoot-3} q0,4 -5,4 h-14 q-4,0 -4,-4 Z`);
    });

    /* --- 腕（体の輪郭の外側に沿って垂らす） --- */
    const armTop = 14.5 + wt*12, armMid = 11.5 + wt*9, armEnd = 7 + wt*4;
    const elbowY = 202, wristY = 262;
    const shoulderHalf = profAt(132);
    const armPts = {};
    [[-1,'L'],[1,'R']].forEach(([s,tag]) => {
      const right = s>0;
      const swing = Math.sin(this.t*1.45 + (right?0.6:0))*1.5;
      const natural = profAt(yBust)*0.98;
      let bulgeX = 0;
      for (let y=180; y<=250; y+=5) bulgeX = Math.max(bulgeX, halfW(y,right));
      let out = clamp(bulgeX*0.62, natural, natural + 30);
      const elX = out + armMid*0.95, wrX = out + armEnd*1.05;
      armPts[tag] = [
        { x: cx + s*(shoulderHalf + armTop*0.04),                    y: yShoulder+3,     w: armTop },
        { x: cx + s*Math.max(halfW(172,right)+armMid*1.0, elX*0.88), y: 172,             w: armMid*1.15 },
        { x: cx + s*elX,       y: elbowY+swing,    w: armMid },
        { x: cx + s*wrX,       y: wristY+swing,    w: armEnd },
        { x: cx + s*(wrX+1.5), y: wristY+18+swing, w: armEnd*0.92 }
      ];
      P['arm'+tag].setAttribute('d', this._tube(armPts[tag]));
      P['armSh'+tag].setAttribute('d', this._tube(armPts[tag].map(p => ({ x:p.x - s*p.w*0.45, y:p.y, w:p.w*0.45 }))));
    });

    /* =====================================================
       服（キャラごとに形が変わる）
       ===================================================== */
    const TOPS = {
      shirt:  { drop:0,   inset:1,  neck:8,  hem:0 },
      blouse: { drop:0,   inset:1,  neck:11, hem:2 },
      tank:   { drop:2.5, inset:9,  neck:13, hem:0 },
      cami:   { drop:4.5, inset:14, neck:16, hem:0 }
    };
    const T = TOPS[OF.top] || TOPS.blouse;

    // 裾：お腹がせり出すほど短く、中央がめくれ上がる
    const Wb = (profAt(bulgeCy) + bulgeA)*1.02;        // ふくらみの横半径（実際の体幅に合わせる）
    const arc = (x) => { const t=(x-cx)/Wb, v=1-t*t; return v<=0 ? 0 : Math.sqrt(v); };
    const hemBase = yHip + 2 + T.hem - Math.max(0, bulgeA-6)*1.00;
    const hemRise = Math.min(hemBase-(yUnderBust+6), Math.max(0, bulgeA-6)*1.45);
    const hemAt = (x) => Math.max(yUnderBust+8, hemBase - hemRise*arc(x));

    const yTopStart = yShoulder - 2 + T.drop;
    const colR = [], colL = [];
    for (let y=yTopStart; y<=hemBase+0.01; y+=4.5){
      colR.push({ x: cx + halfW(y,true) *1.03, y });
      colL.push({ x: cx - halfW(y,false)*1.03, y });
    }
    const xTopR = colR[0].x, xTopL = colL[0].x;
    const xHemR = colR[colR.length-1].x, xHemL = colL[colL.length-1].x;
    const hemPts = [];
    for (let x=xHemL; x<=xHemR+0.01; x+=6) hemPts.push({ x, y: hemAt(x) });
    P.top.setAttribute('d', smoothClosedPath(
      colL.concat(
        hemPts,
        colR.slice().reverse(),
        [{ x: xTopR - T.inset, y: yTopStart-1 },
         { x: cx,              y: yShoulder + T.neck },
         { x: xTopL + T.inset, y: yTopStart-1 }]
      )
    ));
    P.topSh.setAttribute('d', smoothOpenPath(hemPts.map(p => ({ x:p.x, y:p.y+3 }))));

    // 袖
    const sleeveCut = { 0:0, 1:2, 2:5 }[OF.sleeve] || 0;
    ['L','R'].forEach(tag => {
      const node = P['sleeve'+tag];
      if (!sleeveCut){ node.setAttribute('opacity', 0); return; }
      node.setAttribute('opacity', 1);
      node.setAttribute('d', this._tube(
        armPts[tag].slice(0, sleeveCut).map((p,i) => ({ x:p.x, y:p.y, w:p.w*(1.16 - i*0.02) }))
      ));
    });

    // ボトムス
    const hipW = profAt(yHip)*1.04;
    const beltY = yHip - 4;
    const beltDrop = Math.min(yCrotch+4-beltY, Math.max(0, bulgeA-6)*1.20);
    const beltAt = (x) => beltY + beltDrop*arc(x);
    const topEdge = [];
    for (let x=cx-hipW; x<=cx+hipW+0.01; x+=6) topEdge.push({ x, y: beltAt(x) });

    let bottomPts, lines = '';
    if (OF.bottom === 'shorts'){
      const lw = thigh*0.62, sb = yCrotch + 26 + wt*8;
      bottomPts = topEdge.concat([
        { x: cx+hipW,              y: beltAt(cx+hipW)+18 },
        { x: cx+legDX+lw*1.05,     y: sb-14 },
        { x: cx+legDX+lw,          y: sb },
        { x: cx+legDX-lw*0.86,     y: sb-1 },
        { x: cx+1.5,               y: yCrotch+15 },
        { x: cx-1.5,               y: yCrotch+15 },
        { x: cx-legDX+lw*0.86,     y: sb-1 },
        { x: cx-legDX-lw,          y: sb },
        { x: cx-legDX-lw*1.05,     y: sb-14 },
        { x: cx-hipW,              y: beltAt(cx-hipW)+18 }
      ]);
    } else {
      const spec = {
        skirt:     { flare:1.26, len:yCrotch+46 },
        longskirt: { flare:1.14, len:yKnee+14 },
        pleated:   { flare:1.22, len:yCrotch+58 },
        pencil:    { flare:0.99, len:yKnee-10 }
      }[OF.bottom] || { flare:1.26, len:yCrotch+46 };
      const F = hipW*spec.flare + 6, L = spec.len;
      bottomPts = topEdge.concat([
        { x: cx+hipW+2,   y: beltAt(cx+hipW)+14 },
        { x: cx+F,        y: L-10 },
        { x: cx+F*0.88,   y: L },
        { x: cx,          y: L+7 },
        { x: cx-F*0.88,   y: L },
        { x: cx-F,        y: L-10 },
        { x: cx-hipW-2,   y: beltAt(cx-hipW)+14 }
      ]);
      if (OF.bottom === 'pleated'){
        for (let i=-2;i<=2;i++){
          const xt = cx + i*hipW*0.42, xb = cx + i*F*0.46;
          lines += `M${xt},${beltAt(xt)+8} L${xb},${L-4} `;
        }
      }
    }
    P.skirt.setAttribute('d', smoothClosedPath(bottomPts));
    P.bottomLines.setAttribute('d', lines);
    const bl = bottomPts[bottomPts.length-4];
    P.skirtSh.setAttribute('d',
      `M${cx-hipW},${bl.y-24} Q${cx},${bl.y-6} ${cx+hipW},${bl.y-24} L${cx+hipW},${bl.y+6} L${cx-hipW},${bl.y+6} Z`);
    P.skirtSh.setAttribute('opacity', .28);

    // 襟もと
    if (OF.top === 'shirt'){
      P.deco.setAttribute('d',
        `M${cx-11},${yShoulder+T.neck-7} L${cx-3},${yShoulder+T.neck+6} L${cx+3},${yShoulder+T.neck+6} L${cx+11},${yShoulder+T.neck-7}`);
    } else if (OF.top === 'blouse'){
      P.deco.setAttribute('d',
        `M${cx-11},${yShoulder+T.neck-5} Q${cx},${yShoulder+T.neck+6} ${cx+11},${yShoulder+T.neck-5}`+
        `M${cx},${yShoulder+T.neck+3} l-5,7 h10 Z`);
    } else {
      P.deco.setAttribute('d', '');
    }

    // 上着（エプロン／白衣／カーディガン）
    const over = OF.over;
    if (over === 'apron'){
      const aw = profAt(yBust)*0.30;
      const bibBot = Math.min(hemAt(cx)-3, yWaist);
      const panelTop = beltAt(cx) + 4;
      const panelBot = (OF.bottom==='shorts' ? yCrotch+34 : yCrotch+40);
      const pw = hipW*0.86;
      P.acc.setAttribute('d',
        `M${cx-aw},${yBust-12} Q${cx},${yBust-19} ${cx+aw},${yBust-12} `+
        `L${cx+aw*1.06},${bibBot-4} Q${cx},${bibBot+3} ${cx-aw*1.06},${bibBot-4} Z `+
        `M${cx-pw},${panelTop+6} Q${cx},${panelTop-3} ${cx+pw},${panelTop+6} `+
        `L${cx+pw*1.02},${panelBot} Q${cx},${panelBot+7} ${cx-pw*1.02},${panelBot} Z`);
      P.acc.setAttribute('fill', 'rgba(255,255,255,.80)');
      P.acc.setAttribute('opacity', .78);
    } else if (over === 'coat' || over === 'cardigan'){
      const bot = over==='coat' ? yCrotch+26 : yHip+8;
      let d = '';
      for (const sd of [-1,1]){
        const outer = [], inner = [];
        for (let y=yShoulder-1; y<=bot+0.01; y+=5){
          const hwv = halfW(Math.min(y, yBottom), sd>0);
          outer.push({ x: cx + sd*hwv*1.05,        y });
          inner.push({ x: cx + sd*(hwv*0.36 + 4),  y });
        }
        d += smoothClosedPath(outer.concat(inner.reverse()));
      }
      P.acc.setAttribute('d', d);
      P.acc.setAttribute('fill', over==='coat'
        ? 'rgba(250,250,255,.95)'
        : (this.char ? mix(this.char.palette.cloth, '#ffffff', .12) : '#ddd'));
      P.acc.setAttribute('opacity', over==='coat' ? .95 : .9);
    } else {
      P.acc.setAttribute('opacity', 0);
    }

    /* --- 首・頭 --- */
    const hrx = 22.5 + wt*1.7, hry = 28.5 + wt*1.3;
    const hy = 74 + bob + sq*4;
    P.neck.setAttribute('d',
      `M${cx-8.5},${hy+hry*0.62} q8.5,5 17,0 L${cx+11},${yNeck+6} q-11,5 -22,0 Z`);
    P.neckSh.setAttribute('d',
      `M${cx-10},${hy+hry*0.66} q10,9 20,0 q-2,9 -10,9 q-8,0 -10,-9 Z`);
    this._bodyHalf = profAt(yBust);
    this._head(cx, hy, hrx, hry, mood, Math.max(belly,gas));
    if (this.char && this.char.accessory === 'glasses'){
      P.glasses.setAttribute('transform', `translate(${cx},${hy+hry*0.18})`);
    }

    /* --- エフェクト --- */
    const wob = this._wobble||0;
    P.wobL.setAttribute('d', `M${cx-halfW(bulgeCy,false)-9},${bulgeCy-7} q-6,7 0,14`);
    P.wobR.setAttribute('d', `M${cx+halfW(bulgeCy,true)+9},${bulgeCy-7} q6,7 0,14`);
    P.wobL.setAttribute('opacity', wob*.9); P.wobR.setAttribute('opacity', wob*.9);

    const strain = Math.max(belly, gas);
    P.sweat.setAttribute('opacity', strain>58 ? clamp((strain-58)/28,0,1) : 0);
    P.sweat.setAttribute('transform', `translate(${cx+hrx*0.85},${hy-hry*0.35})`);

    P.shadow.setAttribute('rx', 44 + bulgeA*0.42 + wt*14);
  }

  /* 太さの変わるチューブ（手足） */
  _tube(pts){
    const rightSide = [], leftSide = [];
    for (let i=0;i<pts.length;i++){
      const p = pts[i];
      const prev = pts[Math.max(0,i-1)], next = pts[Math.min(pts.length-1,i+1)];
      const dx = next.x-prev.x, dy = next.y-prev.y;
      const len = Math.hypot(dx,dy)||1;
      const nx = -dy/len, ny = dx/len;
      rightSide.push({ x:p.x+nx*p.w/2, y:p.y+ny*p.w/2 });
      leftSide .push({ x:p.x-nx*p.w/2, y:p.y-ny*p.w/2 });
    }
    const last = pts[pts.length-1], first = pts[0];
    return smoothClosedPath(rightSide.concat(
      [{ x:last.x, y:last.y+last.w*0.42 }],
      leftSide.reverse(),
      [{ x:first.x, y:first.y-first.w*0.30 }]
    ));
  }

  /* =========================================================
     顔
     ========================================================= */
  _head(cx, cy, rx, ry, mood, strain){
    const P = this.parts;
    let e = this.expr;
    if (e === 'auto' || !e){
      e = strain>=88 ? 'strain' : strain>=62 ? 'shy' : mood>=78 ? 'happy' : 'normal';
    }

    const faceD =
      `M${cx-rx},${cy-ry*0.08} `+
      `C${cx-rx*1.02},${cy-ry*1.20} ${cx+rx*1.02},${cy-ry*1.20} ${cx+rx},${cy-ry*0.08} `+
      `C${cx+rx*0.97},${cy+ry*0.40} ${cx+rx*0.52},${cy+ry*0.84} ${cx},${cy+ry} `+
      `C${cx-rx*0.52},${cy+ry*0.84} ${cx-rx*0.97},${cy+ry*0.40} ${cx-rx},${cy-ry*0.08} Z`;
    P.face.setAttribute('d', faceD);
    this.clipHeadPath.setAttribute('d', faceD);
    P.earL.setAttribute('d', `M${cx-rx*0.96},${cy+ry*0.02} q-5,-2 -5,5 q0,7 5,7 Z`);
    P.earR.setAttribute('d', `M${cx+rx*0.96},${cy+ry*0.02} q5,-2 5,5 q0,7 -5,7 Z`);
    P.cheekSh.setAttribute('d',
      `M${cx-rx*0.86},${cy+ry*0.18} Q${cx-rx*0.5},${cy+ry*0.86} ${cx},${cy+ry*0.98}`+
      `M${cx+rx*0.86},${cy+ry*0.18} Q${cx+rx*0.5},${cy+ry*0.86} ${cx},${cy+ry*0.98}`);

    // 目
    const eyDX = rx*0.53, eyY = cy+ry*0.16, ew = rx*0.34, eh = ew*0.60;
    const blink = (Math.sin(this.t*0.9) > 0.988) ? 0.1 : 1;

    const drawEye = (s) => {
      const R = s>0;
      const x = cx + s*eyDX;
      const eyeW = R ? P.eyeWR : P.eyeWL;
      const clip = R ? this.clipEyeRPath : this.clipEyeLPath;
      const irisG= R ? P.irisR : P.irisL;
      const iris = R ? P.iR : P.iL, ring = R ? P.iRd : P.iLd;
      const pup  = R ? P.pR : P.pL, hi = R ? P.hR : P.hL, hi2 = R ? P.hR2 : P.hL2;
      const lash = R ? P.lashR : P.lashL, lid = R ? P.lidR : P.lidL;
      const brow = R ? P.browR : P.browL;

      let h = eh * blink;
      if (e==='surprise') h = eh*1.25;
      if (e==='shy')      h = eh*0.62;

      if (e==='happy' || e==='strain'){
        eyeW.setAttribute('d','');
        irisG.setAttribute('opacity',0);
        lid.setAttribute('opacity',0);
        lash.setAttribute('opacity',1);
        lash.setAttribute('stroke-width', 2.8);
        lash.setAttribute('d', e==='happy'
          ? `M${x-ew},${eyY+h*0.6} q${ew},${-h*2.4} ${ew*2},0`
          : `M${x-ew},${eyY-h*0.5} q${ew},${h*2.0} ${ew*2},0`);
      } else {
        irisG.setAttribute('opacity',1);
        lash.setAttribute('opacity',1);
        lash.setAttribute('stroke-width', 2.6);
        const eyeD =
          `M${x-ew},${eyY+h*0.10} `+
          `C${x-ew*0.55},${eyY-h*1.5} ${x+ew*0.55},${eyY-h*1.45} ${x+ew},${eyY-h*0.25} `+
          `C${x+ew*0.5},${eyY+h*1.25} ${x-ew*0.5},${eyY+h*1.3} ${x-ew},${eyY+h*0.10} Z`;
        eyeW.setAttribute('d', eyeD);
        clip.setAttribute('d', eyeD);

        const ir = Math.min(ew*0.55, h*1.15);
        [iris,ring].forEach(n => { n.setAttribute('cx',x); n.setAttribute('cy',eyY); n.setAttribute('r',ir); });
        pup.setAttribute('cx',x); pup.setAttribute('cy',eyY);
        pup.setAttribute('r', ir*(e==='surprise'?0.30:0.42));
        hi.setAttribute('cx', x-ir*0.38); hi.setAttribute('cy', eyY-ir*0.42); hi.setAttribute('r', ir*0.30);
        hi2.setAttribute('cx', x+ir*0.34); hi2.setAttribute('cy', eyY+ir*0.36); hi2.setAttribute('r', ir*0.17);

        lash.setAttribute('d',
          `M${x-ew*1.04},${eyY+h*0.06} C${x-ew*0.55},${eyY-h*1.6} ${x+ew*0.6},${eyY-h*1.55} ${x+ew*1.10},${eyY-h*0.42}`);
        lid.setAttribute('opacity',.8);
        lid.setAttribute('d',
          `M${x-ew*0.75},${eyY+h*0.95} C${x-ew*0.3},${eyY+h*1.35} ${x+ew*0.3},${eyY+h*1.3} ${x+ew*0.8},${eyY+h*0.75}`);
      }

      const by = eyY - eh*2.2;
      if (e==='strain'){
        brow.setAttribute('d', `M${x-ew*1.1},${by-1} Q${x},${by+4} ${x+ew*1.1},${by+3}`);
      } else if (e==='shy'){
        brow.setAttribute('d', `M${x-ew*1.1},${by+3} Q${x},${by-2} ${x+ew*1.1},${by+1}`);
      } else {
        brow.setAttribute('d', `M${x-ew*1.1},${by+2} Q${x},${by-3.5} ${x+ew*1.1},${by+0.5}`);
      }
    };
    drawEye(-1); drawEye(1);

    const ny = cy+ry*0.46;
    P.nose.setAttribute('d', `M${cx+1.5},${ny-3} q1.6,4 -2.4,5`);

    const my = cy+ry*0.70, mw = rx*0.20;
    if (e==='happy'){
      P.mouth.setAttribute('d', `M${cx-mw},${my-1} q${mw},5.5 ${mw*2},-1`);
      P.lip.setAttribute('d', `M${cx-mw},${my-1} q${mw},5.5 ${mw*2},-1 q${-mw},2.6 ${-mw*2},1Z`);
    } else if (e==='surprise'){
      P.mouth.setAttribute('d', `M${cx-mw*0.6},${my-2} a${mw*0.6},${mw*0.85} 0 1 0 ${mw*1.2},0 a${mw*0.6},${mw*0.85} 0 1 0 ${-mw*1.2},0`);
      P.lip.setAttribute('d','');
    } else if (e==='strain'){
      P.mouth.setAttribute('d', `M${cx-mw},${my} q${mw*0.5},-4 ${mw},0 q${mw*0.5},4 ${mw},0`);
      P.lip.setAttribute('d','');
    } else if (e==='shy'){
      P.mouth.setAttribute('d', `M${cx-mw*0.55},${my-1} q${mw*0.55},3.5 ${mw*1.1},-0.5`);
      P.lip.setAttribute('d','');
    } else {
      P.mouth.setAttribute('d', `M${cx-mw*0.65},${my-1} q${mw*0.65},3 ${mw*1.3},-0.5`);
      P.lip.setAttribute('d', `M${cx-mw*0.65},${my-1} q${mw*0.65},3 ${mw*1.3},-0.5 q${-mw*0.65},1.8 ${-mw*1.3},0.4Z`);
    }

    const blushA = 0.18 + Math.max(0, strain-28)/100*0.8 + (mood>=80?0.1:0);
    P.blushL.setAttribute('cx', cx-rx*0.60); P.blushL.setAttribute('cy', cy+ry*0.40);
    P.blushR.setAttribute('cx', cx+rx*0.60); P.blushR.setAttribute('cy', cy+ry*0.40);
    P.blushL.setAttribute('opacity', clamp(blushA,0,.8)); P.blushR.setAttribute('opacity', clamp(blushA,0,.8));

    this._hair(cx, cy, rx, ry);
  }

  /* =========================================================
     髪
     ========================================================= */
  _hair(cx, cy, rx, ry){
    const P = this.parts;
    const style = this.char ? this.char.hairStyle : 'bob';
    const sway = Math.sin(this.t*1.1)*2.2;
    const HR = rx*1.10, HT = cy - ry*1.16;
    let back = '', front = '', side = '';

    front =
      `M${cx-HR*1.02},${cy+ry*0.22} `+
      `C${cx-HR*1.06},${cy-ry*1.30} ${cx+HR*1.06},${cy-ry*1.30} ${cx+HR*1.02},${cy+ry*0.22} `+
      `C${cx+HR*0.94},${cy-ry*0.16} ${cx+HR*0.70},${cy+ry*0.06} ${cx+HR*0.46},${cy-ry*0.30} `+
      `C${cx+HR*0.26},${cy+ry*0.16} ${cx-HR*0.02},${cy+ry*0.10} ${cx-HR*0.20},${cy-ry*0.34} `+
      `C${cx-HR*0.44},${cy+ry*0.12} ${cx-HR*0.76},${cy+ry*0.02} ${cx-HR*1.02},${cy+ry*0.22} Z`;

    switch (style){
      case 'longwave':
        back = `M${cx-HR*1.06},${cy-ry*0.1} `+
               `C${cx-HR*1.85},${cy+ry*3.6} ${cx-HR*1.30},${cy+ry*7.4+sway} ${cx-HR*0.62},${cy+ry*8.1} `+
               `Q${cx},${cy+ry*7.4} ${cx+HR*0.62},${cy+ry*8.1} `+
               `C${cx+HR*1.30},${cy+ry*7.4-sway} ${cx+HR*1.85},${cy+ry*3.6} ${cx+HR*1.06},${cy-ry*0.1} `+
               `C${cx+HR*1.06},${HT} ${cx-HR*1.06},${HT} ${cx-HR*1.06},${cy-ry*0.1} Z`;
        break;
      case 'straight':
        back = `M${cx-HR*1.04},${cy-ry*0.1} `+
               `C${cx-HR*1.35},${cy+ry*3.5} ${cx-HR*1.30},${cy+ry*6.0} ${cx-HR*1.16},${cy+ry*7.6} `+
               `L${cx-HR*0.60},${cy+ry*7.8} Q${cx},${cy+ry*7.2} ${cx+HR*0.60},${cy+ry*7.8} `+
               `L${cx+HR*1.16},${cy+ry*7.6} C${cx+HR*1.30},${cy+ry*6.0} ${cx+HR*1.35},${cy+ry*3.5} ${cx+HR*1.04},${cy-ry*0.1} `+
               `C${cx+HR*1.04},${HT} ${cx-HR*1.04},${HT} ${cx-HR*1.04},${cy-ry*0.1} Z`;
        break;
      case 'ponytail':
        back = `M${cx-HR*1.02},${cy-ry*0.05} `+
               `C${cx-HR*1.10},${cy+ry*1.5} ${cx+HR*1.10},${cy+ry*1.5} ${cx+HR*1.02},${cy-ry*0.05} `+
               `C${cx+HR*1.02},${HT} ${cx-HR*1.02},${HT} ${cx-HR*1.02},${cy-ry*0.05} Z `+
               `M${cx+HR*0.80},${cy-ry*0.62} `+
               `C${cx+HR*2.45},${cy-ry*0.3+sway} ${cx+HR*2.70},${cy+ry*3.0+sway*1.5} ${cx+HR*1.55},${cy+ry*4.6+sway*2} `+
               `C${cx+HR*2.05},${cy+ry*2.5} ${cx+HR*1.65},${cy+ry*0.2} ${cx+HR*0.62},${cy-ry*0.15} Z`;
        break;
      case 'braids':
        back = `M${cx-HR*1.02},${cy-ry*0.05} `+
               `C${cx-HR*1.12},${cy+ry*1.7} ${cx+HR*1.12},${cy+ry*1.7} ${cx+HR*1.02},${cy-ry*0.05} `+
               `C${cx+HR*1.02},${HT} ${cx-HR*1.02},${HT} ${cx-HR*1.02},${cy-ry*0.05} Z`;
        {
          const outX = Math.max(HR*1.00, (this._bodyHalf||34)*0.80);
          for (let sd=-1; sd<=1; sd+=2){
            const bp = [];
            for (let i=0;i<7;i++){
              const t = i/6;
              bp.push({
                x: cx + sd*(lerp(HR*0.92, outX, t) + Math.sin(t*5.2 + this.t*1.1)*1.4),
                y: cy + ry*0.60 + t*ry*3.05,
                w: HR*0.40*(1-t*0.50) * (i%2 ? 0.82 : 1.0)   // 編み目の凹凸
              });
            }
            side += this._tube(bp);
          }
        }
        break;
      case 'bob':
        back = `M${cx-HR*1.04},${cy-ry*0.05} `+
               `C${cx-HR*1.22},${cy+ry*1.5} ${cx-HR*1.02},${cy+ry*2.05} ${cx-HR*0.66},${cy+ry*2.15} `+
               `Q${cx},${cy+ry*1.72} ${cx+HR*0.66},${cy+ry*2.15} `+
               `C${cx+HR*1.02},${cy+ry*2.05} ${cx+HR*1.22},${cy+ry*1.5} ${cx+HR*1.04},${cy-ry*0.05} `+
               `C${cx+HR*1.04},${HT} ${cx-HR*1.04},${HT} ${cx-HR*1.04},${cy-ry*0.05} Z`;
        break;
      case 'messy':
      default:
        back = `M${cx-HR*1.06},${cy-ry*0.05} `+
               `L${cx-HR*1.62},${cy+ry*1.5} L${cx-HR*0.98},${cy+ry*1.15} `+
               `L${cx-HR*1.22},${cy+ry*2.4} L${cx-HR*0.42},${cy+ry*1.6} `+
               `L${cx+HR*0.08},${cy+ry*2.5} L${cx+HR*0.62},${cy+ry*1.5} `+
               `L${cx+HR*1.30},${cy+ry*2.3} L${cx+HR*1.02},${cy+ry*1.1} `+
               `L${cx+HR*1.60},${cy+ry*1.4} L${cx+HR*1.06},${cy-ry*0.05} `+
               `C${cx+HR*1.06},${HT} ${cx-HR*1.06},${HT} ${cx-HR*1.06},${cy-ry*0.05} Z`;
        front += ` M${cx-1},${cy-ry*1.14} q${7+sway},-13 17,-5 q-10,2 -13,9 Z`;
        break;
    }
    P.hairBack.setAttribute('d', back);
    P.hairSide.setAttribute('d', side);
    P.hairFront.setAttribute('d', front);
    P.hairHi.setAttribute('d',
      `M${cx-rx*0.78},${cy-ry*0.62} Q${cx},${cy-ry*1.05} ${cx+rx*0.78},${cy-ry*0.62} `+
      `Q${cx},${cy-ry*0.80} ${cx-rx*0.78},${cy-ry*0.62} Z`);
  }

  /* ---------- パーティクル ---------- */
  _particles(dt){
    const alive = [];
    for (const p of this.particles){
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.vy += (p.type==='gas' ? -30 : 42)*dt;
      p.vx *= 0.985;
      p.r  += (p.type==='gas' ? 20 : -2.5)*dt;
      alive.push(p);
    }
    this.particles = alive.slice(-90);
    while (this.pool.length < this.particles.length){
      const c = el('circle', { r:3, fill:'#cdf3b4' });
      this.parts.pgroup.appendChild(c); this.pool.push(c);
    }
    for (let i=0;i<this.pool.length;i++){
      const node = this.pool[i], p = this.particles[i];
      if (!p){ node.setAttribute('opacity',0); continue; }
      const t = p.life/p.max;
      node.setAttribute('cx', p.x.toFixed(1));
      node.setAttribute('cy', p.y.toFixed(1));
      node.setAttribute('r', Math.max(0.5,p.r).toFixed(1));
      node.setAttribute('fill', p.type==='gas' ? '#bfeda0' : '#ffe89a');
      node.setAttribute('opacity', ((1-t)*(p.type==='gas'?0.42:0.9)).toFixed(2));
    }
  }
}
PL.CharRenderer = CharRenderer;

/* ---------- 効果音（WebAudio・外部ファイル不要） ---------- */
PL.Sfx = {
  ctx:null, on:true,
  _ac(){
    if (!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  poke(){
    const ac = this.on && this._ac(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type='sine'; o.frequency.setValueAtTime(660, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(175, ac.currentTime+0.16);
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.2);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime+0.22);
  },
  gulp(){
    const ac = this.on && this._ac(); if (!ac) return;
    for (let i=0;i<3;i++){
      const t = ac.currentTime + i*0.16;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type='sine'; o.frequency.setValueAtTime(255, t);
      o.frequency.exponentialRampToValueAtTime(118, t+0.09);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.11);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.13);
    }
  },
  inflate(){
    const ac = this.on && this._ac(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(145, ac.currentTime);
    o.frequency.linearRampToValueAtTime(330, ac.currentTime+0.4);
    g.gain.setValueAtTime(0.045, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.45);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime+0.46);
  },
  fart(power=1){
    const ac = this.on && this._ac(); if (!ac) return;
    const dur = 0.35+power*0.45;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate*dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    let phase = 0;
    for (let i=0;i<d.length;i++){
      const t = i/d.length;
      const f = (56 + Math.sin(t*26)*22) * (1 - t*0.35);
      phase += f/ac.sampleRate;
      d[i] = ((phase%1)*2-1) * (1-t) * (0.55 + Math.random()*0.45);
    }
    const src = ac.createBufferSource(); src.buffer = buf;
    const flt = ac.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value = 600;
    const g = ac.createGain(); g.gain.value = 0.10+power*0.10;
    src.connect(flt).connect(g).connect(ac.destination); src.start();
  },
  ok(){
    const ac = this.on && this._ac(); if (!ac) return;
    [523,659,784].forEach((f,i)=>{
      const t = ac.currentTime+i*0.07;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.18);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.2);
    });
  }
};
