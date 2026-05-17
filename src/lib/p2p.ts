import type { BattleState, P2PMessage, PlayerAction } from '../types';

// ============================================================
// P2P 接続管理 (PeerJS ラッパー)
// ============================================================
// PeerJS はブラウザ専用のため dynamic import を使用する

type PeerInstance = import('peerjs').Peer;
type DataConnection = import('peerjs').DataConnection;

export type P2PRole = 'host' | 'guest';

export type P2PCallbacks = {
  onOpen: (peerId: string) => void;
  onConnect: (conn: DataConnection) => void;
  onMessage: (msg: P2PMessage) => void;
  onDisconnect: () => void;
  onError: (err: Error) => void;
};

let peer: PeerInstance | null = null;
let conn: DataConnection | null = null;
let role: P2PRole | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================
// 接続確立
// ============================================================

/** ホストとして Peer を作成し、Peer ID を取得する */
export async function createRoom(callbacks: P2PCallbacks): Promise<void> {
  const { Peer } = await import('peerjs');
  role = 'host';
  peer = new Peer();

  peer.on('open', (id) => {
    callbacks.onOpen(id);
  });

  peer.on('connection', (connection) => {
    conn = connection;
    setupConnection(connection, callbacks);
    callbacks.onConnect(connection);
  });

  peer.on('error', (err) => callbacks.onError(err as Error));
}

/** ゲストとして既存ルームに接続する */
export async function joinRoom(
  peerId: string,
  callbacks: P2PCallbacks
): Promise<void> {
  const { Peer } = await import('peerjs');
  role = 'guest';
  peer = new Peer();

  peer.on('open', () => {
    const connection = peer!.connect(peerId, { reliable: true });
    conn = connection;
    setupConnection(connection, callbacks);
    callbacks.onConnect(connection);
  });

  peer.on('error', (err) => callbacks.onError(err as Error));
}

function setupConnection(connection: DataConnection, callbacks: P2PCallbacks) {
  connection.on('data', (data) => {
    callbacks.onMessage(data as P2PMessage);
  });

  connection.on('close', () => {
    callbacks.onDisconnect();
    cleanup();
  });

  connection.on('error', (err) => callbacks.onError(err as Error));
}

// ============================================================
// メッセージ送信
// ============================================================

export function sendMessage(msg: P2PMessage): void {
  if (!conn || !conn.open) {
    console.warn('[P2P] 接続がありません');
    return;
  }
  conn.send(msg);
}

/** ゲーム状態をゲストへ送信（ホストのみ） */
export function sendStateUpdate(state: BattleState): void {
  sendMessage({ type: 'state_update', payload: state });
}

/** プレイヤーアクションをホストへ送信（ゲストのみ） */
export function sendAction(action: PlayerAction): void {
  sendMessage({ type: 'action', payload: action });
}

// ============================================================
// タイマー管理（ホスト側）
// ============================================================

/**
 * カウントダウンタイマーを開始する。
 * 毎秒ゲストに残り時間を通知し、0になれば onTimeout を呼ぶ。
 */
export function startTimer(
  seconds: number,
  phase: 'select_first' | 'select_next',
  onTick: (remaining: number) => void,
  onTimeout: () => void
): void {
  if (timerInterval) clearInterval(timerInterval);

  let remaining = seconds;
  onTick(remaining);

  timerInterval = setInterval(() => {
    remaining -= 1;
    onTick(remaining);

    // ゲストにも残り時間を送信
    sendMessage({ type: 'timer_tick', payload: { phase, remaining } });

    if (remaining <= 0) {
      clearInterval(timerInterval!);
      timerInterval = null;
      onTimeout();
    }
  }, 1000);
}

export function stopTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ============================================================
// ロビー
// ============================================================

export function sendTeamLocked(charIds: string[]): void {
  sendMessage({ type: 'lobby_team_locked', payload: { charIds } });
}

export function sendTeamCancel(): void {
  sendMessage({ type: 'lobby_team_cancel', payload: null });
}

// ============================================================
// クリーンアップ
// ============================================================

export function cleanup(): void {
  stopTimer();
  conn?.close();
  peer?.destroy();
  conn = null;
  peer = null;
  role = null;
}

export function getRole(): P2PRole | null {
  return role;
}

export function isHost(): boolean {
  return role === 'host';
}

export function isConnected(): boolean {
  return conn?.open ?? false;
}
