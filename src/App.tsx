import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, CircleHelp, Copy, Crown, Grid2X2, LogOut, MessageCircle, Play, RotateCcw, Send, Settings2, ShieldCheck, Sparkles, Trophy, Users, WandSparkles, X } from "lucide-react";
import { BingoBoard } from "./components/BingoBoard";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Separator } from "./components/ui/separator";
import { Slider } from "./components/ui/slider";
import { Switch } from "./components/ui/switch";
import { applyStrictMarks, createInitialRoom, emptyBoard, isRoomHost, maxBingos, nextActiveTurn, normalizeWord, settingsForSize, shuffle, validateBoard, countBingos } from "./lib/game";
import { createRemoteRoom, deleteRemoteRoom, firebaseEnabled, getFirebaseUserId, makeRoomKey, readRoom, registerHostRoomCleanup, updateRemoteRoom, watchFirebaseConnection, watchRemoteRoom } from "./lib/firebase";
import { formatTime, makeId } from "./lib/utils";
import type { BoardCell, ChatMessage, Player, RoomSettings, RoomState } from "./types";

type Screen = "home" | "room";

const demoUserKey = "bingo-demo-user-id";
const demoUserId = typeof localStorage === "undefined" ? makeId("guest") : localStorage.getItem(demoUserKey) ?? makeId("guest");
if (typeof localStorage !== "undefined") localStorage.setItem(demoUserKey, demoUserId);

function hydrateRoom(value: RoomState): RoomState {
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

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [userId, setUserId] = useState(demoUserId);
  const [roomKey, setRoomKey] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState(!firebaseEnabled);

  useEffect(() => {
    if (!firebaseEnabled) return;
    getFirebaseUserId().then((id) => id && setUserId(id)).catch((error: unknown) => {
      const details = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
      console.error("Firebase anonymous authentication failed", error);
      setNotice(`Firebase 인증 오류: ${details}`);
    });
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return watchFirebaseConnection(setFirebaseConnected);
  }, []);

  useEffect(() => {
    if (!firebaseEnabled || !roomKey) return;
    return watchRemoteRoom(roomKey, (next) => {
      if (next) setRoom(hydrateRoom(next));
      else {
        setRoom(null);
        setRoomKey("");
        setScreen("home");
        setNotice("방장이 방을 종료했습니다.");
      }
    });
  }, [roomKey]);

  const isCurrentUserHost = room?.hostId === userId;

  const leaveRoom = useCallback(() => {
    if (firebaseEnabled && roomKey && isCurrentUserHost) void deleteRemoteRoom(roomKey).catch(() => undefined);
    setRoom(null);
    setRoomKey("");
    setScreen("home");
    setNotice("");
  }, [isCurrentUserHost, roomKey]);

  useEffect(() => {
    if (screen !== "room" || !room || !roomKey) return;
    window.history.pushState({ bingoRoom: true }, "", window.location.href);
    const handlePopState = () => leaveRoom();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [leaveRoom, room?.hostId, roomKey, screen]);

  const commit = useCallback((next: RoomState) => {
    const synchronized = applyStrictMarks(next);
    setRoom(synchronized);
    if (firebaseEnabled && roomKey) {
      void updateRemoteRoom(roomKey, synchronized).catch(() => setNotice("저장에 실패했습니다. 네트워크를 확인해주세요."));
    }
  }, [roomKey]);

  async function createRoom(nickname: string, roomName: string, password: string) {
    if (!nickname.trim() || !roomName.trim() || password.length < 4) return setNotice("닉네임, 방 이름을 입력하고 비밀번호는 4자 이상 사용해주세요.");
    setBusy(true);
    try {
      const key = firebaseEnabled ? await makeRoomKey(roomName, password) : `demo-${normalizeWord(roomName)}-${normalizeWord(password)}`;
      if (firebaseEnabled && await readRoom(key)) return setNotice("이미 존재하는 방입니다. 다른 이름이나 비밀번호를 사용해주세요.");
      const next = createInitialRoom(key, roomName.trim(), userId, nickname.trim());
      if (firebaseEnabled) {
        await createRemoteRoom(key, next);
        await registerHostRoomCleanup(key);
      }
      setRoomKey(key);
      setRoom(next);
      setScreen("room");
      setNotice("");
    } catch {
      setNotice("방을 만들지 못했습니다. 입력값과 Firebase 설정을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(nickname: string, roomName: string, password: string) {
    if (!nickname.trim() || !roomName.trim() || !password) return setNotice("닉네임, 방 이름, 비밀번호를 모두 입력해주세요.");
    setBusy(true);
    try {
      const key = firebaseEnabled ? await makeRoomKey(roomName, password) : `demo-${normalizeWord(roomName)}-${normalizeWord(password)}`;
      const existing = firebaseEnabled ? await readRoom(key) : null;
      if (firebaseEnabled && !existing) return setNotice("방이 없거나 비밀번호가 올바르지 않습니다.");
      const current = existing ? hydrateRoom(existing) : createInitialRoom(key, roomName.trim(), "host-demo", "방장");
      if (current.phase !== "SETUP") return setNotice("이미 시작된 방에는 새로 들어갈 수 없습니다.");
      if (!current.players.some((player) => player.id === userId) && current.players.length >= current.settings.maxPlayers) return setNotice("방 인원이 가득 찼습니다.");
      const player: Player = { id: userId, nickname: nickname.trim(), ready: false, connected: true, status: "ACTIVE", bingoCount: 0 };
      const next = { ...current, players: current.players.some((item) => item.id === userId) ? current.players : [...current.players, player] };
      if (firebaseEnabled) {
        await createRemoteRoom(key, next);
        if (current.hostId === userId) await registerHostRoomCleanup(key);
      }
      setRoomKey(key);
      setRoom(next);
      setScreen("room");
      setNotice("");
    } catch {
      setNotice("방에 들어가지 못했습니다. 방 이름과 비밀번호를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "home") return <HomeScreen busy={busy} notice={notice} firebaseConnected={firebaseConnected} onCreate={createRoom} onJoin={joinRoom} />;
  if (!room) return null;
  return <RoomScreen room={room} userId={userId} firebaseConnected={firebaseConnected} onCommit={commit} onLeave={leaveRoom} notice={notice} setNotice={setNotice} />;
}

function HomeScreen({ busy, notice, firebaseConnected, onCreate, onJoin }: { busy: boolean; notice: string; firebaseConnected: boolean; onCreate: (nickname: string, room: string, password: string) => void; onJoin: (nickname: string, room: string, password: string) => void }) {
  const [createForm, setCreateForm] = useState({ nickname: "", room: "", password: "" });
  const [joinForm, setJoinForm] = useState({ nickname: "", room: "", password: "" });
  const update = (type: "create" | "join", field: "nickname" | "room" | "password", value: string) => {
    if (type === "create") setCreateForm((prev) => ({ ...prev, [field]: value }));
    else setJoinForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <main className="min-h-screen overflow-hidden px-5 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-center">
        <div className="mb-12 flex items-end justify-between gap-4">
          <div>
            <div className="mb-5 flex items-center gap-3 text-violet-300"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/15"><Grid2X2 size={22} /></div><span className="text-sm font-bold tracking-[0.2em]">BINGO ROOM</span></div>
            <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">친구들과 바로 시작하는<br /><span className="text-violet-300">온라인 빙고</span></h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">로그인 없이 방을 만들고, 주제에 맞는 단어를 채워 함께 플레이하세요.</p>
          </div>
          <div className={`hidden items-center gap-2 rounded-full border px-3 py-2 text-xs sm:flex ${!firebaseEnabled || firebaseConnected ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-300/20 bg-amber-300/10 text-amber-100"}`}><span className={`h-2 w-2 rounded-full ${!firebaseEnabled || firebaseConnected ? "bg-emerald-300" : "bg-amber-300"}`} /> {!firebaseEnabled ? "데모 모드" : firebaseConnected ? "실시간 연결" : "연결 중..."}</div>
        </div>

        {notice && <div className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{notice}</div>}
        {!firebaseEnabled && <div className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">현재 데모 모드입니다. 실제 여러 브라우저에서 함께하려면 `.env`에 Firebase 설정을 넣어주세요.</div>}

        <div className="grid gap-5 lg:grid-cols-2">
          <RoomForm title="새 방 만들기" description="방장이 되어 게임 규칙을 정해보세요." icon={<Sparkles size={18} />} form={createForm} onChange={(field, value) => update("create", field, value)} onSubmit={() => onCreate(createForm.nickname, createForm.room, createForm.password)} submitLabel="방 만들기" busy={busy} />
          <RoomForm title="방 들어가기" description="친구에게 받은 방 이름과 비밀번호를 입력하세요." icon={<Users size={18} />} form={joinForm} onChange={(field, value) => update("join", field, value)} onSubmit={() => onJoin(joinForm.nickname, joinForm.room, joinForm.password)} submitLabel="입장하기" busy={busy} />
        </div>
        <p className="mt-8 text-center text-xs text-slate-500">프로필 없이 닉네임으로만 참여합니다 · 방 비밀번호는 공유한 친구끼리만 알려주세요</p>
      </div>
    </main>
  );
}

function RoomForm({ title, description, icon, form, onChange, onSubmit, submitLabel, busy }: { title: string; description: string; icon: React.ReactNode; form: { nickname: string; room: string; password: string }; onChange: (field: "nickname" | "room" | "password", value: string) => void; onSubmit: () => void; submitLabel: string; busy: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-white/10 bg-white/[0.025]">
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">{icon}</div>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <Field label="내 닉네임"><Input value={form.nickname} onChange={(e) => onChange("nickname", e.target.value)} placeholder="예: 빙고왕" maxLength={12} /></Field>
        <Field label="방 이름"><Input value={form.room} onChange={(e) => onChange("room", e.target.value)} placeholder="예: 주말 모임" maxLength={30} /></Field>
        <Field label="방 비밀번호"><Input type="password" value={form.password} onChange={(e) => onChange("password", e.target.value)} placeholder="4자 이상" maxLength={30} onKeyDown={(e) => e.key === "Enter" && onSubmit()} /></Field>
        <Button className="mt-2 w-full" size="lg" onClick={onSubmit} disabled={busy}>{busy ? "처리 중..." : submitLabel}<ChevronLeft className="rotate-180" size={17} /></Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function RoomScreen({ room, userId, firebaseConnected, onCommit, onLeave, notice, setNotice }: { room: RoomState; userId: string; firebaseConnected: boolean; onCommit: (room: RoomState) => void; onLeave: () => void; notice: string; setNotice: (value: string) => void }) {
  const me = room.players.find((player) => player.id === userId);
  const host = isRoomHost(room, userId);
  const [chatText, setChatText] = useState("");
  const [callText, setCallText] = useState("");
  const [copied, setCopied] = useState(false);
  const currentTurnId = room.turnOrder[room.currentTurnIndex];
  const isMyTurn = room.phase === "PLAYING" && currentTurnId === userId;
  const board = room.boards[userId] ?? emptyBoard(room.settings.size);
  const isFinished = room.phase === "FINISHED" || me?.status === "COMPLETED";

  function updateSettings(settings: RoomSettings) {
    if (!host || room.phase !== "SETUP") return;
    onCommit({ ...room, settings });
  }

  function startFilling() {
    if (!host) return;
    onCommit({ ...room, phase: "FILLING", countdownStartedAt: undefined, players: room.players.map((player) => ({ ...player, ready: false })), boards: {}, calls: [], messages: room.messages.slice(-100), winnerIds: [] });
    setNotice("");
  }

  function resetToSetup() {
    if (!host) return;
    if (!window.confirm("진행 중인 빙고가 취소되고 판과 진행 상황이 초기화됩니다. 계속할까요?")) return;
    onCommit({ ...room, phase: "SETUP", countdownStartedAt: undefined, players: room.players.map((player) => ({ ...player, ready: false, status: "ACTIVE", bingoCount: 0, rank: undefined, completedAt: undefined })), boards: {}, calls: [], turnOrder: [], currentTurnIndex: 0, winnerIds: [] });
  }

  function updateBoard(index: number, text: string) {
    const nextBoard = [...board];
    nextBoard[index] = { ...nextBoard[index], text };
    onCommit({ ...room, boards: { ...room.boards, [userId]: nextBoard } });
  }

  function toggleReady() {
    if (!me || room.phase !== "FILLING") return;
    const nextPlayers = room.players.map((player) => player.id === userId ? { ...player, ready: !player.ready } : player);
    const next = { ...room, players: nextPlayers, boards: { ...room.boards, [userId]: board } };
    if (nextPlayers.every((player) => player.ready)) onCommit({ ...next, phase: "PLAYING", countdownStartedAt: undefined, turnOrder: shuffle(nextPlayers.map((player) => player.id)), currentTurnIndex: 0 });
    else onCommit(next);
  }

  function toggleCell(index: number) {
    if (!me || room.settings.markingMode !== "LOOSE" || room.phase !== "PLAYING") return;
    const nextBoard = [...board];
    nextBoard[index] = { ...nextBoard[index], marked: !nextBoard[index].marked };
    const count = countBingos(nextBoard, room.settings.size);
    let nextPlayers = room.players.map((player) => player.id === userId ? { ...player, bingoCount: count } : player);
    let next: RoomState = { ...room, boards: { ...room.boards, [userId]: nextBoard }, players: nextPlayers };
    if (count >= room.settings.targetBingos) next = completePlayer(next, userId);
    onCommit(next);
  }

  function completePlayer(source: RoomState, playerId: string) {
    const rank = source.players.filter((player) => player.status === "COMPLETED").length + 1;
    const winnerIds = source.winnerIds.includes(playerId) ? source.winnerIds : [...source.winnerIds, playerId];
    const players = source.players.map((player) => player.id === playerId ? { ...player, status: "COMPLETED" as const, rank, completedAt: Date.now(), ready: false } : player);
    if (source.settings.victoryMode === "FIRST" || winnerIds.length >= Math.max(1, source.players.length - 1)) return { ...source, players, winnerIds, phase: "FINISHED" as const };
    const nextIndex = nextActiveTurn({ ...source, players }, source.currentTurnIndex);
    return { ...source, players, winnerIds, currentTurnIndex: nextIndex };
  }

  function callWord() {
    if (!isMyTurn || !callText.trim()) return;
    const normalized = normalizeWord(callText);
    if (room.calls.some((call) => normalizeWord(call.text) === normalized)) return setNotice(`이미 호출된 단어입니다: "${callText.trim()}"`);
    let nextBoard = board;
    if (room.settings.markingMode === "STRICT") nextBoard = board.map((cell) => normalizeWord(cell.text) === normalized ? { ...cell, marked: true } : cell);
    const count = countBingos(nextBoard, room.settings.size);
    const call = { id: makeId("call"), callerId: userId, callerName: me?.nickname ?? "플레이어", text: callText.trim(), createdAt: Date.now() };
    let next: RoomState = { ...room, boards: { ...room.boards, [userId]: nextBoard }, calls: [...room.calls, call], messages: [...room.messages, { id: call.id, authorId: userId, authorName: me?.nickname ?? "플레이어", type: "CALL", text: call.text, createdAt: call.createdAt }], players: room.players.map((player) => player.id === userId ? { ...player, bingoCount: count } : player), currentTurnIndex: nextActiveTurn(room, room.currentTurnIndex) };
    if (count >= room.settings.targetBingos) next = completePlayer(next, userId);
    setCallText("");
    setNotice("");
    onCommit(next);
  }

  function sendChat() {
    if (!chatText.trim() || !me) return;
    const message: ChatMessage = { id: makeId("chat"), authorId: userId, authorName: me.nickname, type: "CHAT", text: chatText.trim(), createdAt: Date.now() };
    onCommit({ ...room, messages: [...room.messages, message].slice(-100) });
    setChatText("");
  }

  async function copyRoomKey() {
    await navigator.clipboard?.writeText(room.name);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const title = room.phase === "SETUP" ? "방 설정" : room.phase === "FILLING" ? "빙고판 채우기" : room.phase === "COUNTDOWN" ? "곧 시작합니다" : room.phase === "FINISHED" ? "게임 결과" : room.settings.topic;

  return (
    <main className="min-h-screen px-4 py-5 text-slate-100 sm:px-7">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onLeave} aria-label="나가기"><ChevronLeft size={20} /></Button>
            <div className="min-w-0"><p className="truncate text-xs font-bold tracking-[0.16em] text-violet-300">BINGO ROOM</p><h1 className="truncate text-xl font-black text-white">{room.name}</h1></div>
            <button onClick={copyRoomKey} className="hidden items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/10 sm:flex">{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "복사됨" : "방 이름 복사"}</button>
          </div>
          <div className="flex items-center gap-2"><Badge className={!firebaseEnabled || firebaseConnected ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-300/20 bg-amber-300/10 text-amber-100"}>{!firebaseEnabled ? "데모" : firebaseConnected ? "실시간 연결" : "연결 중..."}</Badge><Badge>{room.players.length}/{room.settings.maxPlayers}명</Badge></div>
        </header>

        {notice && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="space-y-5">
            <PlayersCard room={room} userId={userId} />
            {host && room.phase !== "SETUP" && <Button variant="outline" className="w-full" onClick={resetToSetup}><Settings2 size={16} /> 방 설정으로 돌아가기</Button>}
            {room.phase === "FINISHED" && host && <Button className="w-full" onClick={() => onCommit({ ...room, phase: "SETUP", countdownStartedAt: undefined, players: room.players.map((player) => ({ ...player, ready: false, status: "ACTIVE", bingoCount: 0, rank: undefined, completedAt: undefined })), boards: {}, calls: [], turnOrder: [], currentTurnIndex: 0, winnerIds: [] })}><RotateCcw size={16} /> 다시하기</Button>}
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="flex items-start justify-between gap-4"><div><Badge className="mb-3 border-violet-300/20 bg-violet-400/10 text-violet-200">{phaseLabel(room.phase)}</Badge><h2 className="text-2xl font-black text-white sm:text-3xl">{title}</h2><p className="mt-2 text-sm text-slate-400">{room.settings.topic}</p></div>{room.phase === "PLAYING" && <div className="text-right"><p className="text-xs text-slate-500">목표</p><p className="text-lg font-black text-amber-200">{room.settings.targetBingos}빙고</p></div>}</div>

            {room.phase === "SETUP" && <SetupPanel room={room} host={host} onChange={updateSettings} onStart={startFilling} />}
            {room.phase === "FILLING" && <FillingPanel room={room} me={me} board={board} onBoardChange={updateBoard} onToggleReady={toggleReady} />}
            {(room.phase === "PLAYING" || room.phase === "FINISHED") && <PlayPanel room={room} me={me} board={board} isMyTurn={isMyTurn} isFinished={isFinished} callText={callText} onCallText={setCallText} onCall={callWord} onToggle={toggleCell} />}
          </section>

          <aside className="space-y-5"><CallsCard room={room} currentTurnId={currentTurnId} /><ChatCard messages={room.messages} value={chatText} onChange={setChatText} onSend={sendChat} /></aside>
        </div>
      </div>
    </main>
  );
}

function phaseLabel(phase: RoomState["phase"]) {
  return ({ SETUP: "대기 중", FILLING: "작성 중", COUNTDOWN: "준비 완료", PLAYING: "게임 중", FINISHED: "종료" })[phase];
}

function PlayersCard({ room, userId }: { room: RoomState; userId: string }) {
  const currentTurnId = room.turnOrder[room.currentTurnIndex];
  return <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Users size={16} className="text-violet-300" /> 참가자 <span className="ml-auto text-xs font-normal text-slate-500">{room.players.length}/{room.settings.maxPlayers}</span></CardTitle></CardHeader><CardContent className="space-y-2">{room.players.map((player) => <div key={player.id} className="flex items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2.5"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 text-xs font-black text-white">{player.nickname.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="truncate text-sm font-semibold text-white">{player.nickname}</p>{player.id === room.hostId && <Crown size={12} className="text-amber-300" />}{player.id === userId && <span className="text-[10px] text-violet-300">나</span>}</div><p className="text-[10px] text-slate-500">{player.status === "COMPLETED" ? `${player.rank ?? ""}위` : player.ready ? "준비 완료" : "대기 중"}</p></div>{player.bingoCount > 0 && <Badge className="shrink-0 border-amber-300/40 bg-amber-300/15 px-2 py-1 text-xs font-black text-amber-100 shadow-[0_0_14px_rgba(252,211,77,0.18)]">{player.bingoCount}빙고!</Badge>}{currentTurnId === player.id && room.phase === "PLAYING" && <Badge className="border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-200">턴</Badge>}{player.status === "COMPLETED" && <Trophy size={15} className="shrink-0 text-amber-300" />}</div>)}</CardContent></Card>;
}

function SetupPanel({ room, host, onChange, onStart }: { room: RoomState; host: boolean; onChange: (settings: RoomSettings) => void; onStart: () => void }) {
  const { settings } = room;
  const [targetBingosInput, setTargetBingosInput] = useState(String(settings.targetBingos));

  useEffect(() => setTargetBingosInput(String(settings.targetBingos)), [settings.targetBingos]);

  function updateTargetBingos(raw: string) {
    setTargetBingosInput(raw);
    if (!raw) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    onChange({ ...settings, targetBingos: Math.max(1, Math.min(maxBingos(settings.size), Math.floor(value))) });
  }

  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><WandSparkles size={17} className="text-violet-300" /> 게임 설정</CardTitle><CardDescription>{host ? "방장이 규칙을 정하면 모두에게 즉시 반영됩니다." : "방장이 게임 규칙을 설정하고 있습니다."}</CardDescription></CardHeader><CardContent className="space-y-6"><div><div className="mb-3 flex items-end justify-between"><Label>한 줄 칸 수</Label><span className="text-2xl font-black text-violet-200">{settings.size}×{settings.size}</span></div><Slider min={2} max={5} step={1} value={settings.size} disabled={!host} onChange={(e) => onChange(settingsForSize(settings, Number(e.target.value)))} /><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>2×2</span><span>3×3</span><span>4×4</span><span>5×5</span></div></div><Field label="주제"><Input disabled={!host} value={settings.topic} onChange={(e) => onChange({ ...settings, topic: e.target.value })} placeholder="예: 여름 음식" /></Field><Field label={`목표 빙고 수 (최대 ${maxBingos(settings.size)}개)`}><Input disabled={!host} type="number" min={1} max={maxBingos(settings.size)} step={1} value={targetBingosInput} onChange={(e) => updateTargetBingos(e.target.value)} onBlur={() => !targetBingosInput.trim() && setTargetBingosInput(String(settings.targetBingos))} /></Field><div className="grid gap-4 sm:grid-cols-2"><OptionGroup label="승리 조건"><select disabled={!host} value={settings.victoryMode} onChange={(e) => onChange({ ...settings, victoryMode: e.target.value as RoomSettings["victoryMode"] })} className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400"><option value="FIRST">한 명 완성</option><option value="ALL_BUT_ONE">한 명 빼고</option></select></OptionGroup><OptionGroup label="빙고 완성 판정"><select disabled={!host} value={settings.markingMode} onChange={(e) => onChange({ ...settings, markingMode: e.target.value as RoomSettings["markingMode"] })} className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400"><option value="STRICT">엄격 · 자동 체크</option><option value="LOOSE">느슨 · 직접 체크</option></select></OptionGroup></div><Field label="최대 인원"><Input disabled={!host} type="number" min={Math.max(2, room.players.length)} max={20} value={settings.maxPlayers} onChange={(e) => onChange({ ...settings, maxPlayers: Math.max(room.players.length, Math.min(20, Number(e.target.value) || 2)) })} /></Field><Separator /><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-white">참가자 준비 상태</p><p className="mt-1 text-xs text-slate-500">준비 상태와 관계없이 방장이 시작할 수 있습니다.</p></div>{host ? <Button onClick={onStart}><Play size={16} /> 빙고판 채우기 시작</Button> : <Badge>방장 대기 중</Badge>}</div></CardContent></Card>;
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function FillingPanel({ room, me, board, onBoardChange, onToggleReady }: { room: RoomState; me?: Player; board: BoardCell[]; onBoardChange: (index: number, value: string) => void; onToggleReady: () => void }) {
  const error = validateBoard(board, room.settings.size);
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Grid2X2 size={17} className="text-violet-300" /> 나의 빙고판</CardTitle><CardDescription>주제에 맞는 단어를 입력하고 준비 완료를 눌러주세요.</CardDescription></CardHeader><CardContent className="space-y-5"><BingoBoard board={board} size={room.settings.size} mode="edit" strict={false} onChange={onBoardChange} onToggle={() => undefined} />{error && <p className="text-center text-xs text-amber-200">{error}</p>}<Button className="w-full" variant={me?.ready ? "secondary" : "default"} disabled={Boolean(error) && !me?.ready} onClick={onToggleReady}>{me?.ready ? <><Check size={16} /> 준비 완료 · 해제하기</> : <>준비 완료</>}</Button></CardContent></Card>;
}

function PlayPanel({ room, me, board, isMyTurn, isFinished, callText, onCallText, onCall, onToggle }: { room: RoomState; me?: Player; board: BoardCell[]; isMyTurn: boolean; isFinished: boolean; callText: string; onCallText: (value: string) => void; onCall: () => void; onToggle: (index: number) => void }) {
  const reveal = room.phase === "FINISHED" && room.winnerIds.length > 0;
  return <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Grid2X2 size={17} className="text-violet-300" /> {isFinished ? "내 최종 판" : "나의 빙고판"}</CardTitle><CardDescription className="mt-1">{room.settings.markingMode === "STRICT" ? "부른 단어와 일치하는 칸이 자동으로 체크됩니다." : "원하는 칸을 직접 눌러 체크하세요."}</CardDescription></div><Badge className="border-amber-300/20 bg-amber-300/10 text-amber-200">{me?.bingoCount ?? 0}빙고!</Badge></div></CardHeader><CardContent className="space-y-5"><BingoBoard board={board} size={room.settings.size} mode={isFinished ? "view" : "play"} strict={room.settings.markingMode === "STRICT"} onChange={() => undefined} onToggle={onToggle} />{room.phase === "PLAYING" && !isFinished && <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold text-white">{isMyTurn ? <><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> 내 턴이에요</> : <><CircleHelp size={15} className="text-slate-500" /> {room.players.find((player) => player.id === room.turnOrder[room.currentTurnIndex])?.nickname ?? "다음 사람"}의 턴</>}</div><span className="text-[10px] text-slate-500">단어를 한 개만 불러주세요</span></div><div className="flex gap-2"><Input value={callText} disabled={!isMyTurn} onChange={(e) => onCallText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onCall()} placeholder={isMyTurn ? "부를 단어" : "내 턴을 기다려주세요"} /><Button disabled={!isMyTurn || !callText.trim()} onClick={onCall}><Send size={15} /> 부르기</Button></div></div>}{reveal && <><div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-center text-xs text-amber-100">게임이 끝났습니다. 참가자들의 최종 판을 확인해보세요.</div><FinalBoards room={room} currentUserId={me?.id} /></>}</CardContent></Card>;
}

function FinalBoards({ room, currentUserId }: { room: RoomState; currentUserId?: string }) {
  const finishedPlayers = room.players.filter((player) => player.id !== currentUserId && room.boards[player.id]);
  if (!finishedPlayers.length) return null;
  return <div className="space-y-4 border-t border-white/10 pt-5"><div><p className="text-sm font-black text-white">참가자 최종 판</p><p className="mt-1 text-xs text-slate-500">완성된 판은 다른 참가자에게 공개됩니다.</p></div>{finishedPlayers.map((player) => <div key={player.id} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-full bg-violet-500/30 text-xs font-bold text-violet-100">{player.nickname.slice(0, 1)}</div><span className="text-sm font-bold text-white">{player.nickname}</span></div><Badge className="border-amber-300/20 bg-amber-300/10 text-amber-200">{player.bingoCount}빙고!</Badge></div><BingoBoard board={room.boards[player.id]} size={room.settings.size} mode="view" strict={room.settings.markingMode === "STRICT"} onChange={() => undefined} onToggle={() => undefined} /></div>)}</div>;
}

function CallsCard({ room, currentTurnId }: { room: RoomState; currentTurnId?: string }) { return <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><ShieldCheck size={16} className="text-violet-300" /> 호출 기록 <span className="ml-auto text-xs font-normal text-slate-500">{room.calls.length}</span></CardTitle></CardHeader><CardContent><div className="max-h-52 space-y-2 overflow-y-auto pr-1">{room.calls.length === 0 ? <p className="py-5 text-center text-xs text-slate-500">아직 불린 단어가 없습니다.</p> : [...room.calls].reverse().map((call) => <div key={call.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.035] px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{call.text}</p><p className="text-[10px] text-slate-500">{call.callerName}</p></div><span className="shrink-0 text-[10px] text-slate-600">{formatTime(call.createdAt)}</span></div>)}</div>{room.phase === "PLAYING" && currentTurnId && <p className="mt-3 border-t border-white/10 pt-3 text-center text-xs text-slate-500">턴 순서대로 한 단어씩 불러요</p>}</CardContent></Card>; }

function ChatCard({ messages, value, onChange, onSend }: { messages: ChatMessage[]; value: string; onChange: (value: string) => void; onSend: () => void }) { return <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><MessageCircle size={16} className="text-violet-300" /> 채팅</CardTitle></CardHeader><CardContent><div className="mb-3 max-h-64 space-y-3 overflow-y-auto pr-1">{messages.filter((message) => message.type !== "CALL").length === 0 ? <p className="py-5 text-center text-xs text-slate-500">친구들에게 인사를 건네보세요.</p> : messages.filter((message) => message.type !== "CALL").slice(-30).map((message) => <div key={message.id}><div className="flex items-center gap-2"><span className="text-xs font-bold text-violet-200">{message.authorName}</span><span className="text-[10px] text-slate-600">{formatTime(message.createdAt)}</span></div><p className="mt-1 break-words text-sm text-slate-300">{message.text}</p></div>)}</div><div className="flex gap-2"><Input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder="메시지" maxLength={100} /><Button size="icon" onClick={onSend} disabled={!value.trim()} aria-label="채팅 보내기"><Send size={15} /></Button></div></CardContent></Card>; }

export default App;
