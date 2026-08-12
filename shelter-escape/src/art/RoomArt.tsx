import type { ReactElement } from 'react';
import { BreakerPanel, Box, Door, Grate, H, Lighting, PAL, Placard, Room, SceneDefs, Shelving, W } from './scenery';

/**
 * 部屋の絵。rooms.ts のホットスポット座標（%）は、ここで描いた物の位置に合わせてある。
 * 位置を動かしたら rooms.ts の area も直すこと。
 */

interface RoomArtProps {
  solvedHotspotIds: string[];
}

/** 缶詰の山 */
function CanStack({ x, y }: { x: number; y: number }) {
  const cans: { cx: number; cy: number }[] = [];
  for (let row = 0; row < 3; row++) {
    const count = 5 - row;
    for (let i = 0; i < count; i++) {
      cans.push({ cx: x + i * 42 + row * 21, cy: y - row * 40 });
    }
  }
  return (
    <g>
      {cans.map((c, i) => (
        <g key={i}>
          <rect x={c.cx} y={c.cy - 38} width={36} height={38} fill="#4A4238" />
          <rect x={c.cx} y={c.cy - 38} width={11} height={38} fill="#5C5245" />
          <rect x={c.cx + 26} y={c.cy - 38} width={10} height={38} fill="#332E28" />
          <ellipse cx={c.cx + 18} cy={c.cy - 38} rx={18} ry={6} fill="#6B5D4A" />
          <ellipse cx={c.cx + 18} cy={c.cy - 38} rx={11} ry={3.5} fill="#4E463B" />
          <rect x={c.cx} y={c.cy - 24} width={36} height={11} fill="#2E2A24" opacity="0.55" />
        </g>
      ))}
    </g>
  );
}

/** 配給票やレーションの箱 */
function CrateStack({ x, y, cols = 2, rows = 3 }: { x: number; y: number; cols?: number; rows?: number }) {
  const bw = 138;
  const bh = 68;
  return (
    <g>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <g key={`${r}-${c}`}>
            <Box
              x={x + c * (bw + 6) + (r % 2) * 12}
              y={y - r * (bh + 4)}
              w={bw}
              h={bh}
              depth={18}
              face="#3A332A"
              top="#4A4136"
              side="#282320"
            />
            <rect
              x={x + c * (bw + 6) + (r % 2) * 12 + 22}
              y={y - r * (bh + 4) + 26}
              width={94}
              height={4}
              fill="#6B5D4A"
              opacity="0.5"
            />
          </g>
        )),
      )}
    </g>
  );
}

function MessHall() {
  const lightX = 360;
  const lightY = 200;
  return (
    <>
      <SceneDefs lightX={lightX} lightY={lightY} />
      <Room horizon={640}>
        {/* 天井から下がった作業灯。この部屋唯一の光源 */}
        <rect x={lightX - 2} y="0" width="4" height="96" fill="#241F1B" />
        <polygon
          points={`${lightX - 62},146 ${lightX + 62},146 ${lightX + 30},96 ${lightX - 30},96`}
          fill="#3A332B"
        />
        <ellipse cx={lightX} cy={148} rx={26} ry={10} fill={PAL.lit} opacity="0.85" />

        <Placard x={92} y={214} text="配　給" />
        <Placard x={1176} y={96} text="通風 B-2" />

        {/* 奥の長机 */}
        <Box x={520} y={556} w={300} h={92} depth={26} face="#2C2823" top="#39332B" side="#211E1A" />
        <Box x={880} y={568} w={250} h={84} depth={22} face="#292520" top="#342F28" side="#1F1C19" />

        {/* 配膳台と缶詰 */}
        <Box x={60} y={470} w={420} h={214} depth={34} face="#353029" top="#4A4238" side="#25221D" />
        <CanStack x={116} y={468} />

        {/* 通風ダクトの格子 */}
        <Grate x={1190} y={132} w={230} h={148} slats={7} />

        {/* 保管庫への扉 */}
        <Door x={700} y={250} w={210} h={390} label="保管庫" />

        {/* 床の散乱物 */}
        <ellipse cx={640} cy={806} rx={54} ry={12} fill="#100F0D" opacity="0.7" />
        <rect x={604} y={790} width={72} height={14} fill="#3A342C" />
      </Room>
      <Lighting />
    </>
  );
}

function Storage({ solvedHotspotIds }: RoomArtProps) {
  const moved = solvedHotspotIds.includes('storage_shelf');
  const lightX = 190;
  const lightY = 706;
  return (
    <>
      <SceneDefs lightX={lightX} lightY={lightY} wallTop="#262320" wallBottom="#39342D" />
      <Room horizon={660}>
        {/* 棚の裏に現れる通路。奥は暗く、手前の枠にだけ光が当たる */}
        <rect x={624} y={236} width={240} height={430} fill="#0A0908" />
        {moved && (
          <>
            <rect x={624} y={236} width={240} height={430} fill="url(#passageDepth)" />
            <rect x={624} y={236} width={13} height={430} fill="#5A5145" opacity="0.42" />
            <rect x={851} y={236} width={13} height={430} fill="#2E2A24" opacity="0.6" />
          </>
        )}
        <rect x={610} y={222} width={268} height={16} fill="#2A2621" />

        <Placard x={62} y={168} text="第三保管" />

        {/* 壁際の棚とレーション */}
        <Shelving x={300} y={214} w={250} h={452} levels={4} />
        <CrateStack x={318} y={370} cols={1} rows={2} />
        <CrateStack x={318} y={594} cols={1} rows={1} />

        {/* 通路を塞ぐ鋼製の棚。押すと横へ逃げる */}
        <g transform={moved ? 'translate(244 0)' : undefined}>
          <Shelving x={640} y={180} w={330} h={486} levels={5} tone="#38322A" />
          <CrateStack x={656} y={340} cols={2} rows={2} />
          <CrateStack x={656} y={648} cols={2} rows={1} />
          {/* 床に残る擦り跡 */}
        </g>
        {moved && (
          <>
            <rect x={640} y={690} width={330} height={10} fill="#1B1917" opacity="0.8" />
            <rect x={846} y={694} width={250} height={5} fill="#544A3E" opacity="0.4" />
          </>
        )}

        {/* 食堂へ戻る扉 */}
        <Door x={70} y={270} w={190} h={390} label="食堂" />

        {/* 右手のレーション箱 */}
        <CrateStack x={1246} y={676} cols={2} rows={3} />

        {/* 床置きのランタン（この部屋の光源） */}
        <rect x={lightX - 26} y={lightY - 58} width={52} height={58} fill="#2A2621" />
        <rect x={lightX - 18} y={lightY - 50} width={36} height={38} fill={PAL.lit} opacity="0.85" />
        <rect x={lightX - 6} y={lightY - 74} width={12} height={16} fill="#2A2621" />
        <ellipse cx={lightX} cy={lightY - 30} rx={92} ry={40} fill={PAL.lit} opacity="0.1" filter="url(#softShadow)" />
      </Room>
      <Lighting />
    </>
  );
}

function PowerRoom({ solvedHotspotIds }: RoomArtProps) {
  const open = solvedHotspotIds.includes('power_plate');
  const lightX = 1290;
  const lightY = 190;
  return (
    <>
      <SceneDefs
        lightX={lightX}
        lightY={lightY}
        lightColor={PAL.warn}
        lightRadius={520}
        lightStrength={0.3}
        wallTop="#201D18"
        wallBottom="#2F2B25"
        floorTone="#221F1A"
      />
      <Room horizon={650}>
        {/* 配電盤 */}
        <BreakerPanel x={180} y={196} w={520} h={330} />
        <rect x={180} y={140} width={520} height={16} fill="#2A2621" />
        {[260, 420, 580].map((x) => (
          <rect key={x} x={x} y={100} width={14} height={96} fill="#3A342C" />
        ))}
        <Placard x={744} y={236} text="高圧 注意" warn />

        {/* 非常灯（この部屋の光源） */}
        <rect x={lightX - 34} y={lightY - 74} width={68} height={30} fill="#2A2621" />
        <ellipse cx={lightX} cy={lightY - 40} rx={30} ry={26} fill={PAL.warn} opacity="0.9" />
        <ellipse cx={lightX} cy={lightY - 40} rx={54} ry={48} fill={PAL.warn} opacity="0.22" filter="url(#softShadow)" />

        {/* 隔壁扉。プレートを踏むと開き、非常階段が現れる */}
        <rect x={986} y={186} width={378} height={478} fill="#1A1815" />
        {open ? (
          <g>
            <rect x={1004} y={202} width={342} height={456} fill="#0B0A09" />
            {/* 上へ向かう非常階段：側桁・段板・蹴込み・手すり */}
            <polygon points="1004,652 1310,254 1346,254 1346,300 1052,652" fill="#232019" />
            {Array.from({ length: 8 }, (_, i) => {
              const sx = 1020 + i * 40;
              const sy = 622 - i * 48;
              return (
                <g key={i} opacity={0.94 - i * 0.06}>
                  <rect x={sx} y={sy} width={132} height={11} fill="#4A4238" />
                  <rect x={sx} y={sy + 11} width={132} height={30} fill="#221F1B" />
                </g>
              );
            })}
            <polygon points="1000,624 1300,224 1318,224 1018,624" fill="#3A342C" opacity="0.5" />
            <rect x={1004} y={202} width={342} height={120} fill={PAL.lit} opacity="0.07" />
          </g>
        ) : (
          <g>
            <rect x={1004} y={202} width={342} height={456} fill="#332E28" />
            <rect x={1024} y={222} width={302} height={416} fill="#3B342C" />
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} cx={1046 + i * 92} cy={640} r={9} fill="#22201C" />
            ))}
            <rect x={1150} y={396} width={54} height={54} fill="#2A2621" stroke="#5A5145" strokeWidth="3" />
          </g>
        )}
        <Placard x={1006} y={140} text={open ? '開放' : '閉鎖'} warn={!open} />

        {/* 圧力プレート */}
        <ellipse cx={730} cy={782} rx={186} ry={62} fill="#221F1B" />
        <ellipse cx={730} cy={776} rx={170} ry={54} fill={open ? '#2C2823' : '#38322B'} />
        <ellipse cx={730} cy={776} rx={128} ry={40} fill="none" stroke="#544A3E" strokeWidth="3" />
        <ellipse cx={730} cy={open ? 780 : 770} rx={92} ry={28} fill="#453E35" />
        {/* 脇の計器 */}
        <rect x={946} y={700} width={16} height={92} fill="#2E2A24" />
        <circle cx={954} cy={694} r={22} fill="#241F1B" stroke="#5A5145" strokeWidth="2" />
        <rect x={952} y={676} width={3} height={18} fill={open ? PAL.lit : PAL.warn} />

        {/* 保管庫へ戻る通路 */}
        <rect x={28} y={272} width={196} height={402} fill="#2A2621" />
        <rect x={40} y={286} width={172} height={380} fill="#0A0908" />
        <rect x={40} y={286} width={10} height={380} fill="#453E35" opacity="0.5" />
        <rect x={40} y={618} width={172} height={48} fill="#A89880" opacity="0.05" />
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
