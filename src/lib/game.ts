import type { BoardCell, RoomSettings, RoomState } from "../types";

export function normalizeWord(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase();
}

export function maxBingos(size: number) {
  return size * 2 + 2;
}

export function emptyBoard(size: number) {
  return Array.from({ length: size * size }, (): BoardCell => ({ text: "", marked: false }));
}

export function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function getLines(size: number) {
  const lines: number[][] = [];
  for (let row = 0; row < size; row += 1) {
    lines.push(Array.from({ length: size }, (_, column) => row * size + column));
  }
  for (let column = 0; column < size; column += 1) {
    lines.push(Array.from({ length: size }, (_, row) => row * size + column));
  }
  lines.push(Array.from({ length: size }, (_, index) => index * (size + 1)));
  lines.push(Array.from({ length: size }, (_, index) => (index + 1) * (size - 1)));
  return lines;
}

export function countBingos(board: BoardCell[], size: number) {
  return getLines(size).filter((line) => line.every((index) => board[index]?.marked)).length;
}

export function applyStrictMarks(room: RoomState): RoomState {
  if (room.settings.markingMode !== "STRICT" || room.calls.length === 0) return room;
  const called = new Set(room.calls.map((call) => normalizeWord(call.text)));
  const boards = Object.fromEntries(Object.entries(room.boards).map(([playerId, board]) => {
    const nextBoard = board.map((cell) => called.has(normalizeWord(cell.text)) ? { ...cell, marked: true } : cell);
    return [playerId, nextBoard];
  }));
  const players = room.players.map((player) => {
    const board = boards[player.id];
    return board ? { ...player, bingoCount: countBingos(board, room.settings.size) } : player;
  });
  return { ...room, boards, players };
}

export function validateBoard(board: BoardCell[], size: number) {
  if (board.length !== size * size || board.some((cell) => !cell.text.trim())) return "모든 칸을 입력해주세요.";
  const words = board.map((cell) => normalizeWord(cell.text));
  if (new Set(words).size !== words.length) return "한 판 안에서는 같은 단어를 중복할 수 없습니다.";
  return null;
}

export function settingsForSize(settings: RoomSettings, size: number): RoomSettings {
  return { ...settings, size, targetBingos: Math.min(settings.targetBingos, maxBingos(size)) };
}

export function createInitialRoom(id: string, name: string, hostId: string, hostName: string): RoomState {
  return {
    id,
    name,
    hostId,
    phase: "SETUP",
    settings: {
      size: 4,
      topic: "오늘의 빙고",
      targetBingos: 1,
      victoryMode: "FIRST",
      markingMode: "STRICT",
      maxPlayers: 8,
    },
    players: [{ id: hostId, nickname: hostName, ready: false, connected: true, status: "ACTIVE", bingoCount: 0 }],
    boards: {},
    calls: [],
    messages: [],
    turnOrder: [],
    currentTurnIndex: 0,
    winnerIds: [],
  };
}

export function nextActiveTurn(room: RoomState, fromIndex: number) {
  if (!room.turnOrder.length) return 0;
  for (let step = 1; step <= room.turnOrder.length; step += 1) {
    const candidate = (fromIndex + step) % room.turnOrder.length;
    const player = room.players.find((item) => item.id === room.turnOrder[candidate]);
    if (player?.status === "ACTIVE") return candidate;
  }
  return fromIndex;
}

export function isAllReady(room: RoomState) {
  return room.players.length > 0 && room.players.every((player) => player.ready);
}

export function isRoomHost(room: RoomState, userId: string) {
  return room.hostId === userId;
}
