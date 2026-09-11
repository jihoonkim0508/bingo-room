import type { CSSProperties } from "react";
import { countBingos, getLines } from "../lib/game";
import type { BoardCell } from "../types";
import { cn } from "../lib/utils";

interface BingoBoardProps {
  board: BoardCell[];
  size: number;
  mode: "edit" | "play" | "view";
  strict: boolean;
  onChange: (index: number, value: string) => void;
  onToggle: (index: number) => void;
}

export function BingoBoard({ board, size, mode, strict, onChange, onToggle }: BingoBoardProps) {
  const completedLines = getLines(size).filter((line) => line.every((index) => board[index]?.marked));
  const completed = new Set(completedLines.flat());
  const bingoCount = countBingos(board, size);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{mode === "edit" ? `${size * size}칸을 채워주세요` : strict ? "엄격 모드 · 자동 체크" : "느슨 모드 · 직접 체크"}</span>
        {mode !== "edit" && <span className="font-bold text-violet-300">{bingoCount}빙고</span>}
      </div>
      <div className="relative mx-auto max-w-[560px]">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {board.map((cell, index) => {
            const isMarked = cell.marked;
            if (mode === "edit") {
              return (
                <input
                  key={index}
                  value={cell.text}
                  onChange={(event) => onChange(index, event.target.value)}
                  maxLength={30}
                  placeholder={`${index + 1}`}
                  aria-label={`${index + 1}번째 빙고 칸`}
                  className="aspect-square min-w-0 rounded-xl border border-white/10 bg-black/20 px-2 text-center text-xs text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                />
              );
            }
            return (
              <button
                key={index}
                type="button"
                disabled={mode === "view" || strict}
                onClick={() => onToggle(index)}
                className={cn(
                  "relative aspect-square min-w-0 overflow-hidden rounded-xl border px-1.5 text-center text-xs font-semibold transition",
                  isMarked ? "border-violet-300/80 bg-violet-500/80 text-white shadow-lg shadow-violet-500/20" : "border-white/10 bg-white/[0.055] text-slate-200 hover:border-violet-300/50 hover:bg-white/10",
                  completed.has(index) && "ring-2 ring-amber-300/70",
                  mode === "view" && "cursor-default hover:border-white/10 hover:bg-white/[0.055]",
                )}
              >
                {cell.text || "빈 칸"}
                {isMarked && <span className="absolute inset-x-0 bottom-1 text-[9px] font-black uppercase tracking-widest text-violet-100/80">check</span>}
              </button>
            );
          })}
        </div>
        {mode !== "edit" && completedLines.map((line, index) => <span key={`${line.join("-")}-${index}`} aria-hidden="true" className="pointer-events-none absolute z-10 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]" style={lineStyle(line, size)} />)}
      </div>
    </div>
  );
}

function lineStyle(line: number[], size: number): CSSProperties {
  const row = Math.floor(line[0] / size);
  if (line.every((index) => Math.floor(index / size) === row)) return { left: 0, right: 0, top: `${((row + 0.5) / size) * 100}%`, height: 4, transform: "translateY(-50%)" };

  const column = line[0] % size;
  if (line.every((index) => index % size === column)) return { top: 0, bottom: 0, left: `${((column + 0.5) / size) * 100}%`, width: 4, transform: "translateX(-50%)" };

  const mainDiagonal = line.every((index, position) => index === position * (size + 1));
  return { left: "50%", top: "50%", width: "141.5%", height: 4, transform: `translate(-50%, -50%) rotate(${mainDiagonal ? 45 : -45}deg)` };
}
