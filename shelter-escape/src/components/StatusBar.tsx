/**
 * 部屋名と体重。数値は体重(kg)だけを出す。
 * 「段階3」のような内部用語は絶対にUIへ出さない（仕様書 §7）。
 */
export function StatusBar({ roomName, weightKg }: { roomName: string; weightKg: number }) {
  return (
    <div className="statusbar">
      <span className="statusbar__room">{roomName}</span>
      <span className="statusbar__weight">
        {weightKg}
        <span className="statusbar__unit">kg</span>
      </span>
    </div>
  );
}
