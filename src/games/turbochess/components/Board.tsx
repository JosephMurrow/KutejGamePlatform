"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { MoveInput } from "../engine/game";
import { parseSquare } from "../engine/geometry";
import { legalMoves, play } from "../engine/moves";
import type { Side } from "../engine/pieces";
import type { Position } from "../engine/position";
import {
  boardPosition,
  checkedKing,
  moveKind,
  movesBetween,
  targetsFrom,
} from "./boardView";
import { PIECES, colorOf } from "./pieces";
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
}

export function Board({
  position,
  controls,
  lastMove,
  flipped,
  onMove,
}: BoardProps) {
  /** Позиция после своего хода, пока его не приняли. */
  const [preview, setPreview] = useState<Position | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);

  const shown = preview ?? position;
  const legal = useMemo(() => legalMoves(shown), [shown]);
  const canMove = preview === null && controls.includes(shown.turn);

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

    return marks;
  }, [lastMove, legal, picked, shown]);

  /** Своя ли фигура на клетке — того, чья очередь. */
  function own(square: string): boolean {
    const index = parseSquare(shown.geometry, square);
    return index !== null && shown.board[index]?.side === shown.turn;
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

  function attempt(from: string, to: string): boolean {
    if (!canMove || from === to) return false;

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
    if (!canMove) return;

    if (picked) {
      if (picked === square) {
        setPicked(null);
        return;
      }
      if (attempt(picked, square)) return;
    }

    setPicked(own(square) ? square : null);
  }

  return (
    <div className="relative" style={FRAME}>
      <Chessboard
        options={{
          position: boardPosition(shown),
          pieces: PIECES,
          chessboardRows: shown.geometry.height,
          chessboardColumns: shown.geometry.width,
          boardOrientation: flipped ? "black" : "white",
          allowDragging: canMove,
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
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (targetSquare === null) return false;
            return attempt(sourceSquare, targetSquare);
          },
          canDragPiece: ({ piece }) =>
            canMove && piece.pieceType.startsWith(colorOf(shown.turn)),
        }}
      />

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
  );
}
