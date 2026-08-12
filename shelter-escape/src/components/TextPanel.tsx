/** 部屋の描写と、直近3件のログ（仕様書 §7） */
export function TextPanel({ bodyText, log }: { bodyText: string; log: string[] }) {
  const recent = log.slice(-3);
  return (
    <div className="panel">
      <p className="panel__body">{bodyText}</p>
      <ul className="panel__log" aria-live="polite">
        {recent.map((line, i) => (
          <li
            key={`${log.length - recent.length + i}`}
            className={i === recent.length - 1 ? 'is-latest' : undefined}
          >
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
