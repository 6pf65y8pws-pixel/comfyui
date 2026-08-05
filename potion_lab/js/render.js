/* =========================================================
   もちもち調合工房 — キャラクター描画 + ソフトボディ物理
   ・写実寄りの人体描写（約7.3頭身・実際の人体比率）
   ・陰影はぼかしたシェイプの重ね塗り＋肌の微細なノイズで表現
   ・体の輪郭は「素の体型」と「腹部のふくらみ」を連続関数で合成するため、
     どれだけ膨らんでも継ぎ目のない一本の線になる
   ・腹部はバネ質点の環（ソフトボディ）。押した点が沈み、波が伝播する
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

function hex2rgb(h){
  const n = parseInt(h.slice(1),16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}
function mix(a,b,t){
  const A = typeof a==='string'?hex2rgb(a):a, B = typeof b==='string'?hex2rgb(b):b;
  return `rgb(${Math.round(lerp(A[0],B[0],t))},${Math.round(lerp(A[1],B[1],t))},${Math.round(lerp(A[2],B[2],t))})`;
}
function rgbaOf(hexOrRgb, a){
  const c = typeof hexOrRgb==='string' && hexOrRgb[0]==='#'
    ? hex2rgb(hexOrRgb)
    : String(hexOrRgb).match(/\d+/g).map(Number);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/* Catmull-Rom → 三次ベジェ */
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
        if (off[i]> 32){ off[i]= 32; vel[i]*=-0.3; }
        if (off[i]<-24){ off[i]=-24; vel[i]*=-0.3; }
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
  at(theta){
    const n = this.n;
    const f = (((theta/TAU)*n) % n + n) % n;
    const i = Math.floor(f), t = f-i;
    return lerp(this.off[i], this.off[(i+1)%n], t);
  }
}
PL.SoftRing = SoftRing;

/* =========================================================
   骨格の基準（約7.3頭身）
   ========================================================= */
const VB = { w:300, h:470, cx:150 };
const SK = {
  headCy:54.5, headRx:21, headRy:28.5,
  neckBase:100, shoulder:110, deltoid:122, bust:139, underBust:159,
  waist:186, lowBelly:206, hip:224, crotch:250, torsoEnd:270,
  knee:346, ankle:428, sole:444
};

/* 表情パラメータ（数値なので中間表情も作れる） */
const EXPR = {
  normal:   { open:1.00, browIn:0.00, browUp:0.00, mOpen:0.05, mCurve:0.16, flush:0.00 },
  happy:    { open:0.80, browIn:0.00, browUp:0.10, mOpen:0.14, mCurve:0.72, flush:0.12 },
  surprise: { open:1.28, browIn:-0.15,browUp:0.80, mOpen:0.60, mCurve:0.05, flush:0.16 },
  strain:   { open:0.16, browIn:0.95, browUp:-0.60,mOpen:0.34, mCurve:-0.60,flush:0.55 },
  shy:      { open:0.52, browIn:0.35, browUp:0.40, mOpen:0.08, mCurve:0.12, flush:0.62 }
};

class CharRenderer {
  constructor(svg){
    this.svg = svg;
    svg.setAttribute('viewBox', `0 0 ${VB.w} ${VB.h}`);
    this.t = 0;
    this.belly = new SoftRing(32);
    this.flesh = new SoftRing(18);
    this.parts = {};
    this.particles = [];
    this.pool = [];
    this.expr = 'auto';
    this.exprTimer = 0;
    this.ep = Object.assign({}, EXPR.normal);
    this.blink = 1; this.blinkT = 2; this._blinkP = 0;
    this.squash = 0;
    this.onPoke = null;
    this.state = { belly:0, weight:0, gas:0, soft:30, mood:60 };
    this.char = null;
    this.geo = { bellyCx:VB.cx, bellyCy:200, bellyR:28 };
    this._build();
    this._bindPointer();
    this._raf = null;
  }

  /* ================= DOM ================= */
  _build(){
    const svg = this.svg;
    svg.innerHTML = '';
    const defs = el('defs');
    const P = this.parts;

    const lin = (id,x1,y1,x2,y2,n) => {
      const g = el('linearGradient', { id, x1, y1, x2, y2 });
      const st = [];
      for (let i=0;i<n;i++){
        const s = el('stop', { offset:`${Math.round(i/(n-1)*100)}%` });
        g.appendChild(s); st.push(s);
      }
      defs.appendChild(g); return st;
    };
    const rad = (id,cx,cy,r,n) => {
      const g = el('radialGradient', { id, cx, cy, r });
      const st = [];
      for (let i=0;i<n;i++){
        const s = el('stop', { offset:`${Math.round(i/(n-1)*100)}%` });
        g.appendChild(s); st.push(s);
      }
      defs.appendChild(g); return st;
    };

    this.gSkin  = lin('gSkin',  '22%','2%','82%','98%', 4);
    this.gLimb  = lin('gLimb',  '18%','0%','86%','100%',4);
    this.gCloth = lin('gCloth', '20%','0%','84%','100%',3);
    this.gSkirt = lin('gSkirt', '22%','0%','82%','100%',3);
    this.gHair  = lin('gHair',  '26%','0%','78%','100%',3);
    this.gIris  = rad('gIris',  '50%','38%','60%', 3);

    const sheen = rad('gSheen','50%','50%','50%',2);
    sheen[0].setAttribute('stop-color','#fff'); sheen[0].setAttribute('stop-opacity','.5');
    sheen[1].setAttribute('stop-color','#fff'); sheen[1].setAttribute('stop-opacity','0');

    const blur = (id, sd) => {
      const f = el('filter', { id, x:'-70%', y:'-70%', width:'240%', height:'240%' });
      f.appendChild(el('feGaussianBlur', { stdDeviation:sd }));
      defs.appendChild(f);
    };
    blur('b1',1); blur('b2',2); blur('b3',3.2); blur('b5',5); blur('b8',8);

    // 肌の微細なざらつき
    const grain = el('filter', { id:'grain', x:'0%', y:'0%', width:'100%', height:'100%' });
    grain.appendChild(el('feTurbulence', { type:'fractalNoise', baseFrequency:'0.85', numOctaves:'4', seed:'7' }));
    grain.appendChild(el('feColorMatrix', { type:'saturate', values:'0' }));
    defs.appendChild(grain);

    const mkClip = (id) => {
      const c = el('clipPath', { id });
      const p = el('path', { d:'' });
      c.appendChild(p); defs.appendChild(c); return p;
    };
    this.clipBody = mkClip('clipBody');
    this.clipHead = mkClip('clipHead');
    this.clipEyeL = mkClip('clipEyeL');
    this.clipEyeR = mkClip('clipEyeR');
    svg.appendChild(defs);

    const add = (tag, attrs, parent) => { const n = el(tag, attrs); (parent||svg).appendChild(n); return n; };

    P.shadow = add('ellipse', { cx:VB.cx, cy:447, rx:58, ry:8, fill:'rgba(0,0,0,.42)', filter:'url(#b8)' });
    P.hairBack = add('path', { d:'', fill:'url(#gHair)' });

    /* --- 脚 --- */
    P.legL = add('path', { d:'', fill:'url(#gLimb)' });
    P.legR = add('path', { d:'', fill:'url(#gLimb)' });
    P.legShL = add('path', { d:'', fill:'rgba(120,66,50,.26)', filter:'url(#b5)' });
    P.legShR = add('path', { d:'', fill:'rgba(120,66,50,.26)', filter:'url(#b5)' });
    P.legHiL = add('path', { d:'', fill:'rgba(255,244,236,.26)', filter:'url(#b5)' });
    P.legHiR = add('path', { d:'', fill:'rgba(255,244,236,.26)', filter:'url(#b5)' });
    P.shoeL = add('path', { d:'', fill:'#3a3038' });
    P.shoeR = add('path', { d:'', fill:'#3a3038' });

    /* --- 胴体 --- */
    P.body = add('path', { d:'', fill:'url(#gSkin)' });
    P.bodyFx = add('g', { 'clip-path':'url(#clipBody)' });
    P.rim       = add('path', { d:'', fill:'none', stroke:'rgba(120,62,46,.40)', 'stroke-width':16, filter:'url(#b8)' }, P.bodyFx);
    P.bellyLit  = add('ellipse', { fill:'url(#gSheen)' }, P.bodyFx);
    P.bellyDark = add('path', { d:'', fill:'rgba(112,58,44,.28)', filter:'url(#b8)' }, P.bodyFx);
    P.clavicle  = add('path', { d:'', fill:'none', stroke:'rgba(120,64,50,.24)', 'stroke-width':2.6, filter:'url(#b2)', 'stroke-linecap':'round' }, P.bodyFx);
    P.underBust = add('path', { d:'', fill:'none', stroke:'rgba(116,60,46,.30)', 'stroke-width':5, filter:'url(#b3)', 'stroke-linecap':'round' }, P.bodyFx);
    P.underBelly= add('path', { d:'', fill:'none', stroke:'rgba(110,56,42,.42)', 'stroke-width':6, filter:'url(#b3)', 'stroke-linecap':'round' }, P.bodyFx);
    P.foldL = add('path', { d:'', fill:'none', stroke:'rgba(116,60,46,.28)', 'stroke-width':4, filter:'url(#b3)', 'stroke-linecap':'round' }, P.bodyFx);
    P.foldR = add('path', { d:'', fill:'none', stroke:'rgba(116,60,46,.28)', 'stroke-width':4, filter:'url(#b3)', 'stroke-linecap':'round' }, P.bodyFx);
    P.navelSh = add('ellipse', { fill:'rgba(96,48,36,.45)', filter:'url(#b2)' }, P.bodyFx);
    P.navel   = add('path', { d:'', fill:'none', stroke:'rgba(88,44,32,.7)', 'stroke-width':2.2, 'stroke-linecap':'round', filter:'url(#b1)' }, P.bodyFx);
    P.bodyGrain = add('rect', { x:0, y:80, width:300, height:220, filter:'url(#grain)', opacity:.05 }, P.bodyFx);
    P.bodyLine = add('path', { d:'', fill:'none', stroke:'rgba(92,48,36,.30)', 'stroke-width':1.1 });

    /* --- 服（下→上） --- */
    P.skirt     = add('path', { d:'', fill:'url(#gSkirt)' });
    P.skirtSh   = add('path', { d:'', fill:'rgba(0,0,0,.26)', filter:'url(#b5)' });
    P.skirtFold = add('path', { d:'', fill:'none', stroke:'rgba(0,0,0,.18)', 'stroke-width':1.2 });
    P.top       = add('path', { d:'', fill:'url(#gCloth)' });
    P.topSh     = add('path', { d:'', fill:'none', stroke:'rgba(0,0,0,.24)', 'stroke-width':5, filter:'url(#b3)' });
    P.topFold   = add('path', { d:'', fill:'none', stroke:'rgba(0,0,0,.14)', 'stroke-width':1.2, 'stroke-linecap':'round' });
    P.deco      = add('path', { d:'', fill:'none', stroke:'rgba(255,255,255,.32)', 'stroke-width':1.4, 'stroke-linecap':'round' });
    P.acc       = add('path', { d:'', fill:'rgba(252,252,255,.95)', stroke:'rgba(0,0,0,.10)', 'stroke-width':.8 });

    /* --- 腕 --- */
    P.armCastL = add('path', { d:'', fill:'rgba(40,18,12,.42)', filter:'url(#b5)' });
    P.armCastR = add('path', { d:'', fill:'rgba(40,18,12,.42)', filter:'url(#b5)' });
    P.armL = add('path', { d:'', fill:'url(#gLimb)' });
    P.armR = add('path', { d:'', fill:'url(#gLimb)' });
    P.armShL = add('path', { d:'', fill:'rgba(120,66,50,.24)', filter:'url(#b5)' });
    P.armShR = add('path', { d:'', fill:'rgba(120,66,50,.24)', filter:'url(#b5)' });
    P.sleeveL = add('path', { d:'', fill:'url(#gCloth)' });
    P.sleeveR = add('path', { d:'', fill:'url(#gCloth)' });
    P.sleeveShL = add('path', { d:'', fill:'rgba(0,0,0,.16)', filter:'url(#b3)' });
    P.sleeveShR = add('path', { d:'', fill:'rgba(0,0,0,.16)', filter:'url(#b3)' });

    P.hairSide = add('path', { d:'', fill:'url(#gHair)' });

    /* --- 首・頭 --- */
    P.neck   = add('path', { d:'', fill:'url(#gLimb)' });
    P.neckSh = add('path', { d:'', fill:'rgba(104,52,40,.42)', filter:'url(#b5)' });
    P.head = add('g', {});
    const H = P.head;
    P.earL = add('path', { d:'', fill:'url(#gLimb)' }, H);
    P.earR = add('path', { d:'', fill:'url(#gLimb)' }, H);
    P.face = add('path', { d:'', fill:'url(#gSkin)' }, H);

    P.faceFx = add('g', { 'clip-path':'url(#clipHead)' }, H);
    P.foreHi   = add('ellipse', { fill:'rgba(255,247,240,.30)', filter:'url(#b8)' }, P.faceFx);
    P.templeL  = add('ellipse', { fill:'rgba(118,64,50,.22)', filter:'url(#b8)' }, P.faceFx);
    P.templeR  = add('ellipse', { fill:'rgba(118,64,50,.22)', filter:'url(#b8)' }, P.faceFx);
    P.cheekL   = add('ellipse', { filter:'url(#b5)', opacity:.3 }, P.faceFx);
    P.cheekR   = add('ellipse', { filter:'url(#b5)', opacity:.3 }, P.faceFx);
    P.jawSh    = add('path', { d:'', fill:'none', stroke:'rgba(112,58,44,.26)', 'stroke-width':9, filter:'url(#b8)' }, P.faceFx);
    P.noseSh   = add('path', { d:'', fill:'rgba(120,66,52,.30)', filter:'url(#b3)' }, P.faceFx);
    P.noseHi   = add('ellipse', { fill:'rgba(255,248,242,.5)', filter:'url(#b2)' }, P.faceFx);
    P.philtrum = add('path', { d:'', fill:'none', stroke:'rgba(120,66,52,.20)', 'stroke-width':1.5, filter:'url(#b1)' }, P.faceFx);
    P.chinHi   = add('ellipse', { fill:'rgba(255,248,242,.30)', filter:'url(#b3)' }, P.faceFx);
    P.faceGrain= add('rect', { x:100, y:10, width:100, height:100, filter:'url(#grain)', opacity:.055 }, P.faceFx);

    P.nostrilL = add('path', { d:'', fill:'rgba(88,46,36,.5)', filter:'url(#b1)' }, H);
    P.nostrilR = add('path', { d:'', fill:'rgba(88,46,36,.5)', filter:'url(#b1)' }, H);

    ['L','R'].forEach(t => {
      P['sclera'+t] = add('path', { d:'', fill:'#f2ebe8' }, H);
      const g = add('g', { 'clip-path':`url(#clipEye${t})` }, H);
      P['irisG'+t]  = g;
      P['iris'+t]   = add('circle', { r:4, fill:'url(#gIris)' }, g);
      P['limb'+t]   = add('circle', { r:4, fill:'none', 'stroke-width':1.3, stroke:'rgba(24,14,10,.62)' }, g);
      P['pupil'+t]  = add('circle', { r:1.7, fill:'#1a1116' }, g);
      P['cat'+t]    = add('circle', { r:1.5, fill:'rgba(255,255,255,.92)' }, g);
      P['cat2'+t]   = add('circle', { r:.8, fill:'rgba(255,255,255,.5)' }, g);
      P['lidSh'+t]  = add('path', { d:'', fill:'none', stroke:'rgba(70,40,34,.42)', 'stroke-width':3, filter:'url(#b1)' }, g);
      P['lash'+t]   = add('path', { d:'', fill:'#2a1c20' }, H);
      P['lower'+t]  = add('path', { d:'', fill:'none', stroke:'rgba(132,84,76,.55)', 'stroke-width':1.0, 'stroke-linecap':'round' }, H);
      P['crease'+t] = add('path', { d:'', fill:'none', stroke:'rgba(130,84,72,.3)', 'stroke-width':1, 'stroke-linecap':'round' }, H);
      P['brow'+t]   = add('path', { d:'', fill:'#3a281f' }, H);
    });

    P.mouthSh  = add('path', { d:'', fill:'rgba(110,58,46,.26)', filter:'url(#b2)' }, H);
    P.lipUp    = add('path', { d:'', fill:'#a85f5c' }, H);
    P.lipLow   = add('path', { d:'', fill:'#bd6f69' }, H);
    P.mouthGap = add('path', { d:'', fill:'#5c3138' }, H);
    P.lipLine  = add('path', { d:'', fill:'none', stroke:'rgba(84,40,40,.75)', 'stroke-width':1.15, 'stroke-linecap':'round' }, H);
    P.lipHi    = add('ellipse', { fill:'rgba(255,240,236,.4)', filter:'url(#b1)' }, H);

    P.hairFront = add('path', { d:'', fill:'url(#gHair)' }, H);
    P.hairSpec  = add('path', { d:'', fill:'rgba(255,255,255,.14)', filter:'url(#b3)' }, H);
    P.glasses   = add('g', {}, H);

    /* --- エフェクト --- */
    P.fx = add('g', {});
    P.sweat = add('g', { opacity:0 }, P.fx);
    for (let i=0;i<3;i++){
      P.sweat.appendChild(el('path', { d:'M0,0 q3,4.5 0,7 q-3,-2.5 0,-7', fill:'rgba(180,220,240,.7)',
        stroke:'rgba(110,165,195,.55)', 'stroke-width':.6, transform:`translate(${i*13-13},${i*4})` }));
    }
    P.wobL = add('path', { d:'', fill:'none', stroke:'rgba(255,255,255,.36)', 'stroke-width':1.8, 'stroke-linecap':'round', opacity:0 }, P.fx);
    P.wobR = add('path', { d:'', fill:'none', stroke:'rgba(255,255,255,.36)', 'stroke-width':1.8, 'stroke-linecap':'round', opacity:0 }, P.fx);
    P.pgroup = add('g', {}, P.fx);
  }

  /* ================= 入力 ================= */
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
      return { d, ang:Math.atan2(dy,dx), inside: d < g.bellyR+16 };
    };
    const press = (e) => {
      const p = toLocal(e); if (!p) return;
      const h = hit(p); if (!h.inside) return;
      down = true; lastAng = h.ang;
      if (svg.setPointerCapture && e.pointerId != null){
        try { svg.setPointerCapture(e.pointerId); } catch(_){}
      }
      const soft = this.state.soft/100;
      this.belly.impulse(h.ang, -(58+soft*116), 2.4);
      this.flesh.impulse(h.ang, -(10+soft*20), 3);
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
        this.belly.impulse(h.ang, -(17+soft*38), 2.0);
        lastAng = h.ang;
        this.showWobble();
      }
    };
    const up = () => {
      if (!down) return;
      down = false;
      const soft = this.state.soft/100;
      this.belly.impulse(lastAng, 32+soft*66, 2.8);
    };
    svg.addEventListener('pointerdown', press);
    svg.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    svg.addEventListener('pointerleave', up);
  }

  /* ================= 外部API ================= */
  setCharacter(def){
    this.char = def;
    const p = def.palette;
    const P = this.parts;
    const set = (arr, cols) => arr.forEach((s,i) => s.setAttribute('stop-color', cols[i]));

    set(this.gSkin, [
      mix(p.skin,'#fff7f0',.30), p.skin,
      mix(p.skin,'#a15e42',.22), mix(p.skin,'#7d452f',.40)
    ]);
    set(this.gLimb, [
      mix(p.skin,'#fff7f0',.24), p.skin,
      mix(p.skin,'#a15e42',.18), mix(p.skin,'#7d452f',.34)
    ]);
    set(this.gCloth, [ mix(p.cloth,'#ffffff',.26), p.cloth, mix(p.cloth,'#000000',.30) ]);
    set(this.gSkirt, [ mix(p.cloth2,'#ffffff',.20), p.cloth2, mix(p.cloth2,'#000000',.42) ]);
    set(this.gHair,  [ mix(p.hair,'#ffffff',.22), p.hair, p.hair2 ]);
    set(this.gIris,  [ mix(p.eye,'#ffffff',.35), p.eye, mix(p.eye,'#000000',.45) ]);

    P.rim.setAttribute('stroke', rgbaOf(mix(p.skin,'#6d3a26',.60), 0.42));
    ['L','R'].forEach(t => {
      P['cheek'+t].setAttribute('fill', p.blush);
      P['brow'+t].setAttribute('fill', mix(p.hair2,'#3a2a22',.35));
      P['lash'+t].setAttribute('fill', mix(p.hair2,'#221418',.45));
    });
    P.lipUp.setAttribute('fill',  mix(p.blush,'#7d3540',.42));
    P.lipLow.setAttribute('fill', mix(p.blush,'#9c4a4c',.22));
    P.shoeL.setAttribute('fill', mix(p.cloth2,'#000000',.55));
    P.shoeR.setAttribute('fill', mix(p.cloth2,'#000000',.55));

    P.glasses.innerHTML = '';
    if (def.accessory === 'glasses'){
      const mk = (cx) => el('rect', { x:cx-8, y:-5.5, width:16, height:11, rx:3.5,
        fill:'rgba(220,238,250,.12)', stroke:'rgba(90,80,74,.7)', 'stroke-width':1 });
      P.glasses.appendChild(mk(-9.5)); P.glasses.appendChild(mk(9.5));
      P.glasses.appendChild(el('path',{ d:'M-1.5,0 H1.5', stroke:'rgba(90,80,74,.7)', 'stroke-width':1 }));
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
    this.belly.impulse(Math.PI/2, -48*power, 4);
    this.belly.pulse(-12*power);
  }

  sparkle(n=10){
    const g = this.geo;
    for (let i=0;i<n;i++){
      const a = Math.random()*TAU;
      this.particles.push({ type:'star',
        x: g.bellyCx + Math.cos(a)*(g.bellyR+8), y: g.bellyCy + Math.sin(a)*(g.bellyR+8),
        vx: Math.cos(a)*28, vy: Math.sin(a)*28-18, r:2+Math.random()*2,
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
    this.belly.step(dt, 120-soft*68, 5.6-soft*3.8, 44+soft*26);
    this.flesh.step(dt, (120-soft*68)*1.25, (5.6-soft*3.8)*1.3, (44+soft*26)*0.8);

    this._idle = (this._idle||0) - dt;
    if (this._idle <= 0){
      this._idle = 1.8 + Math.random()*2.4;
      this.belly.impulse(Math.random()*TAU, (1.4+soft*7)*(0.4+this.state.belly/100), 4);
    }

    // まばたき
    this.blinkT -= dt;
    if (this.blinkT <= 0){ this.blinkT = 2.6 + Math.random()*3.6; this._blinkP = 0.16; }
    if (this._blinkP > 0){
      this._blinkP -= dt;
      this.blink = Math.abs(clamp(this._blinkP/0.16,0,1)-0.5)*2;
    } else this.blink = 1;

    // 表情の補間
    if (this.exprTimer > 0){ this.exprTimer -= dt; if (this.exprTimer<=0) this.expr='auto'; }
    const st = this.state;
    let name = this.expr;
    if (name === 'auto' || !name || !EXPR[name]){
      const strain = Math.max(st.belly, st.gas);
      name = strain>=86 ? 'strain' : strain>=60 ? 'shy' : st.mood>=78 ? 'happy' : 'normal';
    }
    const tgt = EXPR[name], k = 1-Math.exp(-dt*9);
    for (const key in tgt) this.ep[key] = lerp(this.ep[key], tgt[key], k);

    this._wobble = Math.max(0, (this._wobble||0) - dt*1.5);
    this.squash *= Math.exp(-dt*4);

    this._layout();
    this._particles(dt);
  }

  /* =========================================================
     体
     ========================================================= */
  _layout(){
    const P = this.parts, S = this.state;
    const belly = clamp(S.belly,0,100), weight = clamp(S.weight,0,100);
    const gas = clamp(S.gas,0,100), soft = clamp(S.soft,0,100);
    const wt = weight/100;
    const cx = VB.cx;
    const OF = (this.char && this.char.outfit) || { top:'blouse', sleeve:1, bottom:'skirt', over:null };

    const breathe = Math.sin(this.t*1.35)*(0.8 + belly/100*2.0);
    const bob = Math.sin(this.t*1.35)*1.1;
    const sq = this.squash;

    /* --- 腹部のふくらみ --- */
    const bulgeA  = belly*0.42 + weight*0.10;
    const bulgeCy = SK.lowBelly - 6 + belly*0.10 + weight*0.05 + breathe*0.25;
    const bulgeS  = 25 + belly*0.30 + weight*0.12;
    const bulgeAt = (y) => {
      const t = (y-bulgeCy)/bulgeS, v = 1-t*t;
      return v <= 0 ? 0 : Math.pow(v, 0.72);
    };

    /* --- 素の体型（半幅） --- */
    const fl = (i) => this.flesh.off[i % this.flesh.n] * (0.28 + soft/100*0.75);
    const prof = [
      { y:SK.neckBase,  w:11.5 + wt*2 },
      { y:SK.shoulder,  w:38.0 + wt*7  + fl(0) },
      { y:SK.deltoid,   w:39.0 + wt*8  + fl(1) },
      { y:SK.bust,      w:35.0 + wt*12 + fl(2) },
      { y:SK.underBust, w:30.0 + wt*17 + fl(3) },
      { y:SK.waist,     w:25.5 + wt*24 + fl(4) },
      { y:SK.lowBelly,  w:29.0 + wt*26 + fl(5) },
      { y:SK.hip,       w:39.0 + wt*25 + fl(6) },
      { y:SK.crotch,    w:36.0 + wt*22 + fl(7) },
      { y:SK.torsoEnd,  w:22.0 + wt*13 }
    ];
    const profAt = (y) => {
      if (y <= prof[0].y) return prof[0].w;
      for (let i=1;i<prof.length;i++){
        if (y <= prof[i].y){
          const a = prof[i-1], b = prof[i], t = (y-a.y)/(b.y-a.y);
          return lerp(a.w, b.w, t*t*(3-2*t));
        }
      }
      return prof[prof.length-1].w;
    };

    const perturb = (y, right) => {
      const g = bulgeAt(y);
      if (g < 0.02) return 0;
      const base = Math.asin(clamp((y-bulgeCy)/bulgeS, -1, 1));
      const th = right ? base : Math.PI - base;
      return this.belly.at(th) * g * (0.5 + soft/100*0.9);
    };
    const halfW = (y, right) =>
      profAt(y) + bulgeA*bulgeAt(y) + perturb(y,right) + breathe*0.28*bulgeAt(y);

    const bR = profAt(bulgeCy) + bulgeA;
    this.geo = { bellyCx:cx, bellyCy:bulgeCy, bellyR:bR };

    /* --- 輪郭 --- */
    const rp = [], lp = [];
    for (let y=SK.neckBase; y<=SK.torsoEnd+0.01; y+=4){
      rp.push({ x: cx + halfW(y,true),  y });
      lp.push({ x: cx - halfW(y,false), y });
    }
    const bodyD = smoothClosedPath(rp.concat(lp.reverse()));
    P.body.setAttribute('d', bodyD);
    P.bodyLine.setAttribute('d', bodyD);
    this.clipBody.setAttribute('d', bodyD);

    /* --- 体の陰影 --- */
    P.rim.setAttribute('d', bodyD);
    const bulge = clamp(bulgeA/24, 0, 1);

    P.bellyLit.setAttribute('cx', cx - bR*0.26);
    P.bellyLit.setAttribute('cy', bulgeCy - bulgeS*0.30);
    P.bellyLit.setAttribute('rx', bR*0.60);
    P.bellyLit.setAttribute('ry', bulgeS*0.56);
    P.bellyLit.setAttribute('opacity', (0.36 + soft/100*0.32).toFixed(2));

    P.bellyDark.setAttribute('d',
      `M${cx+bR*0.20},${bulgeCy-bulgeS*0.85} Q${cx+bR*1.05},${bulgeCy} ${cx+bR*0.18},${bulgeCy+bulgeS*0.9} `+
      `Q${cx+bR*0.72},${bulgeCy} ${cx+bR*0.20},${bulgeCy-bulgeS*0.85} Z`);

    P.clavicle.setAttribute('d',
      `M${cx-profAt(SK.shoulder)*0.62},${SK.shoulder+6} Q${cx-10},${SK.shoulder+13} ${cx-2},${SK.shoulder+9}`+
      `M${cx+profAt(SK.shoulder)*0.62},${SK.shoulder+6} Q${cx+10},${SK.shoulder+13} ${cx+2},${SK.shoulder+9}`);
    P.underBust.setAttribute('d',
      `M${cx-profAt(SK.underBust)*0.68},${SK.underBust-4} Q${cx},${SK.underBust+8} ${cx+profAt(SK.underBust)*0.68},${SK.underBust-4}`);

    const ubY = bulgeCy + bulgeS*0.74;
    P.underBelly.setAttribute('d',
      `M${cx-bR*0.72},${ubY-6} Q${cx},${ubY+bulgeS*0.26} ${cx+bR*0.72},${ubY-6}`);
    P.underBelly.setAttribute('opacity', (0.18+bulge*0.66).toFixed(2));

    const foldA = clamp((weight-42)/58, 0, 1);
    P.foldL.setAttribute('d', `M${cx-profAt(SK.waist)*0.94},${SK.waist-6} q7,8 1,15`);
    P.foldR.setAttribute('d', `M${cx+profAt(SK.waist)*0.94},${SK.waist-6} q-7,8 -1,15`);
    P.foldL.setAttribute('opacity', foldA); P.foldR.setAttribute('opacity', foldA);

    const navY = bulgeCy + bulgeS*0.18;
    P.navelSh.setAttribute('cx', cx); P.navelSh.setAttribute('cy', navY+1);
    P.navelSh.setAttribute('rx', 3.2+belly*0.02); P.navelSh.setAttribute('ry', 4+belly*0.03);
    P.navel.setAttribute('d', `M${cx},${navY-2.4} q${1.8+belly*0.014},2.6 0,${5+belly*0.028}`);

    /* --- 脚 --- */
    const thighW = 34 + wt*30, kneeW = 21 + wt*13, calfW = 24 + wt*16, ankW = 11 + wt*5;
    const legDX = 13.5 + wt*9, kneeDX = 12 + wt*6.5, ankDX = 10.5 + wt*5;
    [[-1,'L'],[1,'R']].forEach(([s,tag]) => {
      const pts = [
        { x: cx + s*legDX,          y: SK.hip+2,   w: thighW },
        { x: cx + s*(legDX*0.95),   y: SK.knee-46, w: thighW*0.78 },
        { x: cx + s*kneeDX,         y: SK.knee,    w: kneeW },
        { x: cx + s*(kneeDX*1.02),  y: SK.knee+36, w: calfW },
        { x: cx + s*ankDX,          y: SK.ankle,   w: ankW }
      ];
      P['leg'+tag].setAttribute('d', this._tube(pts));
      P['legSh'+tag].setAttribute('d', this._tube(pts.map(p => ({ x:p.x - s*p.w*0.36, y:p.y, w:p.w*0.42 }))));
      P['legHi'+tag].setAttribute('d', this._tube(pts.map(p => ({ x:p.x + s*p.w*0.10, y:p.y, w:p.w*0.22 }))));
      const fx = cx + s*ankDX;
      P['shoe'+tag].setAttribute('d',
        `M${fx-6.5},${SK.ankle-3} q6.5,-3 12,1 L${fx+6},${SK.sole-4} q0,4 -4.5,4 h-13 q-4,0 -4,-4 Z`);
    });

    /* --- 腕 --- */
    const armTop = 17 + wt*13, armMid = 13.5 + wt*10, armEnd = 9 + wt*5;
    const elbowY = SK.waist, wristY = SK.crotch;
    const shoulderHalf = profAt(SK.deltoid);
    const armPts = {};
    [[-1,'L'],[1,'R']].forEach(([s,tag]) => {
      const right = s>0;
      const swing = Math.sin(this.t*1.35 + (right?0.6:0))*1.3;
      const natural = profAt(SK.bust)*0.97;
      let bx = 0;
      for (let y=160; y<=245; y+=5) bx = Math.max(bx, halfW(y,right));
      const out = clamp(bx*0.64, natural, natural+30);
      armPts[tag] = [
        { x: cx + s*(shoulderHalf - armTop*0.42),                    y: SK.shoulder+4,  w: armTop },
        { x: cx + s*Math.max(halfW(152,right)+armMid*0.55, out*0.9), y: 152,            w: armMid*1.18 },
        { x: cx + s*(out + armMid*0.42),  y: elbowY+swing,    w: armMid },
        { x: cx + s*(out + armEnd*0.55),  y: wristY+swing,    w: armEnd },
        { x: cx + s*(out + armEnd*0.75),  y: wristY+20+swing, w: armEnd*0.92 }
      ];
      P['arm'+tag].setAttribute('d', this._tube(armPts[tag]));
      P['armSh'+tag].setAttribute('d', this._tube(armPts[tag].map(p => ({ x:p.x - s*p.w*0.38, y:p.y, w:p.w*0.40 }))));
      // 体に落ちる影（腕と胴が同じ肌色で溶けないように）
      P['armCast'+tag].setAttribute('d', this._tube(
        armPts[tag].map(p => ({ x:p.x - s*3.5, y:p.y+3, w:p.w*1.05 }))));
    });

    /* ===================== 服 ===================== */
    const TOPS = {
      shirt:  { drop:0,   inset:1,  neck:16, hem:0 },
      blouse: { drop:0,   inset:2,  neck:19, hem:2 },
      tank:   { drop:2.5, inset:9,  neck:21, hem:0 },
      cami:   { drop:4.5, inset:14, neck:24, hem:0 }
    };
    const T = TOPS[OF.top] || TOPS.blouse;

    const Wb = bR*1.02;
    const arc = (x) => { const t=(x-cx)/Wb, v=1-t*t; return v<=0?0:Math.sqrt(v); };
    const hemBase = SK.hip + 4 + T.hem - Math.max(0, bulgeA-6)*1.00;
    const hemRise = Math.min(hemBase-(SK.underBust+6), Math.max(0, bulgeA-6)*1.45);
    const hemAt = (x) => Math.max(SK.underBust+6, hemBase - hemRise*arc(x));

    const yTopStart = SK.shoulder - 2 + T.drop;
    const colR = [], colL = [];
    for (let y=yTopStart; y<=hemBase+0.01; y+=4){
      colR.push({ x: cx + halfW(y,true) *1.025, y });
      colL.push({ x: cx - halfW(y,false)*1.025, y });
    }
    const xTopR = colR[0].x, xTopL = colL[0].x;
    const hemPts = [];
    for (let x=colL[colL.length-1].x; x<=colR[colR.length-1].x+0.01; x+=6) hemPts.push({ x, y: hemAt(x) });
    P.top.setAttribute('d', smoothClosedPath(colL.concat(
      hemPts, colR.slice().reverse(),
      [{ x: xTopR - T.inset, y: yTopStart-1 },
       { x: cx,              y: SK.shoulder + T.neck },
       { x: xTopL + T.inset, y: yTopStart-1 }]
    )));
    P.topSh.setAttribute('d', smoothOpenPath(hemPts.map(p => ({ x:p.x, y:p.y+3 }))));
    let tf = '';
    for (let i=-1;i<=1;i+=2){
      tf += `M${cx+i*profAt(SK.underBust)*0.55},${SK.underBust-6} q${i*5},12 ${i*2},24 `;
    }
    P.topFold.setAttribute('d', tf);

    const sleeveCut = { 0:0, 1:2, 2:5 }[OF.sleeve] || 0;
    ['L','R'].forEach(tag => {
      const s = tag==='L' ? -1 : 1;
      if (!sleeveCut){ P['sleeve'+tag].setAttribute('opacity',0); P['sleeveSh'+tag].setAttribute('opacity',0); return; }
      P['sleeve'+tag].setAttribute('opacity',1); P['sleeveSh'+tag].setAttribute('opacity',1);
      const sp = armPts[tag].slice(0, sleeveCut).map((p,i) => ({ x:p.x, y:p.y, w:p.w*(1.18 - i*0.02) }));
      P['sleeve'+tag].setAttribute('d', this._tube(sp));
      P['sleeveSh'+tag].setAttribute('d', this._tube(sp.map(p => ({ x:p.x - s*p.w*0.34, y:p.y, w:p.w*0.36 }))));
    });

    const hipW = profAt(SK.hip)*1.04;
    const beltY = SK.hip - 4;
    const beltDrop = Math.min(SK.crotch+4-beltY, Math.max(0, bulgeA-6)*1.20);
    const beltAt = (x) => beltY + beltDrop*arc(x);
    const topEdge = [];
    for (let x=cx-hipW; x<=cx+hipW+0.01; x+=6) topEdge.push({ x, y: beltAt(x) });

    let bottomPts, folds = '';
    if (OF.bottom === 'shorts'){
      const lw = thighW*0.58, sb = SK.crotch + 24 + wt*8;
      bottomPts = topEdge.concat([
        { x: cx+hipW,           y: beltAt(cx+hipW)+18 },
        { x: cx+legDX+lw*1.02,  y: sb-14 },
        { x: cx+legDX+lw*0.96,  y: sb },
        { x: cx+legDX-lw*0.84,  y: sb-1 },
        { x: cx+1.5,            y: SK.crotch+13 },
        { x: cx-1.5,            y: SK.crotch+13 },
        { x: cx-legDX+lw*0.84,  y: sb-1 },
        { x: cx-legDX-lw*0.96,  y: sb },
        { x: cx-legDX-lw*1.02,  y: sb-14 },
        { x: cx-hipW,           y: beltAt(cx-hipW)+18 }
      ]);
      folds = `M${cx-legDX*0.4},${SK.crotch+2} q-4,8 -2,14 M${cx+legDX*0.4},${SK.crotch+2} q4,8 2,14`;
    } else {
      const spec = {
        skirt:     { flare:1.24, len:SK.crotch+44 },
        longskirt: { flare:1.12, len:SK.knee+12 },
        pleated:   { flare:1.20, len:SK.crotch+56 },
        pencil:    { flare:0.99, len:SK.knee-12 }
      }[OF.bottom] || { flare:1.24, len:SK.crotch+44 };
      const F = hipW*spec.flare + 5, L = spec.len;
      bottomPts = topEdge.concat([
        { x: cx+hipW+2,  y: beltAt(cx+hipW)+14 },
        { x: cx+F,       y: L-10 },
        { x: cx+F*0.9,   y: L },
        { x: cx,         y: L+6 },
        { x: cx-F*0.9,   y: L },
        { x: cx-F,       y: L-10 },
        { x: cx-hipW-2,  y: beltAt(cx-hipW)+14 }
      ]);
      const n = OF.bottom==='pleated' ? 3 : 2;
      for (let i=-n;i<=n;i++){
        if (!i && OF.bottom!=='pleated') continue;
        const xt = cx + i*hipW*0.36, xb = cx + i*F*0.42;
        folds += `M${xt},${beltAt(xt)+10} L${xb},${L-5} `;
      }
    }
    P.skirt.setAttribute('d', smoothClosedPath(bottomPts));
    P.skirtFold.setAttribute('d', folds);
    const blast = bottomPts[bottomPts.length-4];
    P.skirtSh.setAttribute('d',
      `M${cx-hipW},${blast.y-26} Q${cx},${blast.y-6} ${cx+hipW},${blast.y-26} L${cx+hipW},${blast.y+6} L${cx-hipW},${blast.y+6} Z`);
    P.skirtSh.setAttribute('opacity', .3);

    const nk = SK.shoulder + T.neck;
    if (OF.top === 'shirt'){
      P.deco.setAttribute('d', `M${cx-12},${nk-9} L${cx-3},${nk+4} L${cx+3},${nk+4} L${cx+12},${nk-9}`);
    } else if (OF.top === 'blouse'){
      P.deco.setAttribute('d', `M${cx-11},${nk-6} Q${cx},${nk+4} ${cx+11},${nk-6}`);
    } else {
      P.deco.setAttribute('d', '');
    }

    const over = OF.over;
    if (over === 'apron'){
      const pTop = beltAt(cx) + 4;
      const pBot = (OF.bottom==='shorts' ? SK.crotch+32 : SK.crotch+38);
      const pw = hipW*0.84;
      P.acc.setAttribute('d',
        `M${cx-pw},${pTop+6} Q${cx},${pTop-4} ${cx+pw},${pTop+6} `+
        `L${cx+pw*1.03},${pBot} Q${cx},${pBot+8} ${cx-pw*1.03},${pBot} Z`);
      P.acc.setAttribute('fill', 'rgba(250,248,244,.9)');
      P.acc.setAttribute('opacity', .9);
    } else if (over === 'coat' || over === 'cardigan'){
      const bot = over==='coat' ? SK.crotch+26 : SK.hip+8;
      let d = '';
      for (const sd of [-1,1]){
        const outer = [], inner = [];
        for (let y=SK.shoulder-1; y<=bot+0.01; y+=5){
          const hv = halfW(Math.min(y, SK.torsoEnd), sd>0);
          outer.push({ x: cx + sd*hv*1.05,       y });
          inner.push({ x: cx + sd*(hv*0.36 + 4), y });
        }
        d += smoothClosedPath(outer.concat(inner.reverse()));
      }
      P.acc.setAttribute('d', d);
      P.acc.setAttribute('fill', over==='coat'
        ? 'rgba(248,247,244,.96)'
        : (this.char ? mix(this.char.palette.cloth,'#000000',.12) : '#999'));
      P.acc.setAttribute('opacity', over==='coat' ? .96 : .92);
    } else {
      P.acc.setAttribute('opacity', 0);
    }

    /* --- 首・頭 --- */
    const hrx = SK.headRx + wt*1.4, hry = SK.headRy + wt*1.1;
    const hy = SK.headCy + bob + sq*4;
    const nw = 10.5 + wt*2;
    P.neck.setAttribute('d',
      `M${cx-nw},${hy+hry*0.60} q${nw},4 ${nw*2},0 L${cx+nw+2.5},${SK.neckBase+8} q${-(nw+2.5)},5 ${-(nw*2+5)},0 Z`);
    P.neckSh.setAttribute('d',
      `M${cx-nw-1},${hy+hry*0.62} q${nw+1},10 ${(nw+1)*2},0 q-2,10 ${-(nw+1)},10 q${-(nw-1)},0 ${-(nw+1)},-10 Z`);

    this._bodyHalf = profAt(SK.bust);
    this._head(cx, hy, hrx, hry, Math.max(belly,gas));
    if (this.char && this.char.accessory === 'glasses'){
      P.glasses.setAttribute('transform', `translate(${cx},${hy+hry*0.06})`);
    }

    /* --- エフェクト --- */
    const wob = this._wobble||0;
    P.wobL.setAttribute('d', `M${cx-halfW(bulgeCy,false)-8},${bulgeCy-6} q-5,6 0,12`);
    P.wobR.setAttribute('d', `M${cx+halfW(bulgeCy,true)+8},${bulgeCy-6} q5,6 0,12`);
    P.wobL.setAttribute('opacity', wob*.85); P.wobR.setAttribute('opacity', wob*.85);

    const strain = Math.max(belly, gas);
    P.sweat.setAttribute('opacity', strain>58 ? clamp((strain-58)/28,0,1) : 0);
    P.sweat.setAttribute('transform', `translate(${cx+hrx*0.86},${hy-hry*0.30})`);
    P.shadow.setAttribute('rx', 40 + bulgeA*0.40 + wt*14);
  }

  /* 太さの変わるチューブ */
  _tube(pts){
    const R = [], L = [];
    for (let i=0;i<pts.length;i++){
      const p = pts[i];
      const prev = pts[Math.max(0,i-1)], next = pts[Math.min(pts.length-1,i+1)];
      const dx = next.x-prev.x, dy = next.y-prev.y;
      const len = Math.hypot(dx,dy)||1;
      const nx = -dy/len, ny = dx/len;
      R.push({ x:p.x+nx*p.w/2, y:p.y+ny*p.w/2 });
      L.push({ x:p.x-nx*p.w/2, y:p.y-ny*p.w/2 });
    }
    const last = pts[pts.length-1], first = pts[0];
    return smoothClosedPath(R.concat(
      [{ x:last.x, y:last.y+last.w*0.40 }],
      L.reverse(),
      [{ x:first.x, y:first.y-first.w*0.28 }]
    ));
  }

  /* 二次ベジェに沿った先細りの帯（髪の束など） */
  _qtube(p0, pc, p1, w0, w1, n){
    n = n || 7;
    const pts = [];
    for (let i=0;i<=n;i++){
      const t=i/n, mt=1-t;
      pts.push({
        x: mt*mt*p0.x + 2*mt*t*pc.x + t*t*p1.x,
        y: mt*mt*p0.y + 2*mt*t*pc.y + t*t*p1.y,
        w: lerp(w0, w1, t)
      });
    }
    return this._tube(pts);
  }

  /* =========================================================
     顔
     ========================================================= */
  _head(cx, cy, rx, ry, strain){
    const P = this.parts, ep = this.ep;

    /* 輪郭：頬骨から顎へ細くなる形 */
    const faceD =
      `M${cx-rx},${cy-ry*0.16} `+
      `C${cx-rx*1.00},${cy-ry*1.12} ${cx+rx*1.00},${cy-ry*1.12} ${cx+rx},${cy-ry*0.16} `+
      `C${cx+rx*0.99},${cy+ry*0.18} ${cx+rx*0.86},${cy+ry*0.52} ${cx+rx*0.56},${cy+ry*0.80} `+
      `C${cx+rx*0.36},${cy+ry*0.98} ${cx+rx*0.16},${cy+ry*1.04} ${cx},${cy+ry*1.05} `+
      `C${cx-rx*0.16},${cy+ry*1.04} ${cx-rx*0.36},${cy+ry*0.98} ${cx-rx*0.56},${cy+ry*0.80} `+
      `C${cx-rx*0.86},${cy+ry*0.52} ${cx-rx*0.99},${cy+ry*0.18} ${cx-rx},${cy-ry*0.16} Z`;
    P.face.setAttribute('d', faceD);
    this.clipHead.setAttribute('d', faceD);
    P.earL.setAttribute('d', `M${cx-rx*0.97},${cy-ry*0.06} q-5.5,-1.5 -5,5 q.5,6.5 5.5,7.5 Z`);
    P.earR.setAttribute('d', `M${cx+rx*0.97},${cy-ry*0.06} q5.5,-1.5 5,5 q-.5,6.5 -5.5,7.5 Z`);

    /* 面の陰影 */
    P.foreHi.setAttribute('cx', cx-rx*0.10); P.foreHi.setAttribute('cy', cy-ry*0.62);
    P.foreHi.setAttribute('rx', rx*0.52);    P.foreHi.setAttribute('ry', ry*0.30);
    P.templeL.setAttribute('cx', cx-rx*0.86); P.templeL.setAttribute('cy', cy-ry*0.30);
    P.templeL.setAttribute('rx', rx*0.24);    P.templeL.setAttribute('ry', ry*0.40);
    P.templeR.setAttribute('cx', cx+rx*0.86); P.templeR.setAttribute('cy', cy-ry*0.30);
    P.templeR.setAttribute('rx', rx*0.24);    P.templeR.setAttribute('ry', ry*0.40);
    P.jawSh.setAttribute('d',
      `M${cx-rx*0.80},${cy+ry*0.34} Q${cx-rx*0.46},${cy+ry*0.96} ${cx},${cy+ry*1.02} `+
      `Q${cx+rx*0.46},${cy+ry*0.96} ${cx+rx*0.80},${cy+ry*0.34}`);
    P.chinHi.setAttribute('cx', cx); P.chinHi.setAttribute('cy', cy+ry*0.80);
    P.chinHi.setAttribute('rx', rx*0.17); P.chinHi.setAttribute('ry', ry*0.10);
    P.faceGrain.setAttribute('x', cx-rx-4); P.faceGrain.setAttribute('y', cy-ry-6);
    P.faceGrain.setAttribute('width', rx*2+8); P.faceGrain.setAttribute('height', ry*2.3);

    const flush = clamp(ep.flush + Math.max(0, strain-30)/100*0.55, 0, 0.95);
    ['L','R'].forEach(t => {
      const s = t==='L' ? -1 : 1;
      P['cheek'+t].setAttribute('cx', cx + s*rx*0.52);
      P['cheek'+t].setAttribute('cy', cy + ry*0.26);
      P['cheek'+t].setAttribute('rx', rx*0.32);
      P['cheek'+t].setAttribute('ry', ry*0.17);
      P['cheek'+t].setAttribute('opacity', (0.10 + flush*0.40).toFixed(2));
    });

    /* 鼻 */
    const nY = cy + ry*0.40;
    P.noseSh.setAttribute('d',
      `M${cx-2.4},${cy-ry*0.06} Q${cx-4.2},${nY-2} ${cx-3.6},${nY+3.4} `+
      `Q${cx-1},${nY+5.2} ${cx+2.6},${nY+3.6} Q${cx+1.4},${nY-4} ${cx-2.4},${cy-ry*0.06} Z`);
    P.noseHi.setAttribute('cx', cx+0.6); P.noseHi.setAttribute('cy', nY+0.6);
    P.noseHi.setAttribute('rx', 2.0);    P.noseHi.setAttribute('ry', 2.6);
    P.nostrilL.setAttribute('d', `M${cx-3.6},${nY+3.6} q1.6,-1.6 2.9,-.2 q-1.4,1.5 -2.9,.2 Z`);
    P.nostrilR.setAttribute('d', `M${cx+3.6},${nY+3.6} q-1.6,-1.6 -2.9,-.2 q1.4,1.5 2.9,.2 Z`);
    P.philtrum.setAttribute('d', `M${cx-0.8},${nY+5} L${cx-0.8},${nY+8.4} M${cx+0.8},${nY+5} L${cx+0.8},${nY+8.4}`);

    /* 目 */
    const eyY = cy + ry*0.03;
    const eyDX = rx*0.50;
    const ew = rx*0.235;
    const openV = clamp(ep.open * this.blink, 0.04, 1.4);
    const eh = ew*0.56*openV;

    ['L','R'].forEach(t => {
      const s = t==='L' ? -1 : 1;
      const x = cx + s*eyDX;
      const inner = x - s*ew, outer = x + s*ew;

      const scl =
        `M${inner},${eyY+eh*0.16} `+
        `C${x - s*ew*0.42},${eyY-eh*1.55} ${x + s*ew*0.45},${eyY-eh*1.40} ${outer},${eyY-eh*0.30} `+
        `C${x + s*ew*0.40},${eyY+eh*1.25} ${x - s*ew*0.45},${eyY+eh*1.30} ${inner},${eyY+eh*0.16} Z`;
      P['sclera'+t].setAttribute('d', scl);
      this['clipEye'+t].setAttribute('d', scl);

      const ir = ew*0.52;
      [P['iris'+t], P['limb'+t]].forEach(n => {
        n.setAttribute('cx', x); n.setAttribute('cy', eyY+eh*0.06); n.setAttribute('r', ir);
      });
      P['pupil'+t].setAttribute('cx', x); P['pupil'+t].setAttribute('cy', eyY+eh*0.06);
      P['pupil'+t].setAttribute('r', ir*0.40);
      P['cat'+t].setAttribute('cx', x-ir*0.34); P['cat'+t].setAttribute('cy', eyY-ir*0.34);
      P['cat'+t].setAttribute('r', ir*0.26);
      P['cat2'+t].setAttribute('cx', x+ir*0.32); P['cat2'+t].setAttribute('cy', eyY+ir*0.34);
      P['cat2'+t].setAttribute('r', ir*0.14);
      P['lidSh'+t].setAttribute('d',
        `M${inner},${eyY-eh*0.2} C${x - s*ew*0.4},${eyY-eh*1.5} ${x + s*ew*0.45},${eyY-eh*1.35} ${outer},${eyY-eh*0.3}`);
      P['irisG'+t].setAttribute('opacity', openV>0.12 ? 1 : 0);

      P['lash'+t].setAttribute('d', this._qtube(
        { x:inner, y:eyY+eh*0.10 },
        { x:x, y:eyY-eh*1.75 },
        { x:outer + s*1.6, y:eyY-eh*0.42 },
        1.3, 3.0, 6));
      P['lower'+t].setAttribute('d',
        `M${x - s*ew*0.62},${eyY+eh*1.10} C${x - s*ew*0.2},${eyY+eh*1.45} ${x + s*ew*0.3},${eyY+eh*1.35} ${x + s*ew*0.72},${eyY+eh*0.75}`);
      P['crease'+t].setAttribute('d',
        `M${x - s*ew*0.78},${eyY-eh*1.9-1.6} C${x - s*ew*0.2},${eyY-eh*2.7-1.6} ${x + s*ew*0.4},${eyY-eh*2.5-1.4} ${x + s*ew*0.88},${eyY-eh*1.5-1.2}`);

      const bY = eyY - ry*0.20 - ep.browUp*3.2;
      P['brow'+t].setAttribute('d', this._qtube(
        { x:x - s*ew*1.05 + s*ep.browIn*2.2, y:bY + ep.browIn*2.6 },
        { x:x + s*ew*0.15, y:bY - 3.4 - ep.browUp*1.6 },
        { x:x + s*ew*1.30, y:bY + 1.4 },
        2.9, 0.9, 7));
    });

    /* 口 */
    const mY = cy + ry*0.68;
    const mw = rx*0.30;
    const curve = ep.mCurve, open = ep.mOpen*6;
    const cornerY = mY - curve*2.6;
    const lipTop  = mY - 2.2;
    P.lipUp.setAttribute('d',
      `M${cx-mw},${cornerY} Q${cx-mw*0.52},${lipTop-1.8} ${cx-mw*0.16},${lipTop-0.4} `+
      `Q${cx},${lipTop-1.5} ${cx+mw*0.16},${lipTop-0.4} Q${cx+mw*0.52},${lipTop-1.8} ${cx+mw},${cornerY} `+
      `Q${cx},${mY+0.6} ${cx-mw},${cornerY} Z`);
    P.mouthGap.setAttribute('d', open>0.7
      ? `M${cx-mw*0.72},${mY-0.4} Q${cx},${mY-1.4+open*0.3} ${cx+mw*0.72},${mY-0.4} Q${cx},${mY+open} ${cx-mw*0.72},${mY-0.4} Z`
      : '');
    P.lipLow.setAttribute('d',
      `M${cx-mw},${cornerY} Q${cx},${mY+0.4+open} ${cx+mw},${cornerY} `+
      `Q${cx},${mY+3.4+open*1.15} ${cx-mw},${cornerY} Z`);
    P.lipLine.setAttribute('d',
      `M${cx-mw},${cornerY} Q${cx-mw*0.45},${mY+0.2} ${cx},${mY+0.1} Q${cx+mw*0.45},${mY+0.2} ${cx+mw},${cornerY}`);
    P.lipHi.setAttribute('cx', cx-mw*0.22); P.lipHi.setAttribute('cy', mY+2.0+open*0.7);
    P.lipHi.setAttribute('rx', mw*0.30); P.lipHi.setAttribute('ry', 0.9);
    P.mouthSh.setAttribute('d',
      `M${cx-mw*1.1},${mY+3.6+open} Q${cx},${mY+7.4+open*1.3} ${cx+mw*1.1},${mY+3.6+open} `+
      `Q${cx},${mY+4.6+open} ${cx-mw*1.1},${mY+3.6+open} Z`);

    this._hair(cx, cy, rx, ry);
  }

  /* =========================================================
     髪（束を重ねて描く）
     ========================================================= */
  _hair(cx, cy, rx, ry){
    const P = this.parts;
    const style = this.char ? this.char.hairStyle : 'bob';
    const sway = Math.sin(this.t*1.05)*1.8;
    const HR = rx*1.07, TOP = cy - ry*1.22;
    let back = '', front = '', side = '';

    /* 頭部を覆う地毛 */
    front =
      `M${cx-HR*1.02},${cy+ry*0.16} `+
      `C${cx-HR*1.06},${TOP} ${cx+HR*1.06},${TOP} ${cx+HR*1.02},${cy+ry*0.16} `+
      `C${cx+HR*0.96},${cy-ry*0.32} ${cx+HR*0.55},${cy-ry*0.58} ${cx},${cy-ry*0.60} `+
      `C${cx-HR*0.55},${cy-ry*0.58} ${cx-HR*0.96},${cy-ry*0.32} ${cx-HR*1.02},${cy+ry*0.16} Z`;

    /* 前髪：太さの違う束を重ねる */
    const fr = [
      [-0.94, -0.14, -0.30, 10.5], [-0.54, 0.12, -0.44, 11.5],
      [-0.08,  0.24, -0.46, 11.0], [ 0.40, 0.16, -0.40, 10.5], [ 0.86, -0.12, -0.26, 10.0]
    ];
    for (const [x0, xe, ye, w] of fr){
      front += this._qtube(
        { x: cx + HR*x0*0.95,      y: cy - ry*0.96 },
        { x: cx + HR*(x0+xe)*0.85, y: cy - ry*0.60 },
        { x: cx + HR*(x0+xe*1.4),  y: cy + ry*ye  },
        w, w*0.55, 6);
    }
    // 顔まわりに落ちる後れ毛
    for (const sd of [-1,1]){
      front += this._qtube(
        { x: cx + sd*HR*0.86, y: cy - ry*0.66 },
        { x: cx + sd*HR*1.10, y: cy + ry*0.30 },
        { x: cx + sd*HR*0.94, y: cy + ry*1.55 },
        7.5, 3.0, 7);
    }

    switch (style){
      case 'longwave':
        back = this._qtube({x:cx-HR*1.00,y:cy-ry*0.30},{x:cx-HR*1.75,y:cy+ry*3.4},{x:cx-HR*0.72,y:cy+ry*7.6+sway}, HR*0.95, HR*0.70, 8)
             + this._qtube({x:cx+HR*1.00,y:cy-ry*0.30},{x:cx+HR*1.75,y:cy+ry*3.4},{x:cx+HR*0.72,y:cy+ry*7.6-sway}, HR*0.95, HR*0.70, 8)
             + this._qtube({x:cx-HR*0.50,y:cy-ry*0.40},{x:cx,y:cy+ry*3.5},{x:cx+HR*0.50,y:cy+ry*7.2}, HR*1.40, HR*1.10, 8);
        break;
      case 'straight':
        back = this._qtube({x:cx-HR*1.02,y:cy-ry*0.30},{x:cx-HR*1.20,y:cy+ry*3.6},{x:cx-HR*1.00,y:cy+ry*7.4}, HR*0.90, HR*0.72, 8)
             + this._qtube({x:cx+HR*1.02,y:cy-ry*0.30},{x:cx+HR*1.20,y:cy+ry*3.6},{x:cx+HR*1.00,y:cy+ry*7.4}, HR*0.90, HR*0.72, 8)
             + this._qtube({x:cx-HR*0.40,y:cy-ry*0.40},{x:cx,y:cy+ry*3.6},{x:cx+HR*0.40,y:cy+ry*7.2}, HR*1.50, HR*1.30, 8);
        break;
      case 'ponytail':
        back = this._qtube({x:cx-HR*0.55,y:cy-ry*0.3},{x:cx,y:cy+ry*0.9},{x:cx+HR*0.55,y:cy-ry*0.3}, HR*1.10, HR*1.10, 6);
        side = this._qtube(
          { x: cx+HR*0.78, y: cy-ry*0.52 },
          { x: cx+HR*2.55, y: cy+ry*1.4+sway },
          { x: cx+HR*1.35, y: cy+ry*4.6+sway*1.6 },
          HR*0.62, HR*0.30, 8);
        break;
      case 'braids':
        back = this._qtube({x:cx-HR*0.60,y:cy-ry*0.3},{x:cx,y:cy+ry*1.0},{x:cx+HR*0.60,y:cy-ry*0.3}, HR*1.10, HR*1.10, 6);
        {
          const outX = Math.max(HR*0.94, (this._bodyHalf||34)*0.92);
          for (const sd of [-1,1]){
            const bp = [];
            for (let i=0;i<8;i++){
              const t = i/7;
              bp.push({
                x: cx + sd*(lerp(HR*0.88, outX, t) + Math.sin(t*6+this.t*1.1)*1.2),
                y: cy + ry*0.62 + t*ry*2.7,
                w: HR*0.30*(1-t*0.45) * (i%2 ? 0.86 : 1.0)
              });
            }
            side += this._tube(bp);
          }
        }
        break;
      case 'bob':
        back = this._qtube({x:cx-HR*1.02,y:cy-ry*0.30},{x:cx-HR*1.15,y:cy+ry*1.1},{x:cx-HR*0.62,y:cy+ry*1.86}, HR*0.85, HR*0.62, 7)
             + this._qtube({x:cx+HR*1.02,y:cy-ry*0.30},{x:cx+HR*1.15,y:cy+ry*1.1},{x:cx+HR*0.62,y:cy+ry*1.86}, HR*0.85, HR*0.62, 7)
             + this._qtube({x:cx-HR*0.40,y:cy-ry*0.40},{x:cx,y:cy+ry*1.0},{x:cx+HR*0.40,y:cy+ry*1.7}, HR*1.50, HR*1.25, 7);
        break;
      case 'messy':
      default:
        back = this._qtube({x:cx-HR*0.60,y:cy-ry*0.3},{x:cx,y:cy+ry*1.1},{x:cx+HR*0.60,y:cy-ry*0.3}, HR*1.15, HR*1.15, 6);
        for (let i=0;i<6;i++){
          const a = -0.95 + i*0.38;
          back += this._qtube(
            { x: cx + HR*a*0.9, y: cy - ry*0.1 },
            { x: cx + HR*a*1.6, y: cy + ry*0.9 },
            { x: cx + HR*(a*1.15 + (i%2?0.3:-0.3)), y: cy + ry*(1.7+ (i%3)*0.35) },
            HR*0.42, HR*0.14, 6);
        }
        break;
    }
    P.hairBack.setAttribute('d', back);
    P.hairSide.setAttribute('d', side);
    P.hairFront.setAttribute('d', front);
    P.hairSpec.setAttribute('d',
      this._qtube({x:cx-rx*0.72,y:cy-ry*0.66},{x:cx-rx*0.30,y:cy-ry*0.96},{x:cx-rx*0.02,y:cy-ry*0.80}, 3.2, 1.6, 5)+
      this._qtube({x:cx+rx*0.16,y:cy-ry*0.82},{x:cx+rx*0.46,y:cy-ry*0.94},{x:cx+rx*0.74,y:cy-ry*0.62}, 2.6, 1.2, 5));
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
      const c = el('circle', { r:3, fill:'#c3ddad' });
      this.parts.pgroup.appendChild(c); this.pool.push(c);
    }
    for (let i=0;i<this.pool.length;i++){
      const node = this.pool[i], p = this.particles[i];
      if (!p){ node.setAttribute('opacity',0); continue; }
      const t = p.life/p.max;
      node.setAttribute('cx', p.x.toFixed(1));
      node.setAttribute('cy', p.y.toFixed(1));
      node.setAttribute('r', Math.max(0.5,p.r).toFixed(1));
      node.setAttribute('fill', p.type==='gas' ? '#c3ddad' : '#f2dfa4');
      node.setAttribute('opacity', ((1-t)*(p.type==='gas'?0.34:0.8)).toFixed(2));
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
    o.type='sine'; o.frequency.setValueAtTime(620, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(165, ac.currentTime+0.17);
    g.gain.setValueAtTime(0.14, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.21);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime+0.23);
  },
  gulp(){
    const ac = this.on && this._ac(); if (!ac) return;
    for (let i=0;i<3;i++){
      const t = ac.currentTime + i*0.16;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type='sine'; o.frequency.setValueAtTime(250, t);
      o.frequency.exponentialRampToValueAtTime(112, t+0.09);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.11);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.13);
    }
  },
  inflate(){
    const ac = this.on && this._ac(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(140, ac.currentTime);
    o.frequency.linearRampToValueAtTime(320, ac.currentTime+0.4);
    g.gain.setValueAtTime(0.042, ac.currentTime);
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
      const f = (54 + Math.sin(t*26)*22) * (1 - t*0.35);
      phase += f/ac.sampleRate;
      d[i] = ((phase%1)*2-1) * (1-t) * (0.55 + Math.random()*0.45);
    }
    const src = ac.createBufferSource(); src.buffer = buf;
    const flt = ac.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value = 580;
    const g = ac.createGain(); g.gain.value = 0.10+power*0.10;
    src.connect(flt).connect(g).connect(ac.destination); src.start();
  },
  ok(){
    const ac = this.on && this._ac(); if (!ac) return;
    [523,659,784].forEach((f,i)=>{
      const t = ac.currentTime+i*0.07;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0.075, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.18);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.2);
    });
  }
};
