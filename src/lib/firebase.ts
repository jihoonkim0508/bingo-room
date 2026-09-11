import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { child, get, getDatabase, onDisconnect, onValue, ref, remove, runTransaction, update, type Unsubscribe } from "firebase/database";
import { applyStrictMarks, normalizeWord } from "./game";
import type { RoomState } from "../types";
import type { Player } from "../types";

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Object.values(config).every(Boolean);

const firebaseApp = firebaseEnabled ? (getApps().length ? getApp() : initializeApp(config)) : null;
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const database = firebaseApp ? getDatabase(firebaseApp) : null;

export async function getFirebaseUserId() {
  if (!auth) return null;
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser?.uid ?? null;
}

export async function makeRoomKey(name: string, password: string) {
  const source = `${name.trim().replace(/\s+/g, " ").toLocaleLowerCase()}\0${password}`;
  const data = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function roomRef(roomKey: string) {
  if (!database) throw new Error("Firebase가 설정되지 않았습니다.");
  return ref(database, `rooms/${roomKey}`);
}

function keyed<T extends { id: string }>(items: T[]) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

export function hydrateRoom(value: RoomState): RoomState {
  return applyStrictMarks({
    ...value,
    players: Array.isArray(value.players) ? value.players : Object.values(value.players ?? {}),
    calls: Array.isArray(value.calls) ? value.calls : Object.values(value.calls ?? {}),
    messages: Array.isArray(value.messages) ? value.messages : Object.values(value.messages ?? {}),
    boards: value.boards ?? {},
    turnOrder: Array.isArray(value.turnOrder) ? value.turnOrder : Object.values(value.turnOrder ?? {}),
    winnerIds: Array.isArray(value.winnerIds) ? value.winnerIds : Object.values(value.winnerIds ?? {}),
  });
}

function serializeRoom(room: RoomState) {
  return {
    ...room,
    countdownStartedAt: room.countdownStartedAt ?? null,
    players: Object.fromEntries(room.players.map(({ rank, completedAt, ...player }) => [player.id, {
      ...player,
      ...(completedAt === undefined ? {} : { completedAt }),
      ...(rank === undefined ? {} : { rank }),
    }])),
    calls: room.calls.length ? keyed(room.calls) : null,
    messages: room.messages.length ? keyed(room.messages) : null,
    boards: Object.keys(room.boards).length ? room.boards : null,
    turnOrder: room.turnOrder.length ? room.turnOrder : null,
    winnerIds: room.winnerIds.length ? room.winnerIds : null,
  };
}

export async function readRoom(roomKey: string) {
  const snapshot = await get(roomRef(roomKey));
  return snapshot.exists() ? hydrateRoom(snapshot.val() as RoomState) : null;
}

export async function createRemoteRoom(roomKey: string, room: RoomState) {
  const result = await runTransaction(roomRef(roomKey), (current) => current ?? serializeRoom(room));
  if (!result.committed || !result.snapshot.exists() || result.snapshot.child("hostId").val() !== room.hostId) {
    throw new Error("ROOM_EXISTS");
  }
}

export async function registerHostRoomCleanup(roomKey: string) {
  await onDisconnect(roomRef(roomKey)).remove();
}

export async function registerPlayerPresence(roomKey: string, playerId: string) {
  const player = child(roomRef(roomKey), `players/${playerId}`);
  await update(player, { connected: true });
  await onDisconnect(player).update({ connected: false });
}

export async function setPlayerConnected(roomKey: string, playerId: string, connected: boolean) {
  await update(child(roomRef(roomKey), `players/${playerId}`), { connected });
}

export type RoomOperation = (room: RoomState) => RoomState | null;

export async function transactRemoteRoom(roomKey: string, operation: RoomOperation) {
  const result = await runTransaction(roomRef(roomKey), (current) => {
    if (!current) return;
    const next = operation(hydrateRoom(current as RoomState));
    return next ? serializeRoom(applyStrictMarks(next)) : undefined;
  });
  return {
    committed: result.committed,
    room: result.snapshot.exists() ? hydrateRoom(result.snapshot.val() as RoomState) : null,
  };
}

export async function joinRemoteRoom(roomKey: string, player: Player) {
  let reason: "STARTED" | "FULL" | "NICKNAME" | undefined;
  const result = await transactRemoteRoom(roomKey, (room) => {
    if (room.phase !== "SETUP") {
      reason = "STARTED";
      return null;
    }
    if (room.players.some((item) => item.id === player.id)) return room;
    if (room.players.some((item) => normalizeWord(item.nickname) === normalizeWord(player.nickname))) {
      reason = "NICKNAME";
      return null;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      reason = "FULL";
      return null;
    }
    return { ...room, players: [...room.players, player] };
  });
  return { ...result, reason };
}

export function watchRemoteRoom(roomKey: string, listener: (room: RoomState | null) => void): Unsubscribe {
  return onValue(roomRef(roomKey), (snapshot) => listener(snapshot.exists() ? hydrateRoom(snapshot.val() as RoomState) : null));
}

export function watchFirebaseConnection(listener: (connected: boolean) => void): Unsubscribe {
  if (!database) return () => undefined;
  return onValue(ref(database, ".info/connected"), (snapshot) => listener(snapshot.val() === true));
}

export async function deleteRemoteRoom(roomKey: string) {
  await remove(roomRef(roomKey));
}
