import type { CustomResource } from '../types';

type Props = {
  resource: CustomResource;
};

export function ResourceDisplay({ resource }: Props) {
  const pct = resource.max > 0 ? (resource.value / resource.max) * 100 : 0;

  const isDeath = resource.id === 'death_sentence';
  const isTenacity = resource.id === 'tenacity';

  const labelColor = isDeath
    ? 'var(--accent-red-bright)'
    : isTenacity
    ? 'var(--accent-gold-bright)'
    : 'var(--accent-gold)';

  if (resource.display === 'stack') {
    let displayValue: string | number = resource.value;
    let showMax = true;

    if (resource.display_value !== undefined) {
      displayValue = resource.display_value;
      showMax = false;
    } else if (resource.id === 'current_weapon') {
      const weapons = [
        'ハンドガン',
        'アサルトライフル',
        'ロケットランチャー',
        'サブマシンガン',
        '銃剣'
      ];
      displayValue = weapons[resource.value] ?? '素手';
      showMax = false;
    }

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 6,
          border: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {resource.name}
        </span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: labelColor,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 20,
            textAlign: 'right',
          }}
        >
          {displayValue}
          {showMax && resource.max < 999 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
              /{resource.max}
            </span>
          )}
        </span>
      </div>
    );
  }

  // gauge
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{resource.name}</span>
        <span style={{ fontSize: 11, color: labelColor, fontVariantNumeric: 'tabular-nums' }}>
          {resource.value}/{resource.max}
        </span>
      </div>
      <div className="resource-gauge-track">
        <div
          className="resource-gauge-fill"
          style={{ width: `${pct}%`, backgroundColor: labelColor }}
        />
      </div>
    </div>
  );
}
