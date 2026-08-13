import type { ReactElement } from 'react';
import {
  BACK,
  Box,
  BreakerPanel,
  Door,
  Grate,
  H,
  Lighting,
  PAL,
  Placard,
  Room,
  SceneDefs,
  Shelving,
  W,
} from './scenery';

/**
 * 部屋の絵。1600x900 の一点透視で、奥の壁は BACK の矩形。
 * rooms.ts のホットスポット座標（%）は、ここで描いた物の位置に合わせてある。
 * 位置を動かしたら rooms.ts の area も直すこと。
 */

interface RoomArtProps {
  solvedHotspotIds: string[];
}

/** 缶詰の山 */
function CanStack({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const s = scale;
  const cans: { cx: number; cy: number }[] = [];
  for (let row = 0; row < 3; row++) {
    const count = 5 - row;
    for (let i = 0; i < count; i++) {
      cans.push({ cx: x + (i * 42 + row * 21) * s, cy: y - row * 40 * s });
    }
  }
  return (
    <g>
      {cans.map((c, i) => (
        <g key={i}>
          <rect x={c.cx} y={c.cy - 38 * s} width={36 * s} height={38 * s} fill="#4A4238" />
          <rect x={c.cx} y={c.cy - 38 * s} width={11 * s} height={38 * s} fill="#5C5245" />
          <rect x={c.cx + 26 * s} y={c.cy - 38 * s} width={10 * s} height={38 * s} fill="#332E28" />
          <ellipse cx={c.cx + 18 * s} cy={c.cy - 38 * s} rx={18 * s} ry={6 * s} fill="#6B5D4A" />
          <ellipse cx={c.cx + 18 * s} cy={c.cy - 38 * s} rx={11 * s} ry={3.5 * s} fill="#4E463B" />
          <rect
            x={c.cx}
            y={c.cy - 24 * s}
            width={36 * s}
            height={11 * s}
            fill="#2E2A24"
            opacity="0.55"
          />
        </g>
      ))}
    </g>
  );
}

/** レーションの箱の山 */
function CrateStack({
  x,
  y,
  cols = 2,
  rows = 3,
  scale = 1,
}: {
  x: number;
  y: number;
  cols?: number;
  rows?: number;
  scale?: number;
}) {
  const bw = 138 * scale;
  const bh = 68 * scale;
  return (
    <g>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const bx = x + c * (bw + 6) + (r % 2) * 12 * scale;
          const by = y - r * (bh + 4);
          return (
            <g key={`${r}-${c}`}>
              <Box
                x={bx}
                y={by}
                w={bw}
                h={bh}
                depth={18 * scale}
                face="#3A332A"
                top="#4A4136"
                side="#282320"
              />
              <rect
                x={bx + 22 * scale}
                y={by + 26 * scale}
                width={bw * 0.68}
                height={4}
                fill="#6B5D4A"
                opacity="0.5"
              />
            </g>
          );
        }),
      )}
    </g>
  );
}

/** 天井から下がった作業灯 */
function WorkLamp({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 2} y={0} width={4} height={y - 46} fill="#241F1B" />
      <polygon
        points={`${x - 58},${y} ${x + 58},${y} ${x + 28},${y - 46} ${x - 28},${y - 46}`}
        fill="#3A332B"
      />
      <ellipse cx={x} cy={y + 2} rx={24} ry={9} fill={PAL.lit} opacity="0.9" />
      <ellipse cx={x} cy={y + 6} rx={72} ry={34} fill={PAL.lit} opacity="0.12" filter="url(#softShadow)" />
    </g>
  );
}

function MessHall() {
  const lightX = 620;
  const lightY = 250;
  return (
    <>
      <SceneDefs lightX={lightX} lightY={lightY} lightRadius={700} />
      <Room>
        <WorkLamp x={lightX} y={lightY - 58} />

        {/* 奥の壁：掲示・扉・ダクト（人物が立つ右手前は空けておく） */}
        <Grate x={326} y={192} w={224} h={144} slats={7} />
        <Placard x={326} y={146} text="通風 B-2" />
        <Door x={700} y={252} w={200} h={368} label="保管庫" />
        <Placard x={968} y={216} text="配　給" />

        {/* 奥の長机（壁際） */}
        <Box x={360} y={532} w={230} h={62} depth={18} face="#2C2823" top="#39332B" side="#211E1A" />

        {/* 手前の配膳台と缶詰。手前なので大きく描く */}
        <Box x={110} y={516} w={450} h={240} depth={42} face="#353029" top="#4A4238" side="#25221D" />
        <CanStack x={168} y={514} scale={1.06} />

        {/* 床の散乱物 */}
        <ellipse cx={1200} cy={800} rx={64} ry={13} fill="#100F0D" opacity="0.6" />
        <rect x={1160} y={782} width={80} height={16} fill="#3A342C" />
      </Room>
      <Lighting />
    </>
  );
}

function Storage({ solvedHotspotIds }: RoomArtProps) {
  const moved = solvedHotspotIds.includes('storage_shelf');
  const lightX = 250;
  const lightY = 742;
  return (
    <>
      <SceneDefs lightX={lightX} lightY={lightY} lightRadius={780} />
      <defs>
        <linearGradient id="passageDepth" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#A89880" stopOpacity="0.15" />
          <stop offset="0.6" stopColor="#A89880" stopOpacity="0.03" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Room>
        {/* 棚の裏に現れる通路 */}
        <rect x={790} y={232} width={210} height={388} fill="#080807" />
        {moved && (
          <>
            <rect x={790} y={232} width={210} height={388} fill="url(#passageDepth)" />
            <rect x={790} y={232} width={12} height={388} fill="#5A5145" opacity="0.45" />
            <rect x={988} y={232} width={12} height={388} fill="#2E2A24" opacity="0.6" />
          </>
        )}
        <rect x={778} y={218} width={234} height={16} fill="#2A2621" />

        <Placard x={332} y={152} text="第三保管" />
        <Door x={340} y={252} w={180} h={368} label="食堂" />

        {/* 壁際の棚 */}
        <Shelving x={556} y={236} w={196} h={384} levels={4} />
        <CrateStack x={568} y={382} cols={1} rows={2} scale={0.82} />
        <CrateStack x={568} y={572} cols={1} rows={1} scale={0.82} />

        {/* 通路を塞ぐ鋼製の棚。押すと横へ逃げる */}
        <g transform={moved ? 'translate(220 0)' : undefined}>
          <Shelving x={800} y={196} w={286} h={424} levels={5} tone="#38322A" />
          <CrateStack x={812} y={346} cols={2} rows={2} scale={0.86} />
          <CrateStack x={812} y={608} cols={2} rows={1} scale={0.86} />
        </g>
        {moved && (
          <>
            <rect x={800} y={606} width={286} height={12} fill="#1B1917" opacity="0.7" />
            <rect x={1000} y={610} width={200} height={5} fill="#544A3E" opacity="0.35" />
          </>
        )}

        {/* 手前のレーション箱 */}
        <CrateStack x={1150} y={828} cols={2} rows={3} scale={1.16} />

        {/* 床置きのランタン（この部屋の光源） */}
        <rect x={lightX - 28} y={lightY - 62} width={56} height={62} fill="#2A2621" />
        <rect x={lightX - 19} y={lightY - 53} width={38} height={40} fill={PAL.lit} opacity="0.85" />
        <rect x={lightX - 6} y={lightY - 78} width={12} height={16} fill="#2A2621" />
        <ellipse
          cx={lightX}
          cy={lightY - 24}
          rx={112}
          ry={44}
          fill={PAL.lit}
          opacity="0.1"
          filter="url(#softShadow)"
        />
      </Room>
      <Lighting />
    </>
  );
}

function PowerRoom({ solvedHotspotIds }: RoomArtProps) {
  const open = solvedHotspotIds.includes('power_plate');
  const lightX = 1190;
  const lightY = 214;
  return (
    <>
      <SceneDefs
        lightX={lightX}
        lightY={lightY}
        lightColor={PAL.warn}
        lightRadius={560}
        lightStrength={0.3}
        wallTop="#201D18"
        wallBottom="#2F2B25"
        floorTone="#221F1A"
      />
      <Room>
        {/* 配電盤 */}
        <BreakerPanel x={352} y={228} w={392} h={286} />
        <rect x={352} y={188} width={392} height={14} fill="#2A2621" />
        {[404, 528, 652].map((x) => (
          <rect key={x} x={x} y={BACK.y0} width={12} height={84} fill="#3A342C" />
        ))}
        <Placard x={598} y={544} text="高圧 注意" warn />

        {/* 非常灯（この部屋の光源） */}
        <rect x={lightX - 30} y={lightY - 68} width={60} height={26} fill="#2A2621" />
        <ellipse cx={lightX} cy={lightY - 38} rx={26} ry={23} fill={PAL.warn} opacity="0.9" />
        <ellipse
          cx={lightX}
          cy={lightY - 38}
          rx={52}
          ry={46}
          fill={PAL.warn}
          opacity="0.2"
          filter="url(#softShadow)"
        />

        {/* 隔壁扉。プレートを踏むと開き、非常階段が現れる */}
        <rect x={952} y={232} width={296} height={390} fill="#1A1815" />
        {open ? (
          <g>
            <rect x={966} y={246} width={268} height={374} fill="#0A0908" />
            {/* 上へ向かう非常階段：段板・蹴込み・側桁 */}
            {Array.from({ length: 7 }, (_, i) => {
              const sx = 978 + i * 34;
              const sy = 592 - i * 44;
              return (
                <g key={i} opacity={0.95 - i * 0.07}>
                  <rect x={sx} y={sy} width={114} height={10} fill="#4A4238" />
                  <rect x={sx} y={sy + 10} width={114} height={28} fill="#211E1A" />
                </g>
              );
            })}
            <polygon points="966,600 1206,292 1220,292 980,600" fill="#3A342C" opacity="0.42" />
            <rect x={966} y={246} width={268} height={104} fill={PAL.lit} opacity="0.07" />
          </g>
        ) : (
          <g>
            <rect x={966} y={246} width={268} height={374} fill="#332E28" />
            <rect x={984} y={264} width={232} height={338} fill="#3B342C" />
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} cx={1002 + i * 72} cy={604} r={8} fill="#22201C" />
            ))}
            <rect x={1074} y={402} width={48} height={48} fill="#2A2621" stroke="#5A5145" strokeWidth="3" />
          </g>
        )}
        <Placard x={952} y={188} text={open ? '開　放' : '閉　鎖'} warn={!open} />

        {/* 保管庫へ戻る通路（左の側壁に開いた口） */}
        <polygon points="176,232 302,250 302,622 176,680" fill="#0A0908" />
        <polygon points="176,232 302,250 302,266 176,250" fill="#453E35" opacity="0.45" />
        <rect x={296} y={250} width={10} height={372} fill="#2A2621" />

        {/* 圧力プレート（手前の床） */}
        <ellipse cx={720} cy={766} rx={196} ry={64} fill="#1F1C18" />
        <ellipse cx={720} cy={758} rx={178} ry={56} fill={open ? '#2C2823' : '#38322B'} />
        <ellipse cx={720} cy={758} rx={132} ry={41} fill="none" stroke="#544A3E" strokeWidth="3" />
        <ellipse cx={720} cy={open ? 762 : 752} rx={94} ry={29} fill="#453E35" />
        {/* 脇の計器 */}
        <rect x={962} y={688} width={16} height={88} fill="#2E2A24" />
        <circle cx={970} cy={682} r={22} fill="#241F1B" stroke="#5A5145" strokeWidth="2" />
        <rect x={968} y={664} width={3} height={18} fill={open ? PAL.lit : PAL.warn} />
      </Room>
      <Lighting />
    </>
  );
}

const ART: Record<string, (p: RoomArtProps) => ReactElement> = {
  mess_hall: MessHall,
  storage: Storage,
  power_room: PowerRoom,
};

export function RoomArt({ roomId, solvedHotspotIds }: { roomId: string } & RoomArtProps) {
  const Art = ART[roomId];
  return (
    <svg
      className="scene__art"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {Art ? <Art solvedHotspotIds={solvedHotspotIds} /> : null}
    </svg>
  );
}
