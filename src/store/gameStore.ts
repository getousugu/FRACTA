import { create } from 'zustand';
import type { BattleState, PlayerAction, Team } from '../types';
import {
  createInitialBattleState,
  createTeamState,
  processAction,
} from '../lib/battle-engine';
import {
  createRoom,
  joinRoom,
  sendStateUpdate,
  sendAction,
  sendTeamLocked,
  sendTeamCancel,
  startTimer,
  stopTimer,
  isHost,
  cleanup,
} from '../lib/p2p';
import { cpuSelectFirst, cpuSelectNext, cpuTakeTurn } from '../lib/cpu';

// ============================================================
// ストア型
// ============================================================

export type AppPhase =
  | 'home'
  | 'lobby'
  | 'battle'
  | 'solo';

export type LobbyState = {
  myTeam: string[];       // 自分の選択中charId配列
  myLocked: boolean;
  opponentLocked: boolean;
  opponentTeam: string[];
};

type GameStore = {
  // ----- アプリ状態 -----
  appPhase: AppPhase;
  playerName: string;
  myTeamId: 'team1' | 'team2';

  // ----- P2P -----
  peerId: string | null;      // 自分のPeer ID（ホスト時）
  connected: boolean;
  p2pError: string | null;
  isSoloMode: boolean;

  // ----- ロビー -----
  lobby: LobbyState;

  // ----- タイマー -----
  timerRemaining: number | null;

  // ----- バトル -----
  battle: BattleState | null;

  // ----- アクション -----
  setPlayerName: (name: string) => void;
  hostRoom: () => Promise<void>;
  joinRoom: (peerId: string) => Promise<void>;
  startSoloLobby: () => void;
  lockTeam: () => void;
  cancelLock: () => void;
  selectMyChar: (charId: string) => void;
  deselectMyChar: (charId: string) => void;
  dispatchAction: (action: PlayerAction) => void;
  startSolo: (myCharIds: string[], cpuCharIds: string[]) => void;
  returnHome: () => void;
};

// ============================================================
// localStorage ヘルパー
// ============================================================
const PLAYER_NAME_KEY = 'clash_player_name';

function loadPlayerName(): string {
  return localStorage.getItem(PLAYER_NAME_KEY) ?? 'Player';
}

function savePlayerName(name: string): void {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}

// ============================================================
// ストア
// ============================================================

export const useGameStore = create<GameStore>((set, get) => ({
  appPhase: 'home',
  playerName: loadPlayerName(),
  myTeamId: 'team1',
  peerId: null,
  connected: false,
  p2pError: null,
  isSoloMode: false,
  lobby: { myTeam: [], myLocked: false, opponentLocked: false, opponentTeam: [] },
  timerRemaining: null,
  battle: null,

  // ---- プレイヤー名 ----
  setPlayerName: (name) => {
    savePlayerName(name);
    set({ playerName: name });
  },

  // ---- ルーム作成（ホスト） ----
  hostRoom: async () => {
    set({ appPhase: 'lobby', p2pError: null, connected: false, lobby: { myTeam: [], myLocked: false, opponentLocked: false, opponentTeam: [] } });
    await createRoom({
      onOpen: (id) => set({ peerId: id }),
      onConnect: () => set({ connected: true }),
      onMessage: (msg) => handleP2PMessage(msg, get, set),
      onDisconnect: () => {
        set({ connected: false, p2pError: '相手が切断しました' });
      },
      onError: (err) => set({ p2pError: err.message }),
    });
    set({ myTeamId: 'team1' });
  },

  // ---- ルーム参加（ゲスト） ----
  joinRoom: async (peerId) => {
    set({ appPhase: 'lobby', p2pError: null, connected: false, lobby: { myTeam: [], myLocked: false, opponentLocked: false, opponentTeam: [] } });
    await joinRoom(peerId, {
      onOpen: () => {},
      onConnect: () => set({ connected: true }),
      onMessage: (msg) => handleP2PMessage(msg, get, set),
      onDisconnect: () => {
        set({ connected: false, p2pError: '相手が切断しました' });
      },
      onError: (err) => set({ p2pError: err.message }),
    });
    set({ myTeamId: 'team2' });
  },

  // ---- ソロモードロビー開始 ----
  startSoloLobby: () => {
    set({
      appPhase: 'solo',
      myTeamId: 'team1',
      connected: true,
      isSoloMode: true,
      lobby: { myTeam: [], myLocked: false, opponentLocked: false, opponentTeam: [] },
      battle: null,
      p2pError: null,
    });
  },

  // ---- チーム選択 ----
  selectMyChar: (charId) => {
    const { lobby } = get();
    if (lobby.myLocked) return;
    if (lobby.myTeam.includes(charId)) return;
    if (lobby.myTeam.length >= 3) return;
    set({ lobby: { ...lobby, myTeam: [...lobby.myTeam, charId] } });
  },

  deselectMyChar: (charId) => {
    const { lobby } = get();
    if (lobby.myLocked) return;
    set({ lobby: { ...lobby, myTeam: lobby.myTeam.filter((id) => id !== charId) } });
  },

  lockTeam: () => {
    const { lobby, isSoloMode } = get();
    if (lobby.myTeam.length !== 3) return;
    set({ lobby: { ...lobby, myLocked: true } });
    
    if (!isSoloMode) {
      sendTeamLocked(lobby.myTeam);
      
      // 相手が既にロック済みならホストが開始
      if (isHost() && lobby.opponentLocked) {
        initBattleFromLobby(get, set);
      }
    }
  },

  cancelLock: () => {
    const { lobby } = get();
    set({ lobby: { ...lobby, myLocked: false } });
    sendTeamCancel();
  },

  // ---- アクション送信 ----
  dispatchAction: (action) => {
    const { battle, myTeamId, isSoloMode } = get();
    if (!battle) return;

    if (isSoloMode || isHost()) {
      // ソロモードまたはホスト: 自分のアクションを直接処理
      try {
        const newState = processAction(battle, action, myTeamId);
        set({ battle: newState });
        if (!isSoloMode) {
          sendStateUpdate(newState);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      // ゲスト: アクションをホストに送信
      sendAction(action);
    }
  },

  // ---- ソロモード ----
  startSolo: (myCharIds, cpuCharIds) => {
    console.log('[GameStore] Starting solo battle...', { myCharIds, cpuCharIds });
    try {
      const myTeam = createTeamState('player', myCharIds);
      const cpuTeam = createTeamState('cpu', cpuCharIds);
      const initial = createInitialBattleState(myTeam, cpuTeam);
      set({
        appPhase: 'battle',
        isSoloMode: true,
        myTeamId: 'team1',
        battle: initial,
      });
      console.log('[GameStore] Solo battle state initialized.');
    } catch (e) {
      console.error('[GameStore] Failed to start solo battle:', e);
      alert('バトルの初期化に失敗しました。キャラクターデータを確認してください。');
    }
  },

  // ---- ホームに戻る ----
  returnHome: () => {
    stopTimer();
    cleanup();
    set({
      appPhase: 'home',
      battle: null,
      peerId: null,
      connected: false,
      p2pError: null,
      isSoloMode: false,
      timerRemaining: null,
      lobby: { myTeam: [], myLocked: false, opponentLocked: false, opponentTeam: [] },
    });
  },
}));

// ============================================================
// P2Pメッセージハンドラ
// ============================================================

type SetFn = (partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>)) => void;
type GetFn = () => GameStore;

function handleP2PMessage(
  msg: import('../types').P2PMessage,
  get: GetFn,
  set: SetFn
) {
  const { myTeamId } = get();
  const enemyTeamId: Team = myTeamId === 'team1' ? 'team2' : 'team1';

  switch (msg.type) {
    case 'state_update': {
      // ゲスト: ホストから受け取った状態で上書き
      set({ battle: msg.payload as BattleState, appPhase: 'battle' });
      break;
    }

    case 'action': {
      // ホスト: ゲストのアクションを受け取って処理
      if (!isHost()) break;
      const { battle } = get();
      if (!battle) break;
      try {
        const newState = processAction(
          battle,
          msg.payload as PlayerAction,
          enemyTeamId
        );
        // CPUモードではないのでそのまま
        set({ battle: newState });
        sendStateUpdate(newState);
      } catch (e) {
        console.error('[P2P] action error:', e);
      }
      break;
    }

    case 'lobby_team_locked': {
      const { lobby } = get();
      const payload = msg.payload as { charIds: string[] };
      set({ lobby: { ...lobby, opponentLocked: true, opponentTeam: payload.charIds } });

      // 両者ロック → バトル開始（ホストが処理）
      if (isHost() && lobby.myLocked) {
        initBattleFromLobby(get, set);
      }
      break;
    }

    case 'lobby_team_cancel': {
      const { lobby } = get();
      set({ lobby: { ...lobby, opponentLocked: false } });
      break;
    }

    case 'timer_tick': {
      const payload = msg.payload as { remaining: number };
      set({ timerRemaining: payload.remaining });
      break;
    }

    case 'error': {
      set({ p2pError: String(msg.payload) });
      break;
    }
  }
}

function initBattleFromLobby(get: GetFn, set: SetFn) {
  const { lobby } = get();
  // ホストがチーム1、ゲストがチーム2
  const team1 = createTeamState('host', lobby.myTeam);
  const team2 = createTeamState('guest', lobby.opponentTeam);
  const initial = createInitialBattleState(team1, team2);
  set({ battle: initial, appPhase: 'battle' });
  sendStateUpdate(initial);

  // 先頭選択タイマー開始
  startTimer(
    15,
    'select_first',
    (remaining) => set({ timerRemaining: remaining }),
    () => {
      // タイムアウト: ランダム選択
      const { battle } = get();
      if (!battle) return;
      // ホスト側ランダム選択はここでは省略（processAction で処理）
    }
  );
}

// ============================================================
// ソロモード用: CPUアクション実行
// ============================================================

export function runCpuTurnIfNeeded(
  battle: BattleState,
  myTeam: Team
): BattleState {
  const cpuTeam: Team = myTeam === 'team1' ? 'team2' : 'team1';
  let s = battle;

  // 先頭選択フェーズ
  if (s.phase === 'selecting_first') {
    const cpuReady = s[cpuTeam].characters.some((c) => c.isActive);
    if (!cpuReady) {
      s = cpuSelectFirst(s, cpuTeam);
    }
    return s;
  }

  // 次キャラ選択フェーズ（CPU側が死んだ場合）
  if (s.phase === 'selecting_next' && s.currentTurn === myTeam) {
    // プレイヤー側が倒された → CPU側は関係ない
    return s;
  }
  if (s.phase === 'selecting_next') {
    // CPU側が倒された → CPU がランダム選択
    s = cpuSelectNext(s, cpuTeam);
    return s;
  }

  // CPUのターン
  if (s.phase === 'action' && s.currentTurn === cpuTeam) {
    s = cpuTakeTurn(s, cpuTeam);
  }

  return s;
}
