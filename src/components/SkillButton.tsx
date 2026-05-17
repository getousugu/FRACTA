import { useState } from 'react';

type Props = {
  skillId: string;
  name: string;
  cost: number;
  description: string;
  flavorText?: string;
  isDerived?: boolean;
  isDisabled?: boolean;
  insufficientCost?: boolean;
  onUse: (skillId: string) => void;
};

export function SkillButton({
  skillId,
  name,
  cost,
  description,
  flavorText,
  isDerived = false,
  isDisabled = false,
  insufficientCost = false,
  onUse,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const disabled = isDisabled || insufficientCost;
  const classNames = [
    'skill-btn',
    isDerived ? 'skill-btn--derived' : '',
    disabled ? 'skill-btn--disabled' : '',
    expanded && !disabled ? 'skill-btn--expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  function handleClick() {
    if (disabled) return;
    onUse(skillId);
  }

  return (
    <div 
      style={{ position: 'relative' }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button className={classNames} onClick={handleClick}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* コストドット */}
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  className={`cost-dot ${i < cost ? '' : 'empty'}`}
                  style={{ width: 8, height: 8 }}
                />
              ))}
            </div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {isDerived && (
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--accent-gold)',
                    marginRight: 4,
                    border: '1px solid var(--accent-gold)',
                    borderRadius: 3,
                    padding: '0 3px',
                  }}
                >
                  派生
                </span>
              )}
              {name}
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              color: isDerived ? 'var(--accent-gold)' : 'var(--accent-red)',
              fontWeight: 700,
            }}
          >
            コスト {cost}
          </span>
        </div>

        {/* 説明文展開 */}
        {expanded && (
          <div
            className="animate-fade-in"
            style={{
              marginTop: 8,
              padding: '8px 0 4px',
              borderTop: `1px solid ${isDerived ? 'var(--accent-gold)' : 'var(--border)'}`,
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {description}
            {flavorText && (
              <div style={{
                marginTop: 8,
                fontSize: 11,
                color: 'rgba(255,255,255,0.7)',
                fontStyle: 'italic',
              }}>
                {flavorText}
              </div>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
