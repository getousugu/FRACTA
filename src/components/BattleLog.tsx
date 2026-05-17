import { useState } from 'react';
import type { BattleLogEntry } from '../types';

type Props = {
  log: BattleLogEntry[];
};

export function BattleLog({ log }: Props) {
  const [expanded, setExpanded] = useState(false);

  const recent = log.slice(-2);
  const all = [...log].reverse();

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {!expanded ? (
        <div className="battle-log">
          {recent.length === 0 && (
            <div className="battle-log-entry system">バトル開始</div>
          )}
          {recent.map((entry, i) => (
            <div
              key={i}
              className={`battle-log-entry ${entry.actor === 'system' ? 'system' : ''}`}
            >
              {entry.actor !== 'system' && (
                <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>
                  T{entry.turn}
                </span>
              )}
              {entry.description}
            </div>
          ))}
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              marginTop: 4,
              textAlign: 'right',
            }}
          >
            タップで全ログ展開 ▼
          </div>
        </div>
      ) : (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              バトルログ ({log.length}件)
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                padding: '2px 8px',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--bg-card)',
              }}
            >
              閉じる ▲
            </button>
          </div>
          <div
            className="battle-log"
            style={{ maxHeight: 300, overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {all.map((entry, i) => (
              <div
                key={i}
                className={`battle-log-entry ${entry.actor === 'system' ? 'system' : ''}`}
              >
                {entry.actor !== 'system' && (
                  <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>
                    T{entry.turn}
                  </span>
                )}
                {entry.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
