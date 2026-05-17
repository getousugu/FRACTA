import { useState, useEffect, useRef } from 'react';
import { ELEMENT_EMOJI } from '../types';
import type { CharacterState } from '../types';
import { HPBar } from './HPBar';
import { ResourceDisplay } from './ResourceDisplay';
import { StatusEffects } from './StatusEffects';

type Props = {
  char: CharacterState;
  isOpponent?: boolean;
  isActive?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onDetailRequest?: (id: string) => void;
};


export function CharacterCard({
  char,
  isOpponent = false,
  isActive = false,
  compact = false,
  onClick,
  onDetailRequest,
}: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const lastHpRef = useRef(char.hp);
  const [fct, setFct] = useState<{ id: number; text: string; type: 'damage' | 'heal' }[]>([]);

  useEffect(() => {
    if (char.hp !== lastHpRef.current) {
      const diff = char.hp - lastHpRef.current;
      const type = diff < 0 ? 'damage' : 'heal';
      const text = diff < 0 ? `${diff}` : `+${diff}`;
      const id = Date.now() + Math.random();
      
      setFct((prev) => [...prev, { id, text, type }]);
      lastHpRef.current = char.hp;

      const timer = setTimeout(() => {
        setFct((prev) => prev.filter((f) => f.id !== id));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [char.hp]);

  function handleClick() {
    if (onClick) {
      onClick();
    } else if (isOpponent && onDetailRequest) {
      onDetailRequest(char.id);
    } else {
      setDetailOpen(!detailOpen);
    }
  }

  const emoji = ELEMENT_EMOJI[char.element];

  // コンパクト表示（チーム一覧用）
  if (compact) {
    const isPendingSwitch = detailOpen && !!onClick;

    return (
      <div
        className={`card-hover ${isActive ? 'selected' : ''} ${!char.isAlive ? 'opacity-40' : ''}`}
        style={{
          padding: '8px 12px',
          opacity: char.isAlive ? 1 : 0.35,
          cursor: onClick && !isActive && char.isAlive ? 'pointer' : 'default',
          position: 'relative',
          border: isPendingSwitch ? '2px solid var(--accent-gold)' : undefined,
          boxShadow: isPendingSwitch ? '0 0 10px rgba(240,184,64,0.3)' : undefined,
        }}
        onClick={() => {
          if (onClick && !isActive && char.isAlive) {
            setDetailOpen((prev) => !prev);
          }
        }}
      >
        {/* FCT */}
        {fct.map((f) => (
          <div
            key={f.id}
            className="animate-fct"
            style={{
              color: f.type === 'damage' ? 'var(--accent-red-bright)' : 'var(--hp-high)',
              fontSize: 18,
            }}
          >
            {f.text}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <span
            style={{
              fontWeight: 600,
              fontSize: 12,
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={char.name}
          >
            {char.name}
          </span>
          {isActive && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                background: 'var(--accent-red)',
                color: '#fff',
                whiteSpace: 'nowrap',
              }}
            >
              出場
            </span>
          )}
          {onDetailRequest && (
            <button
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '50%',
                width: 22,
                height: 22,
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDetailRequest(char.id);
              }}
            >
              🔍
            </button>
          )}
        </div>
        <HPBar char={char} compact />
        {char.isAlive && char.customResources.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {char.customResources.map((r) => {
              const labelColor = r.id === 'death_sentence'
                ? 'var(--accent-red-bright)'
                : r.id === 'tenacity'
                ? 'var(--accent-gold-bright)'
                : 'var(--accent-gold)';
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, lineHeight: 1.2 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{r.name}</span>
                  <span style={{ fontWeight: 700, color: labelColor }}>{r.value}</span>
                </div>
              );
            })}
          </div>
        )}
        {char.isAlive && char.effects.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <StatusEffects effects={char.effects} />
          </div>
        )}
        {!char.isAlive && (
          <div style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 4, textAlign: 'center' }}>
            戦闘不能
          </div>
        )}
        {/* 交代確認ボタン */}
        {isPendingSwitch && (
          <button
            style={{
              marginTop: 8,
              width: '100%',
              padding: '5px 0',
              background: 'var(--accent-gold)',
              color: '#000',
              fontWeight: 700,
              fontSize: 12,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setDetailOpen(false);
              onClick?.();
            }}
          >
            交代する
          </button>
        )}
      </div>
    );
  }


  // 通常表示（先頭キャラ用）
  return (
    <div>
      <div
        className="card"
        style={{ cursor: 'pointer', position: 'relative' }}
        onClick={handleClick}
      >
        {/* FCT */}
        {fct.map((f) => (
          <div
            key={f.id}
            className="animate-fct"
            style={{
              color: f.type === 'damage' ? 'var(--accent-red-bright)' : 'var(--hp-high)',
            }}
          >
            {f.text}
          </div>
        ))}
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>{emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{char.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ATK {char.atk} / DEF {char.def}
            </div>
          </div>
          {isOpponent && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>相手</span>
          )}
          {onDetailRequest && !isOpponent && (
            <button
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDetailRequest(char.id);
              }}
            >
              🔍
            </button>
          )}
        </div>

        {/* HP */}
        <HPBar char={char} />

        {/* 固有リソース */}
        {char.customResources.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {char.customResources.map((r) => (
              <ResourceDisplay key={r.id} resource={r} />
            ))}
          </div>
        )}

        {/* バフ/デバフ */}
        {char.effects.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <StatusEffects effects={char.effects} />
          </div>
        )}

        {/* タップで詳細展開 */}
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: 'var(--text-muted)',
            textAlign: 'right',
          }}
        >
          {detailOpen ? '▲ 閉じる' : '▼ 詳細'}
        </div>
      </div>

      {/* 詳細パネル */}
      {detailOpen && (
        <div
          className="card animate-fade-in"
          style={{ marginTop: 4, borderTop: '2px solid var(--accent-red)' }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            ステータス詳細
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            <div>HP: <strong>{char.hp}/{char.maxHp}</strong></div>
            <div>ATK: <strong>{char.atk}</strong></div>
            <div>DEF: <strong>{char.def}</strong></div>
            <div>優先度: <strong>{char.priority}</strong></div>
          </div>

          {char.disabledSkills.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--accent-red)', marginBottom: 8 }}>
              使用不可: {char.disabledSkills.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
