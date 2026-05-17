import { useGameStore, runCpuTurnIfNeeded } from '../store/gameStore';
import { getActive, getAllCharacterData } from '../lib/battle-engine';
import { CharacterCard } from '../components/CharacterCard';
import { SkillButton } from '../components/SkillButton';
import { BattleLog } from '../components/BattleLog';
import { CharacterDetailModal } from '../components/CharacterDetailModal';
import { useEffect, useState, useRef } from 'react';

export default function Battle() {
  const {
    battle,
    myTeamId,
    isSoloMode,
    dispatchAction,
    returnHome,
    timerRemaining,
    p2pError,
  } = useGameStore();

  const lastTurnRef = useRef(0);
  const isCpuRunningRef = useRef(false);
  const [showTurnOverlay, setShowTurnOverlay] = useState(false);
  const [effectClass, setEffectClass] = useState('');
  const [detailCharId, setDetailCharId] = useState<string | null>(null);

  const isSolo = isSoloMode;
  const myTeam = myTeamId;
  const enemyTeam = myTeam === 'team1' ? 'team2' : 'team1';

  const allChars = getAllCharacterData();
  const detailChar = allChars.find(c => c.id === detailCharId);

  // ターン開始演出
  useEffect(() => {
    if (battle && battle.turn > lastTurnRef.current && battle.phase === 'action') {
      lastTurnRef.current = battle.turn;
      setTimeout(() => setShowTurnOverlay(true), 0);
      const timer = setTimeout(() => setShowTurnOverlay(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [battle]);

  // ダメージ演出
  useEffect(() => {
    if (!battle || battle.phase !== 'action') return;
    const lastLog = battle.log[battle.log.length - 1];
    if (lastLog && lastLog.description.includes('ダメージ')) {
      setTimeout(() => setEffectClass('animate-shake animate-flash-red'), 0);
      const timer = setTimeout(() => setEffectClass(''), 500);
      return () => clearTimeout(timer);
    }
  }, [battle]);

  // ソロモードの場合、CPUターンを処理するエフェクト
  useEffect(() => {
    if (isSolo && battle && battle.phase !== 'finished') {
      const isCpuSelectingFirst = battle.phase === 'selecting_first' && !battle[enemyTeam].characters.some(c => c.isActive);
      const isCpuSelectingNext = battle.phase === 'selecting_next' && battle.currentTurn === enemyTeam;
      const isCpuActionTurn = battle.phase === 'action' && battle.currentTurn === enemyTeam;

      if (isCpuSelectingFirst || isCpuSelectingNext || isCpuActionTurn) {
        if (isCpuRunningRef.current) return;
        isCpuRunningRef.current = true;
        // 少し待ってからCPUが行動
        const timer = setTimeout(() => {
          const newState = runCpuTurnIfNeeded(battle, myTeam);
          if (newState !== battle) {
            useGameStore.setState({ battle: newState });
          }
          isCpuRunningRef.current = false;
        }, 1000);
        return () => {
          clearTimeout(timer);
          isCpuRunningRef.current = false;
        };
      }
    }
  }, [battle, isSolo, myTeam, enemyTeam]);


  if (!battle) return null;

  // --- フェーズごとの画面 ---

  // 勝敗決定
  if (battle.phase === 'finished') {
    const isWin = battle.winner === myTeam;
    const isDraw = battle.winner === null;
    return (
      <div className="page-center" style={{ flexDirection: 'column', gap: 20 }}>
        <h1 style={{ fontSize: 40, color: isWin ? 'var(--hp-high)' : isDraw ? 'var(--text-muted)' : 'var(--accent-red)' }}>
          {isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT'}
        </h1>
        <button className="btn-secondary" onClick={returnHome}>ホームに戻る</button>
      </div>
    );
  }

  // 先頭選択・次キャラ選択
  const myReady = battle[myTeam].characters.some(c => c.isActive);
  if (
    (battle.phase === 'selecting_first' && !myReady) ||
    (battle.phase === 'selecting_next' && battle.currentTurn === myTeam)
  ) {
    const isNext = battle.phase === 'selecting_next';
    return (
      <div className="page" style={{ padding: 20, maxWidth: 600, margin: '0 auto', gap: 16 }}>
        <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700 }}>
          {isNext ? '次のキャラクターを選択してください' : '先頭キャラクターを選択してください'}
        </h1>
        {timerRemaining !== null && (
          <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, color: 'var(--accent-gold)' }}>
            残り {timerRemaining} 秒
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {battle[myTeam].characters.map((c, i) => (
            <CharacterCard
              key={c.id}
              char={c}
              compact
              isActive={c.isActive}
              onDetailRequest={setDetailCharId}
              onClick={() => {
                if (!c.isAlive) return;
                if (isNext && c.isActive) return;
                dispatchAction({
                  type: isNext ? 'select_next' : 'select_first',
                  characterIndex: i,
                });
              }}
            />
          ))}
        </div>
        {isNext && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>
            ※時間切れの場合はランダムに選択されます
          </div>
        )}
      </div>
    );
  }

  // 相手の選択待ち
  if (
    (battle.phase === 'selecting_first' && myReady) ||
    (battle.phase === 'selecting_next' && battle.currentTurn === enemyTeam)
  ) {
    return (
      <div className="page-center" style={{ flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>
          {isSolo ? 'CPUが思考中...' : '相手がキャラクターを選択中...'}
        </h1>
      </div>
    );
  }

  // --- メインバトル画面 ---

  const myActive = getActive(battle, myTeam);
  const enemyActive = getActive(battle, enemyTeam);
  const isMyTurn = battle.currentTurn === myTeam;

  const charData = getAllCharacterData().find((d) => d.id === myActive.id);
  // 表示するスキル（通常スキル＋解放済み派生）
  type DisplaySkill = {
    id: string;
    name: string;
    cost: number;
    description: string;
    flavor_text?: string;
    isDerived: boolean;
  };
  const displaySkills: DisplaySkill[] = charData ? charData.skills.map((s) => ({ ...s, isDerived: false })) : [];
  myActive.unlockedDerivedSkills.forEach((u) => {
    if (u.available === 'next_turn') return; // 次ターン解放分はまだ出さない
    const ds = charData?.derived_skills.find((d) => d.id === u.skillId);
    if (ds) displaySkills.push({ ...ds, isDerived: true });
  });

  return (
    <div 
      className={`page ${effectClass}`} 
      style={{ 
        background: 'var(--bg-battle)',
        padding: '16px', gap: 16,
        transition: 'background-color 0.3s ease',
        display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden'
      }}
    >
      {/* ターンオーバーレイ */}
      {showTurnOverlay && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', zIndex: 100, pointerEvents: 'none'
        }}>
          <div className="animate-slide-up" style={{
            fontSize: 48, fontWeight: 900, color: 'var(--accent-gold-bright)',
            textShadow: '0 0 20px rgba(240,184,64,0.5)', letterSpacing: '0.2em'
          }}>
            TURN {battle.turn}
          </div>
        </div>
      )}

      {/* 詳細モーダル */}
      {detailChar && (
        <CharacterDetailModal
          charData={detailChar}
          onClose={() => setDetailCharId(null)}
        />
      )}



      {/* 切断エラー */}
      {p2pError && (
        <div style={{ background: 'var(--accent-red)', padding: 10, borderRadius: 6, textAlign: 'center', fontWeight: 700, zIndex: 50 }}>
          {p2pError}
          <button className="btn-secondary" style={{ marginLeft: 16, padding: '4px 8px' }} onClick={returnHome}>
            ホームに戻る
          </button>
        </div>
      )}

      {/* --- バトルフィールド --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900, margin: '0 auto', width: '100%' }}>
        
        {/* 敵チーム（控え） */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {battle[enemyTeam].characters.map((c) => (
            <div style={{ width: 140 }} key={c.id}>
              <CharacterCard 
                char={c} 
                compact 
                isOpponent 
                onDetailRequest={setDetailCharId}
              />
            </div>
          ))}
        </div>

        {/* アリーナ中央: 対峙エリア */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-around', gap: 24 }}>
          {/* 敵先頭 */}
          <div style={{ flex: 1, transform: 'scale(1.1)', transition: 'transform 0.3s' }}>
            <CharacterCard 
              char={enemyActive} 
              isOpponent 
              onDetailRequest={setDetailCharId}
            />
          </div>

          <div style={{ 
            fontSize: 24, fontWeight: 900, color: 'var(--text-muted)', 
            fontStyle: 'italic', opacity: 0.3 
          }}>
            VS
          </div>

          {/* 自分先頭 */}
          <div style={{ flex: 1, transform: 'scale(1.1)', transition: 'transform 0.3s' }}>
            <CharacterCard 
              char={myActive} 
              onDetailRequest={setDetailCharId}
            />
          </div>
        </div>

        {/* 味方チーム（控え） */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {battle[myTeam].characters.map((c, i) => (
            <div style={{ width: 140 }} key={c.id}>
              <CharacterCard
                char={c}
                compact
                isActive={c.isActive}
                onDetailRequest={setDetailCharId}
                onClick={() => {
                  if (!isMyTurn || battle.usedSkillThisTurn || !c.isAlive || c.isActive) return;
                  dispatchAction({ type: 'switch_character', characterIndex: i });
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* --- 下部操作セクション --- */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        {/* ログ */}
        <div style={{ height: 200 }}>
          <BattleLog log={battle.log} />
        </div>

        {/* 操作パネル */}
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ 
              fontSize: 16, fontWeight: 800, 
              color: isMyTurn ? 'var(--accent-red-bright)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              {isMyTurn && <span className="animate-pulse-glow" style={{ width: 8, height: 8, background: 'var(--accent-red)', borderRadius: '50%' }} />}
              {isMyTurn ? 'YOUR TURN' : 'ENEMY TURN'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>REMAINING COST</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`cost-dot ${i < battle.remainingCost ? '' : 'empty'}`}
                    style={{ width: 12, height: 12 }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, opacity: isMyTurn ? 1 : 0.5 }}>
            {displaySkills.map((s) => {
              const isDisabled = myActive.disabledSkills.includes(s.id);
              const insufficient = s.cost > battle.remainingCost;
              return (
                <SkillButton
                  key={s.id}
                  skillId={s.id}
                  name={s.name}
                  cost={s.cost}
                  description={s.description}
                  flavorText={s.flavor_text}
                  isDerived={s.isDerived}
                  isDisabled={!isMyTurn || isDisabled}
                  insufficientCost={insufficient}
                  onUse={(id) => dispatchAction({ type: 'use_skill', skillId: id })}
                />
              );
            })}
          </div>

          <button
            className="btn-secondary"
            style={{ marginTop: 'auto', padding: '10px', opacity: isMyTurn ? 1 : 0.35, cursor: isMyTurn ? 'pointer' : 'not-allowed' }}
            disabled={!isMyTurn}
            onClick={() => dispatchAction({ type: 'end_turn' })}
          >
            END TURN
          </button>
        </div>
      </div>
    </div>
  );
}
