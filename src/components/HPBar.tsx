import type { CharacterState } from '../types';

type Props = {
  char: CharacterState;
  compact?: boolean;
};

export function HPBar({ char, compact = false }: Props) {
  const pct = char.maxHp > 0 ? (char.hp / char.maxHp) * 100 : 0;
  const color =
    pct > 50 ? 'var(--hp-high)' : pct > 25 ? 'var(--hp-mid)' : 'var(--hp-low)';

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div className="hp-bar-track" style={{ height: 5 }}>
          <div
            className="hp-bar-fill"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {char.hp}/{char.maxHp}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>HP</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: color, fontVariantNumeric: 'tabular-nums' }}>
          {char.hp.toLocaleString()} / {char.maxHp.toLocaleString()}
        </span>
      </div>
      <div className="hp-bar-track">
        <div
          className="hp-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
