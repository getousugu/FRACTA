import { useState } from 'react';
import type { CharacterData, SkillData, DerivedSkillData } from '../types';
import { ELEMENT_EMOJI } from '../types';

type Props = {
  charData: CharacterData;
  onClose: () => void;
  onSelect?: (id: string) => void;
  isAlreadyInTeam?: boolean;
};

// 汎用・固有バフと用語の辞書定義
const GLOSSARY: Record<string, string> = {
  '火傷': '毎ターン終了時に（火傷の数値 - 対象の防御力/4）分のダメージ（最低1）を与え、その後に数値が半減（端数切り捨て、半減後数値が5以下になると消失）する',
  '敵陣突破': '交代（スイッチアウト）時に次の味方に付与されるバフ。次に使用するスキルの与ダメージを（引き継いだ敵陣膠着スタック数×10%）上昇させ、攻撃後に消費される。',
  '死の宣告': 'ルート.J専用のリソース。ターン経過やスキル使用によって増加し、15に達するとそのターン終了時に戦闘不能（死亡）になる。',
  '敵陣膠着': 'ルート.J専用のリソース。増加するほど受けるダメージが減少する（最大10%）。交代時に次の味方に「敵陣突破」バフとして引き継がれる。',
  '食いしばり': 'HPが0になるダメージを受けた際に、一度だけHP1で耐えることができる状態。',
  '連撃スタック': 'ローラン専用のリソース。スキル使用によって蓄積し、スタック数×10%だけ与ダメージ（ATK）が上昇する（ターン終了時にリセット）。',
  '武器習熟カウント': 'ローラン専用のリソース。異なる武器（スキル）を使用するごとに蓄積し、9に達するとアルティメットスキル「Furioso」が解放される。',
  'マナ': '氷の魔導士専用のリソース。ターン開始時に+2され、スキル「マナバースト」や「ヒーリング」の消費に用いる（最大10）。',
  '時計針': '時詠みの魔女専用のリソース。スキル使用によって増減し、12に達すると「時計の一循」に変換される。',
  '時計の一循': '時詠みの魔女専用のリソース。時計針が12に達するごとに1増え、スタック数に応じてATKとDEFが永続的に上昇する。',
  '制圧小隊': 'EPP専用のリソース。所持している場合、アクティブスキルの効果が所持数分だけ再使用（追加発動）される。',
  '突撃小隊': 'EPP専用のリソース。所持している場合、アクティブスキルの効果が（所持数-2）回だけ再使用されるほか、突撃小隊×5%だけATKが上昇する。',
  '熱量': '炎射被験体専用のリソース。スキル使用によって蓄積し、一定以上になるとスキルが強化され、追加の火傷を付与する（最大100）。',
  '手札': 'ディール専用のリソース。手札のジョーカーや数字、色によって、各種スキルやパッシブの効果が変化する。'
};

// マウスホバーで説明を表示するツールチップラッパー
function TooltipWrapper({ keyword, description, children }: { keyword: string, description: string, children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  function handleMouseMove(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.top + window.scrollY - 10
    });
  }

  return (
    <span
      className="tooltip-trigger"
      style={{
        borderBottom: '1px dashed var(--accent-gold)',
        cursor: 'help',
        position: 'relative',
        display: 'inline-block',
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onMouseMove={handleMouseMove}
    >
      {children}
      {visible && (
        <span
          className="tooltip-content"
          style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: 'translate(-50%, -100%)',
            background: '#151b30',
            border: '1px solid var(--border-bright)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '11px',
            color: 'var(--text-primary)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 9999,
            pointerEvents: 'none',
            whiteSpace: 'normal',
            width: '240px',
            textAlign: 'left',
            lineHeight: '1.4'
          }}
        >
          <strong style={{ display: 'block', color: 'var(--accent-gold)', marginBottom: '4px', fontSize: '12px' }}>{keyword}</strong>
          {description}
        </span>
      )}
    </span>
  );
}

// 説明テキスト中のキーワードを自動で検出して下線＆ホバー化するコンポーネント
function FormattedDescription({ text }: { text: string }) {
  if (!text) return null;

  const keywords = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  if (keywords.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${keywords.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})`, 'g');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        if (GLOSSARY[part]) {
          return (
            <TooltipWrapper key={index} keyword={part} description={GLOSSARY[part]}>
              {part}
            </TooltipWrapper>
          );
        }
        return part;
      })}
    </>
  );
}

function SkillCard({ skill, isDerived = false }: { skill: SkillData | DerivedSkillData, isDerived?: boolean }) {
  return (
    <div className="card" style={{
      padding: isDerived ? '10px' : '12px',
      borderLeft: isDerived ? '3px solid var(--accent-gold)' : undefined,
      background: isDerived ? 'rgba(253, 203, 110, 0.05)' : undefined,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{
          fontWeight: 700,
          color: isDerived ? 'var(--accent-gold)' : 'var(--accent-red-bright)',
          fontSize: isDerived ? 13 : 14
        }}>
          {isDerived && (
            <span style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--accent-gold)', borderRadius: 3, marginRight: 6 }}>派生</span>
          )}
          {skill.name}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: isDerived ? 'var(--accent-gold)' : undefined }}>COST {skill.cost}</span>
      </div>
      <p style={{ fontSize: isDerived ? 11 : 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
        <FormattedDescription text={skill.description} />
      </p>
      {skill.flavor_text && (
        <p style={{ fontSize: isDerived ? 10 : 11, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.4, margin: '8px 0 0 0', whiteSpace: 'pre-wrap' }}>
          {skill.flavor_text}
        </p>
      )}
    </div>
  );
}

function SkillTree({ skill, allDerivedSkills }: { skill: SkillData | DerivedSkillData, allDerivedSkills: DerivedSkillData[] }) {
  const children = allDerivedSkills.filter(ds => ds.unlocked_by === skill.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SkillCard skill={skill} isDerived={'unlocked_by' in skill} />
      {children.length > 0 && (
        <div style={{
          marginLeft: 20,
          display: 'flex',
          flexDirection: children.length > 1 ? 'row' : 'column',
          gap: 12,
          flexWrap: 'wrap',
          borderLeft: '1px dashed rgba(255,255,255,0.1)',
          paddingLeft: 8
        }}>
          {children.map(child => (
            <div key={child.id} style={{ flex: children.length > 1 ? '1 1 calc(50% - 6px)' : '1', minWidth: '220px' }}>
              <SkillTree skill={child} allDerivedSkills={allDerivedSkills} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CharacterDetailModal({
  charData,
  onClose,
  onSelect,
  isAlreadyInTeam = false,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '1000px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>{ELEMENT_EMOJI[charData.element]}</span>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '0.05em' }}>{charData.name}</h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>
                {charData.element.toUpperCase()} ELEMENT
              </p>
            </div>
          </div>

          {/* ステータス数値系バッジ（横並び） */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="card" style={{ padding: '6px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px', borderRadius: '8px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--hp-high)' }}>{charData.hp}</div>
            </div>
            <div className="card" style={{ padding: '6px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px', borderRadius: '8px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>ATK</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-red-bright)' }}>{charData.atk}</div>
            </div>
            <div className="card" style={{ padding: '6px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px', borderRadius: '8px' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>DEF</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-blue-bright)' }}>{charData.def}</div>
            </div>
            <button
              onClick={onClose}
              style={{ fontSize: 28, color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 16, background: 'none', border: 'none' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* コンテンツ: 左右2カラム分割 */}
        <div className="detail-grid" style={{ padding: '24px' }}>

          {/* 左側: スキルカラム */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* フレーバーテキスト */}
            {charData.flavor_text && (
              <div style={{
                fontStyle: 'italic',
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                borderLeft: '3px solid var(--accent-gold)',
                paddingLeft: 12,
                marginBottom: 8
              }}>
                {charData.flavor_text}
              </div>
            )}

            <div>
              <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>ACTIVE SKILLS</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {charData.skills.map((s) => (
                  <SkillTree key={s.id} skill={s} allDerivedSkills={charData.derived_skills} />
                ))}

                {/* 特殊解放スキル (Furioso等) */}
                {charData.derived_skills
                  .filter(ds => !charData.skills.some(s => s.id === ds.unlocked_by) &&
                    !charData.derived_skills.some(ods => ods.id === ds.unlocked_by))
                  .map(ds => (
                    <div key={ds.id} className="card" style={{
                      padding: '12px',
                      border: '2px solid var(--accent-red-bright)',
                      background: 'rgba(255, 107, 107, 0.05)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-red-bright)' }}>
                          <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--accent-red-bright)', color: '#fff', borderRadius: 3, marginRight: 8 }}>ULTIMATE</span>
                          {ds.name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700 }}>COST {ds.cost}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
                        <FormattedDescription text={ds.description} />
                      </p>
                      {ds.flavor_text && (
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.4, marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                          {ds.flavor_text}
                        </p>
                      )}
                      {charData.id === 'char_loran' && (
                        <div style={{ fontSize: 10, color: 'var(--accent-red-bright)', marginTop: 8, fontWeight: 600 }}>
                          ※武器習熟カウントが9に達すると解放
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* 右側: パッシブカラム */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {charData.passives.length > 0 ? (
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>PASSIVE SKILLS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {charData.passives.map((p) => (
                    <div key={p.id} className="card" style={{ padding: '12px', borderLeft: '3px solid var(--accent-gold)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
                        <FormattedDescription text={p.description} />
                      </p>
                      {p.flavor_text && (
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.4, marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                          {p.flavor_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: '12px', padding: '32px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>パッシブスキルなし</span>
              </div>
            )}
          </div>

        </div>

        {/* フッターアクション */}
        {onSelect && (
          <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
            <button
              className={isAlreadyInTeam ? 'btn-secondary' : 'btn-gold'}
              style={{ width: '100%', padding: '12px' }}
              onClick={() => {
                onSelect(charData.id);
                onClose();
              }}
            >
              {isAlreadyInTeam ? 'チームから外す' : 'チームに編成する'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
