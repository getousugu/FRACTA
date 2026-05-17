import type { CharacterData, SkillData, DerivedSkillData } from '../types';
import { ELEMENT_EMOJI } from '../types';

type Props = {
  charData: CharacterData;
  onClose: () => void;
  onSelect?: (id: string) => void;
  isAlreadyInTeam?: boolean;
};

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
      <p style={{ fontSize: isDerived ? 11 : 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{skill.description}</p>
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
        <div style={{ marginLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '1px dashed rgba(255,255,255,0.1)' }}>
          {children.map(child => (
            <SkillTree key={child.id} skill={child} allDerivedSkills={allDerivedSkills} />
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>{ELEMENT_EMOJI[charData.element]}</span>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{charData.name}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                {charData.element.toUpperCase()} ELEMENT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ fontSize: 24, color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {/* コンテンツ */}
        <div style={{ padding: '24px' }}>
          {/* フレーバーテキスト */}
          {charData.flavor_text && (
            <div style={{
              marginBottom: 24,
              fontStyle: 'italic',
              color: 'rgba(255, 255, 255, 0.85)',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              borderLeft: '2px solid var(--border)',
              paddingLeft: 12
            }}>
              {charData.flavor_text}
            </div>
          )}

          {/* 基本ステータス */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            <div className="card" style={{ textAlign: 'center', padding: '10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>HP</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{charData.hp}</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>ATK</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{charData.atk}</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>DEF</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{charData.def}</div>
            </div>
          </div>

          {/* スキル */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>SKILLS</h3>
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
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{ds.description}</p>
                    {ds.flavor_text && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 1.4, marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                        {ds.flavor_text}
                      </p>
                    )}
                    {charData.id === 'char_indicate' && (
                      <div style={{ fontSize: 10, color: 'var(--accent-red-bright)', marginTop: 8, fontWeight: 600 }}>
                        ※武器習熟カウントが9に達すると解放
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          </div>

          {/* パッシブ */}
          {charData.passives.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>PASSIVES</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {charData.passives.map((p) => (
                  <div key={p.id} className="card" style={{ padding: '12px', borderLeft: '3px solid var(--accent-gold)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{p.description}</p>
                    {p.flavor_text && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 1.4, marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                        {p.flavor_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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
