const LETTERS = [
  ['n', 'n'],
  ['a-first', 'a'],
  ['c-first', 'c'],
  ['k', 'k'],
  ['c-second', 'c'],
  ['h', 'h'],
  ['a-second', 'a'],
  ['l', 'l'],
] as const;

export function BrandMark({
  animated = false,
  compact = false,
}: {
  readonly animated?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <span
      className={`brand-mark${compact ? ' brand-compact' : ''}${animated ? ' brand-animated' : ''}`}
      role="img"
      aria-label="nackchal"
    >
      <span className="brand-lettering" aria-hidden="true">
        {LETTERS.map(([id, letter]) => (
          <span className="brand-glyph" key={id}>
            {letter}
          </span>
        ))}
      </span>
      <span className="brand-gavel" aria-hidden="true">
        <span className="gavel-shadow" />
        <img className="gavel-base" src="/art/brand/gavel-block.png" width="512" height="512" alt="" />
        <img className="gavel-mallet" src="/art/brand/gavel-mallet.png" width="512" height="512" alt="" />
        <span className="gavel-impact">
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}
