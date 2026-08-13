import { useId, useMemo, type CSSProperties } from 'react';
import type { Stage } from '../game/types';
import { buildFigure } from './figure';

export interface FigureProps {
  stage: Stage;
  /** 光源の向き。部屋ごとに変える */
  lightFrom?: 'left' | 'right';
  lightColor?: string;
  /** 接地影を描くか */
  contactShadow?: boolean;
  className?: string;
  style?: CSSProperties;
  /** 表示高さ（px）。viewBox は段階で変えないので、段階間で拡大縮小しない */
  height?: number;
}

const TONE = {
  skin: '#6B5340',
  jacket: '#2E2A24',
  shirt: '#413A31',
  trousers: '#38332C',
  boots: '#1D1B18',
  belt: '#241F1A',
  collar: '#2A2620',
  hair: '#241F1A',
  base: '#2A2521',
};

// 全段階で共通の viewBox。段階が変わっても画面上の縮尺は変えない
const VIEW = { x: -215, y: -26, w: 430, h: 802 };

export function Figure({
  stage,
  lightFrom = 'left',
  lightColor = '#A89880',
  contactShadow = true,
  className,
  style,
  height,
}: FigureProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = useMemo(() => buildFigure(stage), [stage]);

  const id = (name: string) => `${name}-${uid}`;
  const url = (name: string) => `url(#${id(name)})`;

  const lit = lightFrom === 'left';
  const blurs = useMemo(
    () => Array.from(new Set(g.occlusion.map((o) => o.blur))).sort((a, b) => a - b),
    [g],
  );

  const parts = (fill: string, keyPrefix: string) => (
    <>
      {g.parts.legs.map((d, i) => (
        <path key={`${keyPrefix}leg${i}`} d={d} fill={fill} />
      ))}
      {g.parts.feet.map((d, i) => (
        <path key={`${keyPrefix}foot${i}`} d={d} fill={fill} />
      ))}
      <path key={`${keyPrefix}torso`} d={g.parts.torso} fill={fill} />
      <path key={`${keyPrefix}neck`} d={g.parts.neck} fill={fill} />
      <path key={`${keyPrefix}head`} d={g.parts.head} fill={fill} />
      {g.parts.arms.map((d, i) => (
        <path key={`${keyPrefix}arm${i}`} d={d} fill={fill} />
      ))}
      {g.parts.hands.map((d, i) => (
        <path key={`${keyPrefix}hand${i}`} d={d} fill={fill} />
      ))}
    </>
  );

  return (
    <svg
      className={className}
      style={style}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      height={height}
      role="img"
      aria-label={`主人公（体重 ${g.physique.weightKg}kg）`}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <clipPath id={id('body')}>{parts('#000', 'clip')}</clipPath>

        {/* 光の当たる側 */}
        <linearGradient id={id('key')} x1={lit ? '0' : '1'} y1="0" x2={lit ? '1' : '0'} y2="0.15">
          <stop offset="0" stopColor={lightColor} stopOpacity="0.5" />
          <stop offset="0.22" stopColor={lightColor} stopOpacity="0.26" />
          <stop offset="0.62" stopColor={lightColor} stopOpacity="0" />
        </linearGradient>
        {/* 影の側 */}
        <linearGradient id={id('shade')} x1={lit ? '1' : '0'} y1="0" x2={lit ? '0' : '1'} y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.62" />
          <stop offset="0.35" stopColor="#000000" stopOpacity="0.3" />
          <stop offset="0.78" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
        {/* 足元ほど暗い */}
        <linearGradient id={id('floorFall')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000000" stopOpacity="0" />
          <stop offset="0.55" stopColor="#000000" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id={id('lobe')}>
          <stop offset="0" stopColor={lightColor} stopOpacity="0.9" />
          <stop offset="0.5" stopColor={lightColor} stopOpacity="0.34" />
          <stop offset="1" stopColor={lightColor} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('contact')}>
          <stop offset="0" stopColor="#000000" stopOpacity="0.78" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('cast')}>
          <stop offset="0" stopColor="#000000" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#000000" stopOpacity="0.22" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {blurs.map((b) => (
          <filter
            key={b}
            id={id(`blur${String(b).replace('.', '_')}`)}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation={b} />
          </filter>
        ))}

        {/* 腕が体幹に落とす影 */}
        <filter id={id('armShadow')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="8" />
          <feOffset dx={lit ? 9 : -9} dy="7" />
        </filter>

        {/* 輪郭光：全パーツの和集合の外周だけを取り出す（内側の継ぎ目は出ない） */}
        <filter id={id('rim')} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="erode" radius="2.6" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feFlood floodColor={lightColor} floodOpacity="1" result="tint" />
          <feComposite in="tint" in2="edge" operator="in" />
        </filter>
        <linearGradient id={id('rimGrad')} x1={lit ? '0' : '1'} y1="0" x2={lit ? '1' : '0'} y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={id('rimMask')}>
          <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill={url('rimGrad')} />
        </mask>
      </defs>

      {contactShadow && (
        <g>
          {/* 光と反対側へ伸びる落ち影 */}
          <ellipse
            cx={g.contact.cx}
            cy={g.contact.cy}
            rx={g.contact.rx * 1.35}
            ry={g.contact.ry * 1.15}
            fill={url('cast')}
            transform={`translate(${(lit ? 1 : -1) * g.contact.rx * 0.75} 0) skewX(${lit ? -16 : 16})`}
          />
          {/* 接地点の暗さ */}
          <ellipse
            cx={g.contact.cx}
            cy={g.contact.cy}
            rx={g.contact.rx * 0.78}
            ry={g.contact.ry * 0.7}
            fill={url('contact')}
          />
        </g>
      )}

      {/* 素体 */}
      {parts(TONE.base, 'base')}

      {/* 着衣・陰影はすべて身体の和集合でクリップする */}
      <g clipPath={url('body')}>
        {/* 素肌 */}
        {parts(TONE.skin, 'skin')}
        {/* 着衣：下から順に重ねる */}
        <path d={g.clothes.trousers} fill={TONE.trousers} />
        {g.clothes.boots.map((d, i) => (
          <path key={`boot-${i}`} d={d} fill={TONE.boots} />
        ))}
        {g.clothes.belt !== '' && <path d={g.clothes.belt} fill={TONE.belt} />}
        <path d={g.clothes.shirt} fill={TONE.shirt} />
        {g.clothes.jacket.map((d, i) => (
          <path key={`jacket-${i}`} d={d} fill={TONE.jacket} />
        ))}
        <path d={g.clothes.collar} fill={TONE.collar} />

        {/* 腕は体幹の前にある。落ち影を先に敷いてから腕を描くことで、
            太った段階でも腕が胴の塊に溶けない */}
        <g filter={url('armShadow')} opacity="0.75">
          {g.parts.arms.map((d, i) => (
            <path key={`armshadow-${i}`} d={d} fill="#000" />
          ))}
          {g.parts.hands.map((d, i) => (
            <path key={`handshadow-${i}`} d={d} fill="#000" />
          ))}
        </g>
        {g.parts.arms.map((d, i) => (
          <path key={`arm-skin-${i}`} d={d} fill={TONE.skin} />
        ))}
        {g.parts.hands.map((d, i) => (
          <path key={`hand-${i}`} d={d} fill={TONE.skin} />
        ))}
        {g.clothes.shirtSleeves.map((d, i) => (
          <path key={`ssleeve2-${i}`} d={d} fill={TONE.shirt} />
        ))}
        {g.clothes.jacketSleeves.map((d, i) => (
          <path key={`jsleeve-${i}`} d={d} fill={TONE.jacket} />
        ))}
        <path d={g.parts.hairTail} fill={TONE.hair} />
        <path d={g.parts.hair} fill={TONE.hair} />

        {/* 光 */}
        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill={url('key')} />
        {g.highlights.map((l, i) => (
          <ellipse
            key={`lobe-${i}`}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry={l.ry}
            fill={url('lobe')}
            opacity={l.opacity}
            transform={lit ? undefined : `translate(${-2 * l.cx} 0)`}
          />
        ))}
        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill={url('shade')} />
        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill={url('floorFall')} />

        {/* 陰影（皺・段差・落ち影） */}
        {g.occlusion.map((o, i) => (
          <path
            key={`occ-${i}`}
            d={o.d}
            fill={o.stroke === undefined ? '#000' : 'none'}
            stroke={o.stroke === undefined ? undefined : '#000'}
            strokeWidth={o.stroke}
            strokeLinecap="round"
            opacity={o.opacity}
            filter={url(`blur${String(o.blur).replace('.', '_')}`)}
          />
        ))}
      </g>

      {/* 輪郭光 */}
      <g mask={url('rimMask')} opacity="0.85">
        <g filter={url('rim')}>{parts('#000', 'rim')}</g>
      </g>
    </svg>
  );
}
