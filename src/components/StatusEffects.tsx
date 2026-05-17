import { useState, useRef, useEffect } from 'react';
import type { StatusEffect } from '../types';

type Props = {
  effects: StatusEffect[];
};

function getIcon(effect: StatusEffect): string {
  switch (effect.category) {
    case 'stat':
      return effect.value >= 0 ? '↑' : '↓';
    case 'dot':
      return '🔥';
    case 'regen':
      return '♥';
    case 'cc': {
      const n = effect.name;
      if (n.includes('スタン') || n.includes('気絶')) return '⚡';
      if (n.includes('スロウ') || n.includes('遅')) return '🐢';
      if (n.includes('沈黙') || n.includes('封印')) return '🔇';
      if (n.includes('束縛') || n.includes('拘束')) return '⛓';
      if (n.includes('眠') || n.includes('睡眠')) return '💤';
      return '💫';
    }
    default:
      return '✨';
  }
}

function getDesc(effect: StatusEffect): string {
  const sign = effect.value >= 0 ? '+' : '';
  const valText = effect.mode === 'mul' ? `${Math.round(effect.value * 100)}%` : effect.value;
  const turns = effect.turnsRemaining === -1 ? '永続' : `${effect.turnsRemaining}T`;
  const stacks = effect.currentStacks > 1 ? ` (x${effect.currentStacks})` : '';

  let effectText: string;
  switch (effect.category) {
    case 'stat':
      effectText = `${effect.stat} ${sign}${valText}`;
      break;
    case 'dot':
      effectText = `${effect.value}ダメージ/T`;
      break;
    case 'regen':
      effectText = `${effect.value}回復/T`;
      break;
    default:
      effectText = effect.value !== 0 ? `${sign}${valText}` : '';
  }

  return `${effect.name}${stacks}: ${effectText} [${turns}]`;
}

export function StatusEffects({ effects }: Props) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick() { setTooltip(null); }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (effects.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, position: 'relative' }}>
      {effects.map((effect, i) => {
        return (
          <button
            key={i}
            className={`status-icon ${effect.category} ${
              effect.category === 'dot' ? 'dot'
              : effect.category === 'regen' ? 'buff'
              : effect.category === 'cc' ? 'debuff'
              : effect.value < 0 ? 'debuff' : 'buff'
            }`}
            title={getDesc(effect)}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.target as HTMLElement).getBoundingClientRect();
              setTooltip({
                text: getDesc(effect),
                x: rect.left,
                y: rect.bottom + 4,
              });
            }}
          >
            <span style={{ fontSize: 10 }}>{getIcon(effect)}</span>
            {effect.currentStacks > 1 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  fontSize: 8,
                  fontWeight: 900,
                  color: 'var(--accent-gold-bright)',
                  textShadow: '0 0 2px #000',
                }}
              >
                {effect.currentStacks}
              </span>
            )}
            {effect.turnsRemaining !== -1 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: -3,
                  right: -3,
                  fontSize: 9,
                  background: 'var(--bg-base)',
                  borderRadius: 3,
                  padding: '0 2px',
                  lineHeight: 1.2,
                  color: 'var(--text-muted)',
                }}
              >
                {effect.turnsRemaining}
              </span>
            )}
          </button>
        );
      })}

      {tooltip && (
        <div
          ref={tooltipRef}
          className="tooltip"
          style={{ position: 'fixed', top: tooltip.y, left: tooltip.x }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
