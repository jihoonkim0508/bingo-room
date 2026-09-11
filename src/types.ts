export type RoomPhase = "SETUP" | "FILLING" | "PLAYING" | "FINISHED";
export type VictoryMode = "FIRST" | "ALL_BUT_ONE";
export type MarkingMode = "STRICT" | "LOOSE";
export type PlayerStatus = "ACTIVE" | "COMPLETED";

export interface RoomSettings {
  size: number;
  topic: string;
  targetBingos: number;
  victoryMode: VictoryMode;
  markingMode: MarkingMode;
  maxPlayers: number;
}

export interface Player {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  status: PlayerStatus;
  bingoCount: number;
  completedAt?: number;
  rank?: number;
}

export interface BoardCell {
  text: string;
  marked: boolean;
}

export interface CallEntry {
  id: string;
  callerId: string;
  callerName: string;
  text: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  type: "CHAT" | "CALL" | "SYSTEM";
  text: string;
  createdAt: number;
}

export interface RoomState {
  id: string;
  name: string;
  hostId: string;
  phase: RoomPhase;
  countdownStartedAt?: number;
  settings: RoomSettings;
  players: Player[];
  boards: Record<string, BoardCell[]>;
  calls: CallEntry[];
  messages: ChatMessage[];
  turnOrder: string[];
  currentTurnIndex: number;
  winnerIds: string[];
}
