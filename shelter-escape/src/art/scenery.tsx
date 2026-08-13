import type { ReactNode } from 'react';

/**
 * 部屋の描画部品。
 *
 * 画面は 1600x900 の固定 viewBox で描く。rooms.ts のホットスポット座標（%）は
 * ここで描いた物の位置に合わせてある。
 *
 * 方針（仕様書 §8）：光源はひとつ。影は強く落とす。角丸はほぼ使わない。
 * パレット外の色は使わない。
 */

export const W = 1600;
export const H = 900;

export const PAL = {
  ink: '#1A1815',
  concrete: '#3D3831',
  rust: '#6B5D4A',
  lit: '#A89880',
  warn: '#C4462A',
} as const;

/** 金属の箱。正面と天面（と側面）を描いて奥行きを出す */
export function Box({
  x,
  y,
  w,
  h,
  depth = 26,
  face = '#332F29',
  top = '#453F36',
  side = '#25221E',
  dir = 1,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  depth?: number;
  face?: string;
  top?: string;
  side?: string;
  /** 1 なら右側面が見える、-1 なら左側面 */
  dir?: 1 | -1;
}) {
  const dx = depth * dir;
  const sx = dir === 1 ? x + w : x;
  return (
    <g>
      <polygon points={`${x},${y} ${x + w},${y} ${x + w + dx},${y - depth} ${x + dx},${y - depth}`} fill={top} />
      <polygon
        points={`${sx},${y} ${sx + dx},${y - depth} ${sx + dx},${y + h - depth} ${sx},${y + h}`}
        fill={side}
      />
      <rect x={x} y={y} width={w} height={h} fill={face} />
    </g>
  );
}

/** 通風口・排気口の格子 */
export function Grate({
  x,
  y,
  w,
  h,
  slats = 6,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  slats?: number;
}) {
  const gap = h / slats;
  return (
    <g>
      <rect x={x - 8} y={y - 8} width={w + 16} height={h + 16} fill="#2A2621" />
      <rect x={x} y={y} width={w} height={h} fill="#100F0D" />
      {Array.from({ length: slats }, (_, i) => (
        <rect
          key={i}
          x={x + 3}
          y={y + i * gap + gap * 0.28}
          width={w - 6}
          height={gap * 0.42}
          fill="#4A443A"
          opacity={0.85 - i * 0.05}
        />
      ))}
      {[0, 1].map((i) => (
        <circle key={i} cx={x + (i === 0 ? 8 : w - 8)} cy={y - 14} r={4} fill="#5A5145" />
      ))}
    </g>
  );
}

/** 鋼製の棚（枠と棚板だけ。中身は別に置く） */
export function Shelving({
  x,
  y,
  w,
  h,
  levels = 4,
  tone = '#2E2A25',
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  levels?: number;
  tone?: string;
}) {
  const gap = h / levels;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#161513" />
      {Array.from({ length: levels + 1 }, (_, i) => (
        <rect key={i} x={x - 6} y={y + i * gap} width={w + 12} height={12} fill={tone} />
      ))}
      <rect x={x - 6} y={y} width={12} height={h} fill={tone} />
      <rect x={x + w - 6} y={y} width={12} height={h} fill={tone} />
    </g>
  );
}

/** 配電盤 */
export function BreakerPanel({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const rows = 3;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#332F2A" />
      <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} fill="#292521" />
      {Array.from({ length: rows }, (_, r) => (
        <g key={r}>
          <rect x={x + 18} y={y + 26 + r * ((h - 46) / rows)} width={w - 36} height={14} fill="#413A32" />
          {Array.from({ length: 6 }, (_, c) => (
            <rect
              key={c}
              x={x + 26 + c * ((w - 60) / 6)}
              y={y + 26 + r * ((h - 46) / rows) - 8}
              width={10}
              height={22}
              fill="#544A3E"
            />
          ))}
        </g>
      ))}
      <circle cx={x + w - 30} cy={y + 24} r={9} fill="#1B1916" stroke="#5A5145" strokeWidth="2" />
    </g>
  );
}

/** 扉（枠を彫り込む） */
export function Door({
  x,
  y,
  w,
  h,
  open = false,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  open?: boolean;
  label?: string;
}) {
  return (
    <g>
      <rect x={x - 14} y={y - 14} width={w + 28} height={h + 14} fill="#241F1B" />
      <rect x={x} y={y} width={w} height={h} fill={open ? '#0B0A09' : '#332E28'} />
      {!open && (
        <>
          <rect x={x + 14} y={y + 18} width={w - 28} height={h * 0.42} fill="#3A342C" />
          <rect x={x + 14} y={y + 28 + h * 0.42} width={w - 28} height={h * 0.42} fill="#3A342C" />
          <rect x={x + w - 34} y={y + h * 0.5} width={20} height={7} fill="#6B5D4A" />
          {label !== undefined && (
            <text
              x={x + w / 2}
              y={y + 12}
              fill="#8A7C66"
              fontSize="17"
              letterSpacing="4"
              textAnchor="middle"
              fontFamily="'Helvetica Neue', Arial, sans-serif"
            >
              {label}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/** 壁の掲示物 */
export function Placard({
  x,
  y,
  text,
  warn = false,
}: {
  x: number;
  y: number;
  text: string;
  warn?: boolean;
}) {
  const w = text.length * 15 + 26;
  return (
    <g opacity="0.82">
      <rect x={x} y={y} width={w} height={34} fill={warn ? '#3A2019' : '#2F2B25'} />
      <rect x={x} y={y} width={w} height={34} fill="none" stroke={warn ? PAL.warn : '#5A5145'} strokeWidth="1.5" />
      <text
        x={x + w / 2}
        y={y + 23}
        fill={warn ? '#C97258' : '#8A7C66'}
        fontSize="16"
        letterSpacing="3"
        textAnchor="middle"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * 部屋の箱。一点透視で、天井・左右の壁・床・奥の壁を描く。
 * 消失点は VP、奥の壁は BACK の矩形。壁に置く物は BACK の内側に置く。
 */
export const VP = { x: 800, y: 420 };
export const BACK = { x0: 300, x1: 1300, y0: 104, y1: 620 };

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 床の左右端（手前ほど外へ開く） */
export function floorEdgeX(y: number, side: -1 | 1): number {
  const t = (y - BACK.y1) / (H - BACK.y1);
  return side === -1 ? lerp(BACK.x0, 0, t) : lerp(BACK.x1, W, t);
}

/** 奥の壁を基準にした、その奥行きでの大きさの比 */
export function depthScale(y: number): number {
  return (y - VP.y) / (BACK.y1 - VP.y);
}

export function Room({
  children,
  sideTone = '#2A2621',
  ceilTone = '#1E1B17',
}: {
  children?: ReactNode;
  sideTone?: string;
  ceilTone?: string;
}) {
  const joints = [0.22, 0.46, 0.72];
  return (
    <g>
      {/* 天井 */}
      <polygon points={`0,0 ${W},0 ${BACK.x1},${BACK.y0} ${BACK.x0},${BACK.y0}`} fill={ceilTone} />
      {/* 左右の壁 */}
      <polygon points={`0,0 ${BACK.x0},${BACK.y0} ${BACK.x0},${BACK.y1} 0,${H}`} fill={sideTone} />
      <polygon points={`${W},0 ${BACK.x1},${BACK.y0} ${BACK.x1},${BACK.y1} ${W},${H}`} fill={sideTone} />
      {/* 床 */}
      <polygon
        points={`${BACK.x0},${BACK.y1} ${BACK.x1},${BACK.y1} ${W},${H} 0,${H}`}
        fill="url(#floorGrad)"
      />
      {/* 奥の壁 */}
      <rect
        x={BACK.x0}
        y={BACK.y0}
        width={BACK.x1 - BACK.x0}
        height={BACK.y1 - BACK.y0}
        fill="url(#wallGrad)"
      />

      {/* 側壁の継ぎ目（消失点へ収束する） */}
      {joints.map((t) => (
        <g key={`j${t}`} opacity="0.5">
          <line
            x1={lerp(0, BACK.x0, t)}
            y1={lerp(0, BACK.y0, t)}
            x2={lerp(0, BACK.x0, t)}
            y2={lerp(H, BACK.y1, t)}
            stroke="#191714"
            strokeWidth="3"
          />
          <line
            x1={lerp(W, BACK.x1, t)}
            y1={lerp(0, BACK.y0, t)}
            x2={lerp(W, BACK.x1, t)}
            y2={lerp(H, BACK.y1, t)}
            stroke="#191714"
            strokeWidth="3"
          />
        </g>
      ))}

      {/* 天井の梁 */}
      {joints.map((t) => (
        <line
          key={`c${t}`}
          x1={lerp(0, BACK.x0, t)}
          y1={lerp(0, BACK.y0, t)}
          x2={lerp(W, BACK.x1, t)}
          y2={lerp(0, BACK.y0, t)}
          stroke="#26221D"
          strokeWidth={10 - t * 5}
          opacity="0.8"
        />
      ))}

      {/* 奥の壁の継ぎ目と幅木 */}
      {[0.3, 0.7].map((t) => (
        <rect
          key={`w${t}`}
          x={lerp(BACK.x0, BACK.x1, t)}
          y={BACK.y0}
          width="3"
          height={BACK.y1 - BACK.y0}
          fill="#231F1B"
          opacity="0.6"
        />
      ))}
      <rect x={BACK.x0} y={BACK.y1 - 22} width={BACK.x1 - BACK.x0} height="22" fill="#241F19" opacity="0.8" />
      <rect x={BACK.x0} y={BACK.y1 - 2} width={BACK.x1 - BACK.x0} height="4" fill="#141210" />

      {/* 床の目地（手前ほど間隔が開く） */}
      {[0.16, 0.4, 0.72].map((t) => {
        const y = BACK.y1 + (H - BACK.y1) * t;
        return (
          <line
            key={`f${t}`}
            x1={floorEdgeX(y, -1)}
            y1={y}
            x2={floorEdgeX(y, 1)}
            y2={y}
            stroke="#121110"
            strokeWidth={2 + t * 3}
            opacity="0.55"
          />
        );
      })}

      {children}
    </g>
  );
}

/** シーン共通の defs。光源の位置と色だけ部屋ごとに変える */
export function SceneDefs({
  lightX,
  lightY,
  lightColor = PAL.lit,
  lightRadius = 640,
  lightStrength = 0.44,
  wallTop = '#232019',
  wallBottom = '#35302A',
  floorTone = '#242019',
}: {
  lightX: number;
  lightY: number;
  lightColor?: string;
  lightRadius?: number;
  lightStrength?: number;
  wallTop?: string;
  wallBottom?: string;
  floorTone?: string;
}) {
  return (
    <defs>
      <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={wallTop} />
        <stop offset="1" stopColor={wallBottom} />
      </linearGradient>
      <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={floorTone} />
        <stop offset="1" stopColor="#141210" />
      </linearGradient>
      <radialGradient
        id="lightPool"
        gradientUnits="userSpaceOnUse"
        cx={lightX}
        cy={lightY}
        r={lightRadius}
      >
        <stop offset="0" stopColor={lightColor} stopOpacity={lightStrength} />
        <stop offset="0.34" stopColor={lightColor} stopOpacity={lightStrength * 0.3} />
        <stop offset="1" stopColor={lightColor} stopOpacity="0" />
      </radialGradient>
      <radialGradient id="vignette" gradientUnits="userSpaceOnUse" cx={W / 2} cy={H / 2} r={980}>
        <stop offset="0.3" stopColor="#000" stopOpacity="0" />
        <stop offset="0.72" stopColor="#000" stopOpacity="0.55" />
        <stop offset="1" stopColor="#000" stopOpacity="0.95" />
      </radialGradient>
      {/* コンクリートの粒子 */}
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.28" />
        </feComponentTransfer>
      </filter>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="16" />
      </filter>
    </defs>
  );
}

/** 光だまりと周辺減光。部屋の中身の一番上に重ねる */
export function Lighting() {
  return (
    <g pointerEvents="none">
      <rect x="0" y="0" width={W} height={H} fill="url(#lightPool)" />
      <rect x="0" y="0" width={W} height={H} filter="url(#grain)" opacity="0.5" style={{ mixBlendMode: 'overlay' }} />
      <rect x="0" y="0" width={W} height={H} fill="url(#vignette)" />
    </g>
  );
}
