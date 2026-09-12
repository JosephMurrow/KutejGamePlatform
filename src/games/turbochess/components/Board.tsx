"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Chessboard, ChessboardProvider, SparePiece } from "react-chessboard";
import type { DropKind, MoveInput } from "../engine/game";
import { fileOf, parseSquare, rankOf } from "../engine/geometry";
import { legalMoves, play } from "../engine/moves";
import type { PieceKind, Side } from "../engine/pieces";
import { nextSide, type Position } from "../engine/position";
import { zombieQueue, zombieWait } from "../modes/zombies";
import {
  boardPosition,
  checkedKing,
  dropTargets,
  dropTo,
  moveKind,
  movesBetween,
  pieceType,
  targetsFrom,
} from "./boardView";
import { PIECES, colorOf, pieceSrc } from "./pieces";
import { Promotion, type PromotionChoice } from "./Promotion";

/**
 * Доска: ввод ходов и подсветки.
 *
 * Правила на клиенте — тот же движок, что на сервере, и нужен он здесь ради
 * отзывчивости: подсказать ходы, понять, что пешка доходит до края, и показать
 * ход, пока идёт ответ. Когда партия пойдёт по сети (docs/PLAN.md, этап 5),
 * настоящая доска будет одна, серверная, и отказ мгновенно вернёт позицию.
 *
 * Ввод двумя способами — перетаскиванием и «клик-клик», как у шахмат.
 */

/**
 * Поля и кант — вариант «Карамель», выбран хозяином канвой из трёх (правило
 * D0): кремовые и карамельные поля, рамка — горький шоколад. Оранжевый темы
 * остаётся в подсветках.
 */
const LIGHT = "#f6dcc4";
const DARK = "#b0663f";
/** Выбранная фигура, её ходы и взятия. */
const ACCENT = "#c2410c";
/** Последний сделанный ход. */
const SOFT = "#ff7a3d";
/** Нотация на светлом поле; на тёмном она цвета светлого поля. */
const INK = "#7a3a1a";

/**
 * Рубашка: чем закрыта чужая половина доски, пока идёт расстановка
 * («Вскрываемся»). Направление «Карамель», выбрано хозяином канвой из трёх
 * (правило D0): тон клетки приглушён, внутри кант цвета светлого поля и знак
 * турбо — тот же, что на крышке коробки. Рисунком, а не картинкой: тянется под
 * любой размер клетки и не тащит файла.
 */
const BOLT = "M60 4 L20 56 H46 L36 96 L80 38 H54 Z";

function back(ground: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="${ground}"/>` +
    `<rect x="7" y="7" width="86" height="86" rx="4" fill="none" stroke="${LIGHT}" stroke-opacity=".42" stroke-width="2"/>` +
    `<g transform="translate(28 28) scale(0.44)">` +
    `<path d="${BOLT}" fill="${LIGHT}" fill-opacity=".3"/></g></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const BACK = { light: back("#c8956a"), dark: back("#8f5233") };

/** Кант вокруг доски. Стилями, а не картинкой: тянется под любую ширину. */
const FRAME: CSSProperties = {
  padding: 7,
  borderRadius: 6,
  background: "linear-gradient(150deg, #3a1a0a 0%, #5a2a12 50%, #2b1206 100%)",
  boxShadow:
    "inset 0 0 0 1px rgba(246, 220, 196, 0.25), 0 4px 14px rgba(43, 18, 6, 0.35)",
};

export interface BoardProps {
  position: Position;
  /**
   * Какие стороны ходят с этого экрана. За одним экраном — обе, по сети —
   * своя, у зрителя и в кончившейся партии — ни одной.
   */
  controls: readonly Side[];
  /** Откуда и куда пошли последний раз. */
  lastMove: { from: string; to: string } | null;
  /** Доска развёрнута чёрными к себе. */
  flipped: boolean;
  /** Сделать ход. `false` — отказ, доска возвращается как была. */
  onMove: (move: MoveInput) => boolean | Promise<boolean>;
  /** Клетки, закрытые рубашкой: чужая половина во время расстановки. */
  covered?: readonly string[];
  /**
   * Расстановка «Вскрываемся»: вместо хода доска меняет две свои фигуры
   * местами. Есть — значит идёт расстановка, и ходов на доске нет вовсе.
   */
  onSwap?: (from: string, to: string) => void;
}

export function Board({
  position,
  controls,
  lastMove,
  flipped,
  onMove,
  covered,
  onSwap,
}: BoardProps) {
  /** Позиция после своего хода, пока его не приняли. */
  const [preview, setPreview] = useState<Position | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /** Фигура, взятая с полки резерва: ждёт клетки. */
  const [dropping, setDropping] = useState<PieceKind | null>(null);
  const [promotion, setPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);

  const shown = preview ?? position;
  const legal = useMemo(() => legalMoves(shown), [shown]);
  const arranging = onSwap !== undefined;
  const canMove =
    !arranging && preview === null && controls.includes(shown.turn);

  const styles = useMemo(() => {
    const marks: Record<string, CSSProperties> = {};

    if (lastMove) {
      for (const square of [lastMove.from, lastMove.to]) {
        marks[square] = { boxShadow: `inset 0 0 0 999px ${SOFT}55` };
      }
    }

    // Король под шахом виден всем — это не подсказка, а состояние партии.
    const king = checkedKing(shown);
    if (king) {
      marks[king] = {
        background:
          "radial-gradient(circle, rgba(200,40,20,.78) 0%, rgba(200,40,20,0) 72%)",
      };
    }

    if (picked) {
      marks[picked] = { boxShadow: `inset 0 0 0 999px ${ACCENT}57` };
      for (const [square, capture] of targetsFrom(shown, legal, picked)) {
        marks[square] = capture
          ? { boxShadow: `inset 0 0 0 4px ${ACCENT}8a` }
          : {
              background: `radial-gradient(circle, ${ACCENT}66 24%, transparent 26%)`,
            };
      }
    }

    // Закрытые клетки: своей позиции у них нет, поэтому и подсветок нет.
    for (const square of covered ?? []) {
      const at = parseSquare(shown.geometry, square);
      if (at === null) continue;
      const light =
        (fileOf(shown.geometry, at) + rankOf(shown.geometry, at)) % 2 === 1;
      marks[square] = {
        backgroundImage: light ? BACK.light : BACK.dark,
        backgroundSize: "cover",
      };
    }

    // Куда встанет фигура с полки. Взятия тут не бывает: выставляют только на
    // свободную клетку.
    if (dropping) {
      for (const square of dropTargets(shown, legal, dropping)) {
        marks[square] = {
          background: `radial-gradient(circle, ${ACCENT}66 24%, transparent 26%)`,
        };
      }
    }

    return marks;
  }, [covered, dropping, lastMove, legal, picked, shown]);

  /**
   * Своя ли фигура на клетке. В расстановке на доске только свои: чужая
   * половина пуста и закрыта рубашкой.
   */
  function own(square: string): boolean {
    const index = parseSquare(shown.geometry, square);
    if (index === null) return false;

    const cell = shown.board[index];
    return arranging ? cell !== null : cell?.side === shown.turn;
  }

  async function send(from: string, to: string, choice?: PromotionChoice) {
    setPicked(null);

    // Показываем ход сразу: рука уже отпустила фигуру, а ответ может идти по
    // сети.
    const move = movesBetween(shown, legal, from, to).find(
      (candidate) => (candidate.promotion ?? undefined) === choice,
    );
    if (!move) return;
    setPreview(play(shown, move));

    await onMove({ from, to, ...(choice ? { promotion: choice } : {}) });
    // Принят ход или нет, дальше доска показывает то, что пришло снаружи.
    setPreview(null);
  }

  /** Выставить фигуру с полки. Превращения тут не бывает, диалога не нужно. */
  async function sendDrop(kind: PieceKind, to: string): Promise<void> {
    const move = dropTo(shown, legal, kind, to);
    if (!move) return;

    setDropping(null);
    setPicked(null);
    setPreview(play(shown, move));

    await onMove({ drop: kind as DropKind, to });
    setPreview(null);
  }

  /** Фигура с полки: `wQ` — светлый ферзь. Своя — только в свой ход. */
  function pickShelf(type: string): void {
    if (!canMove) return;
    if (!type.startsWith(colorOf(shown.turn))) return;

    setPicked(null);
    const kind = type.slice(1).toLowerCase() as PieceKind;
    setDropping(dropping === kind ? null : kind);
  }

  function attempt(from: string, to: string): boolean {
    if (from === to) return false;

    // Расстановка: клетки меняются местами, а законность проверяет сервер.
    if (arranging) {
      if (!own(from)) return false;
      setPicked(null);
      onSwap(from, to);
      return true;
    }

    if (!canMove) return false;

    const kind = moveKind(shown, legal, from, to);
    if (kind === "none") return false;
    if (kind === "promotion") {
      // Диалог поверх доски; пока он открыт, ход не сделан.
      setPromotion({ from, to });
      return true;
    }

    void send(from, to);
    return true;
  }

  function clickSquare(square: string) {
    if (!canMove && !arranging) return;

    if (dropping) {
      void sendDrop(dropping, square);
      setDropping(null);
      return;
    }

    if (picked) {
      if (picked === square) {
        setPicked(null);
        return;
      }
      if (attempt(picked, square)) return;
    }

    setPicked(own(square) ? square : null);
  }

  // Своя полка под доской, чужая над ней — как места игроков. Пустую полку
  // всё равно держим: иначе доска прыгала бы на каждое выставление.
  const bottom: Side = flipped ? 1 : 0;
  const shelves =
    shown.reserve.some((list) => list.length > 0) || shown.pending.length > 0;

  return (
    <ChessboardProvider
      options={{
        position: boardPosition(shown),
        pieces: PIECES,
        chessboardRows: shown.geometry.height,
        chessboardColumns: shown.geometry.width,
        boardOrientation: flipped ? "black" : "white",
        allowDragging: canMove || arranging,
        showNotation: true,
        animationDurationInMs: 180,
        lightSquareStyle: { backgroundColor: LIGHT },
        darkSquareStyle: { backgroundColor: DARK },
        squareStyles: styles,
        darkSquareNotationStyle: { color: LIGHT },
        lightSquareNotationStyle: { color: INK },
        alphaNotationStyle: { fontSize: "12px", fontWeight: 700, bottom: 2 },
        numericNotationStyle: { fontSize: "12px", fontWeight: 700, top: 3 },
        onSquareClick: ({ square }) => clickSquare(square),
        onPieceClick: ({ isSparePiece, piece }) => {
          if (isSparePiece) pickShelf(piece.pieceType);
        },
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (targetSquare === null) return false;

          // Фигуру принесли с полки: «откуда» у неё не клетка, а вид фигуры.
          if (parseSquare(shown.geometry, sourceSquare) === null) {
            const kind = sourceSquare.slice(1).toLowerCase() as PieceKind;
            if (!dropTo(shown, legal, kind, targetSquare)) return false;
            void sendDrop(kind, targetSquare);
            return true;
          }

          return attempt(sourceSquare, targetSquare);
        },
        canDragPiece: ({ piece, square }) =>
          arranging
            ? square !== null && own(square)
            : canMove && piece.pieceType.startsWith(colorOf(shown.turn)),
      }}
    >
      <div className="flex flex-col gap-1.5">
        {shelves ? (
          <Shelf
            position={shown}
            side={nextSide(shown, bottom)}
            dropping={dropping}
          />
        ) : null}

        <div className="relative" style={FRAME}>
          <Chessboard />

          {promotion ? (
            <Promotion
              color={colorOf(shown.turn)}
              // Отмена откатывает ход: иначе фигура зависает в воздухе.
              onCancel={() => setPromotion(null)}
              onChoose={(choice) => {
                const { from, to } = promotion;
                setPromotion(null);
                void send(from, to, choice);
              }}
            />
          ) : null}
        </div>

        {shelves ? (
          <Shelf position={shown} side={bottom} dropping={dropping} />
        ) : null}
      </div>
    </ChessboardProvider>
  );
}

/**
 * Полка резерва: что сторона может выставить на доску и что ещё доспевает.
 *
 * Готовые фигуры перетаскиваются на доску и берутся кликом — теми же руками,
 * что и фигуры на доске: полка живёт внутри доски и делит с ней перетаскивание.
 * Доспевающие зомби показываются обратным отсчётом и не берутся.
 */
function Shelf({
  position,
  side,
  dropping,
}: {
  position: Position;
  side: Side;
  /** Что взято с полки прямо сейчас — та подсвечена. */
  dropping: PieceKind | null;
}) {
  const ready = new Map<PieceKind, number>();
  for (const kind of position.reserve[side] ?? []) {
    ready.set(kind, (ready.get(kind) ?? 0) + 1);
  }
  const queue = zombieQueue(position, side);

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5">
      {[...ready].map(([kind, count]) => (
        <div
          key={kind}
          className={`relative size-10 rounded-lg border p-0.5 transition ${
            dropping === kind
              ? "border-accent bg-tint"
              : "border-line bg-surface"
          }`}
        >
          <SparePiece pieceType={pieceType({ kind, side })} />
          {count > 1 ? (
            <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1 text-[10px] font-semibold text-surface">
              {count}
            </span>
          ) : null}
        </div>
      ))}

      {queue.map((zombie, index) => (
        <div
          key={`${zombie.kind}-${index}`}
          className="flex items-center gap-1 rounded-lg border border-dashed border-line px-1.5 py-0.5 text-[10px] text-muted"
        >
          {/* Правило зовёт `next/image`, но файлы уже нужного размера. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pieceSrc(colorOf(side), zombie.kind)}
            alt=""
            width={256}
            height={256}
            className="size-7 opacity-60"
          />
          {zombieWait(zombie.left)}
        </div>
      ))}
    </div>
  );
}
