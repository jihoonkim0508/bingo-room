import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { get, getDatabase, onDisconnect, onValue, ref, remove, set, update, type Unsubscribe } from "firebase/database";
import type { RoomState } from "../types";

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
  return snapshot.exists() ? (snapshot.val() as RoomState) : null;
}

export async function createRemoteRoom(roomKey: string, room: RoomState) {
  await set(roomRef(roomKey), serializeRoom(room));
}

export async function registerHostRoomCleanup(roomKey: string) {
  await onDisconnect(roomRef(roomKey)).remove();
}

export async function updateRemoteRoom(roomKey: string, room: RoomState) {
  // ponytail: keep one small room snapshot, but update its children so presence/readers are not removed by root replacement.
  await update(roomRef(roomKey), serializeRoom(room));
}

export async function patchRemoteRoom(roomKey: string, patch: Record<string, unknown>) {
  await update(roomRef(roomKey), patch);
}

export function watchRemoteRoom(roomKey: string, listener: (room: RoomState | null) => void): Unsubscribe {
  return onValue(roomRef(roomKey), (snapshot) => listener(snapshot.exists() ? (snapshot.val() as RoomState) : null));
}

export function watchFirebaseConnection(listener: (connected: boolean) => void): Unsubscribe {
  if (!database) return () => undefined;
  return onValue(ref(database, ".info/connected"), (snapshot) => listener(snapshot.val() === true));
}

export async function deleteRemoteRoom(roomKey: string) {
  await remove(roomRef(roomKey));
}
