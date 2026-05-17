import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getAllCharacterData } from '../lib/battle-engine';
import { CharacterDetailModal } from '../components/CharacterDetailModal';
import { ELEMENT_EMOJI } from '../types';

export default function Home() {
  const { playerName, setPlayerName, hostRoom } = useGameStore();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(playerName);
  const [joinId, setJoinId] = useState('');
  const [joining, setJoining] = useState(false);
  const [detailCharId, setDetailCharId] = useState<string | null>(null);
  const { joinRoom, startSoloLobby } = useGameStore();

  const allChars = getAllCharacterData();
  const detailChar = allChars.find(c => c.id === detailCharId);

  return (
    <div className="page-center" style={{ flexDirection: 'column', gap: 32, padding: '20px' }}>
      {/* 詳細モーダル */}
      {detailChar && (
        <CharacterDetailModal
          charData={detailChar}
          onClose={() => setDetailCharId(null)}
        />
      )}

      {/* タイトル */}
      <div style={{ textAlign: 'center' }}>
        <h1
          className="animate-slide-up"
          style={{
            fontSize: 64,
            fontWeight: 900,
            letterSpacing: '0.2em',
            background: 'linear-gradient(135deg, #fff 0%, var(--accent-gold-bright) 50%, var(--accent-red-bright) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 8,
            filter: 'drop-shadow(0 0 30px rgba(253, 203, 110, 0.4))',
            textShadow: '0 0 40px rgba(214, 48, 49, 0.3)'
          }}
        >
          FRACTA
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, letterSpacing: '0.05em' }}>
          1v1 ターン制対戦ゲーム
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* プレイヤー名 */}
        <div className="card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>プレイヤー名</div>
          {editingName ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPlayerName(nameInput.trim() || 'Player');
                    setEditingName(false);
                  }
                }}
                autoFocus
                style={{ flex: 1 }}
                maxLength={20}
              />
              <button
                className="btn-secondary"
                style={{ padding: '8px 14px', fontSize: 12 }}
                onClick={() => {
                  setPlayerName(nameInput.trim() || 'Player');
                  setEditingName(false);
                }}
              >
                保存
              </button>
            </div>
          ) : (
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => { setNameInput(playerName); setEditingName(true); }}
            >
              <span style={{ fontWeight: 700, fontSize: 18 }}>{playerName}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>タップして編集</span>
            </div>
          )}
        </div>

        {/* ルーム作成 */}
        <button className="btn-primary" style={{ width: '100%', padding: '14px' }} onClick={() => hostRoom()}>
          ⚔️ ルームを作る
        </button>

        {/* ルーム参加 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ルームに参加する</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="ルームコードを入力..."
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: 13 }}
              disabled={!joinId.trim() || joining}
              onClick={async () => {
                setJoining(true);
                await joinRoom(joinId.trim());
                setJoining(false);
              }}
            >
              接続
            </button>
          </div>
        </div>

        {/* ソロモード */}
        <button
          className="btn-secondary"
          style={{ 
            width: '100%', padding: '14px', 
            border: '1px solid var(--border-bright)',
            background: 'rgba(255,255,255,0.02)' 
          }}
          onClick={() => {
            startSoloLobby();
          }}
        >
          🤖 SOLO MISSION (CPU戦)
        </button>
      </div>

      {/* キャラ一覧プレビュー */}
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'center' }}>
          — キャラクター —
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {allChars.map((c) => (
            <div
              key={c.id}
              className="card-hover"
              style={{ minWidth: 140, textAlign: 'center', cursor: 'pointer' }}
              onClick={() => setDetailCharId(c.id)}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>
                {ELEMENT_EMOJI[c.element]}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                HP {c.hp} / ATK {c.atk}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
