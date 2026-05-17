import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getAllCharacterData } from '../lib/battle-engine';
import { ELEMENT_EMOJI } from '../types';
import { CharacterDetailModal } from '../components/CharacterDetailModal';

// ランダムに3体選出する関数（重複なし）
const generateRandomCpuTeam = (allCharIds: string[]): string[] => {
  const cpuTeam: string[] = [];
  const availableIds = [...allCharIds];
  for (let i = 0; i < 3; i++) {
    if (availableIds.length === 0) break;
    const randIdx = Math.floor(Math.random() * availableIds.length);
    cpuTeam.push(availableIds[randIdx]);
    availableIds.splice(randIdx, 1);
  }
  return cpuTeam;
};

export default function Lobby() {
  const {
    peerId, connected, p2pError,
    lobby, selectMyChar, deselectMyChar, lockTeam, cancelLock, returnHome,
    myTeamId, appPhase, startSolo
  } = useGameStore();

  const [detailCharId, setDetailCharId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const allChars = getAllCharacterData();
  const isSolo = appPhase === 'solo';
  const isHost = myTeamId === 'team1';
  
  const detailChar = allChars.find(c => c.id === detailCharId);



  return (
    <div className="page" style={{ padding: '24px' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, maxWidth: 1100, margin: '0 auto 24px' }}>
        <button className="btn-secondary" style={{ padding: '8px 16px' }} onClick={returnHome}>
          ← 戻る
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>戦術編成</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? 'var(--hp-high)' : 'var(--accent-red)',
            }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {connected ? 'CONNECTED' : 'WAITING FOR OPPONENT...'}
            </span>
          </div>
        </div>
      </div>

      <div className="layout-split">
        {/* 左側: キャラクターリスト */}
        <div className="layout-left">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)' }}>ROSTER</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{allChars.length} Characters Available</span>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
            gap: 12,
            maxHeight: 'calc(100vh - 200px)',
            overflowY: 'auto',
            paddingRight: 8
          }}>
            {allChars.map((char) => {
              const inTeam = lobby.myTeam.includes(char.id);
              return (
                <div
                  key={char.id}
                  className={`card-hover ${inTeam ? 'selected' : ''}`}
                  style={{ 
                    padding: '16px', 
                    textAlign: 'center',
                    position: 'relative',
                    opacity: lobby.myLocked ? 0.6 : 1,
                    cursor: lobby.myLocked ? 'default' : 'pointer',
                    userSelect: 'none'
                  }}
                  onClick={() => {
                    if (lobby.myLocked) return;
                    if (inTeam) deselectMyChar(char.id);
                    else selectMyChar(char.id);
                  }}
                >
                  {/* 詳細表示ボタン (右上) */}
                  <button
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.1)', border: 'none',
                      color: '#fff', fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      zIndex: 10
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailCharId(char.id);
                    }}
                    title="詳細を表示"
                  >
                    🔍
                  </button>

                  <div style={{ fontSize: 32, marginBottom: 8 }}>{ELEMENT_EMOJI[char.element]}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{char.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    HP {char.hp} / ATK {char.atk}
                  </div>
                  {inTeam && (
                    <div style={{ 
                      position: 'absolute', top: 36, right: 8, 
                      width: 20, height: 20, borderRadius: '50%', 
                      background: 'var(--accent-red)', color: '#fff',
                      fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右側: チームスロット & 状態 */}
        <div className="layout-right">
          <div className="card" style={{ padding: '24px', position: 'sticky', top: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>MY SQUAD</h2>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-gold)' }}>
                  {lobby.myTeam.length} / 3
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1, 2].map((i) => {
                  const id = lobby.myTeam[i];
                  const char = id ? allChars.find(c => c.id === id) : null;
                  return (
                    <div 
                      key={i}
                      style={{ 
                        height: 70, 
                        borderRadius: 12, 
                        border: `1px dashed ${char ? 'var(--accent-red)' : 'var(--border)'}`,
                        background: char ? 'rgba(192, 57, 43, 0.05)' : 'rgba(255,255,255,0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 16px',
                        gap: 12,
                        cursor: char && !lobby.myLocked ? 'pointer' : 'default',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => char && !lobby.myLocked && deselectMyChar(char.id)}
                    >
                      {char ? (
                        <>
                          <span style={{ fontSize: 24 }}>{ELEMENT_EMOJI[char.element]}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{char.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>HP {char.hp} / ATK {char.atk}</div>
                          </div>
                          {!lobby.myLocked && <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>×</span>}
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12, width: '100%', textAlign: 'center' }}>
                          EMPTY SLOT {i + 1}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="divider" />

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                {isSolo ? 'MISSION TARGET' : 'OPPONENT STATUS'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: isSolo || connected ? (lobby.opponentLocked || isSolo ? 'var(--hp-high)' : 'var(--accent-gold)') : 'var(--text-muted)',
                }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {isSolo ? 'CPU READY' : !connected ? 'NOT CONNECTED' : lobby.opponentLocked ? 'LOCKED & READY' : 'PREPARING...'}
                </span>
              </div>
            </div>

            {lobby.myLocked ? (
              <button 
                className={isSolo ? 'btn-gold animate-pulse-glow' : 'btn-secondary'} 
                style={{ width: '100%', padding: '14px' }} 
                onClick={() => {
                  if (isSolo) {
                    const ids = allChars.map(c => c.id);
                    if (ids.length === 0) {
                      alert('キャラクターデータが見つかりません。');
                      return;
                    }
                    const cpuTeam = generateRandomCpuTeam(ids);
                    startSolo(lobby.myTeam, cpuTeam);
                  } else {
                    cancelLock();
                  }
                }}
              >
                {isSolo ? 'MISSION START' : '変更する'}
              </button>
            ) : (
              <button 
                className="btn-gold" 
                style={{ width: '100%', padding: '14px' }} 
                disabled={lobby.myTeam.length !== 3}
                onClick={lockTeam}
              >
                編成を確定する
              </button>
            )}

            {!isSolo && isHost && peerId && (
              <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>ROOM CODE</div>
                <div 
                  style={{ 
                    fontSize: 12, 
                    fontWeight: 700, 
                    fontFamily: 'monospace', 
                    cursor: 'pointer', 
                    color: copied ? 'var(--hp-high)' : 'var(--accent-gold)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(peerId);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <span>{peerId}</span>
                  <span style={{ fontSize: 10 }}>{copied ? 'COPIED!' : 'CLICK TO COPY'}</span>
                </div>
              </div>
            )}
            
            {p2pError && (
              <div style={{ marginTop: 16, color: 'var(--accent-red)', fontSize: 12, textAlign: 'center' }}>
                ⚠ {p2pError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 詳細モーダル */}
      {detailChar && (
        <CharacterDetailModal
          charData={detailChar}
          onClose={() => setDetailCharId(null)}
          onSelect={!lobby.myLocked ? (id) => {
            if (lobby.myTeam.includes(id)) deselectMyChar(id);
            else selectMyChar(id);
          } : undefined}
          isAlreadyInTeam={lobby.myTeam.includes(detailChar.id)}
        />
      )}
    </div>
  );
}
