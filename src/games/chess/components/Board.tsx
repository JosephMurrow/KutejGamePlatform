"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { ChessColor } from "../protocol";
import { PIECES } from "./pieces";
import { Promotion, type PromotionChoice } from "./Promotion";

/**
 * Доска: ввод ходов и подсветки.
 *
 * Клиентский экземпляр правил здесь только ради отзывчивости — подсказать
 * ходы, понять, что пешка доходит до края, и показать ход до ответа сервера.
 * Настоящая доска одна, и она на сервере: любое расхождение переписывается
 * его снимком (src/games/chess/docs/BACKLOG.md B1).
 */

/** Поля доски: тема игры, сукно и кость. */
const LIGHT = "#ece3d1";
const DARK = "#7d9b86";
const ACCENT = "#1d5c43";
const SOFT = "#2f8a63";
/** Заготовленный ход: другой цвет, чтобы не путать со сделанным. */
const PREMOVE = "#c4813f66";

export interface BoardProps {
  /** Позиция с сервера. */
  fen: string;
  /** За какой цвет играет этот человек; зритель — `null`. */
  myColor: ChessColor | null;
  /** Чей сейчас ход; вне партии — `null`. */
  turn: ChessColor | null;
  /** Откуда и куда пошли последний раз. */
  lastMove: { from: string; to: string } | null;
  /** Каким по счёту будет следующий полуход. */
  ply: number;
  /** Доска развёрнута чёрными к себе. */
  flipped: boolean;
  /**
   * Режим стримера: гасим всё, что выдаёт замысел, — выбранную клетку,
   * подсказки ходов, приёмник, фигуру под курсором и анимацию. Подсветку
   * последнего сделанного хода не гасим: он уже случился и виден всем
   * (src/games/chess/docs/BACKLOG.md F1).
   */
  streamer: boolean;
  /**
   * Сказать сопернику, за какую фигуру игрок взялся.
   *
   * ⚠️ Передаётся **только** в партии с Магнусом и больше никуда: ни зрителям,
   * ни на экран. Ровно то, что режим стримера прячет от всего мира
   * (src/games/chess/docs/BACKLOG.md D3, F1). Без Магнуса сюда не приходит
   * ничего — обработчика просто нет.
   */
  onHold?: (square: string) => void;
  /**
   * Партия идёт и человек за ней сидит: можно готовить премув.
   *
   * Отдельно от `myColor` намеренно: в перемотке цвет гасится, чтобы нельзя
   * было ходить из прошлого, — а премув там тем более ни к чему.
   */
  premoves?: boolean;
  /** Отправить ход. `false` — сервер отказал, доска возвращается как была. */
  onMove: (move: {
    from: string;
    to: string;
    promotion?: PromotionChoice;
    ply: number;
  }) => Promise<boolean>;
}

export function Board({
  fen,
  myColor,
  turn,
  lastMove,
  ply,
  flipped,
  streamer,
  premoves = false,
  onHold,
  onMove,
}: BoardProps) {
  /** Позиция, показанная прямо сейчас: своя, пока сервер не ответил. */
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);
  /**
   * Ход, заготовленный на чужом ходу.
   *
   * Проверяется он не сейчас, а когда очередь дойдёт: премув и есть ставка на
   * то, каким будет ответ соперника (src/games/chess/docs/BACKLOG.md G).
   */
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(
    null,
  );

  const shown = optimistic ?? fen;
  const rules = useMemo(() => new Chess(shown), [shown]);

  const myTurn = myColor !== null && myColor === turn && optimistic === null;

  /** Куда можно пойти выбранной фигурой. */
  const targets = useMemo(() => {
    if (!picked || streamer) return new Map<string, boolean>();

    const moves = rules.moves({ square: picked as never, verbose: true });
    return new Map(moves.map((move) => [move.to, move.captured !== undefined]));
  }, [picked, rules, streamer]);

  const styles = useMemo(() => {
    const marks: Record<string, React.CSSProperties> = {};

    if (lastMove) {
      for (const square of [lastMove.from, lastMove.to]) {
        marks[square] = { boxShadow: `inset 0 0 0 999px ${SOFT}55` };
      }
    }

    // Король под шахом виден всем — это не подсказка, а состояние партии.
    if (rules.inCheck()) {
      const king = rules
        .board()
        .flat()
        .find(
          (square) => square?.type === "k" && square.color === rules.turn(),
        );
      if (king) {
        marks[king.square] = {
          background:
            "radial-gradient(circle, rgba(200,64,47,.75) 0%, rgba(200,64,47,0) 72%)",
        };
      }
    }

    if (picked && !streamer) {
      marks[picked] = { boxShadow: `inset 0 0 0 999px ${ACCENT}57` };
    }
    // Премув видно только своему, и только вне режима стримера: заготовленный
    // ход — тот самый замысел, который режим и прячет (D3, F1).
    if (premove && !streamer) {
      for (const square of [premove.from, premove.to]) {
        marks[square] = { boxShadow: `inset 0 0 0 999px ${PREMOVE}` };
      }
    }
    for (const [square, capture] of targets) {
      marks[square] = capture
        ? { boxShadow: `inset 0 0 0 4px ${ACCENT}6b` }
        : {
            background: `radial-gradient(circle, ${ACCENT}57 26%, transparent 28%)`,
          };
    }

    return marks;
  }, [lastMove, picked, premove, rules, streamer, targets]);

  // Очередь дошла — пробуем заготовленное. Не подошло, значит соперник сходил
  // не так, как ожидалось: заготовка просто пропадает.
  //
  // Отдельным кадром, а не тут же: ход соперника должен успеть появиться на
  // доске. Иначе премув затирает его в том же кадре, и человек не видит, на
  // что, собственно, отвечал.
  useEffect(() => {
    if (!myTurn || !premove) return;

    const { from, to } = premove;
    const legal = new Chess(fen)
      .moves({ square: from as never, verbose: true })
      .some((move) => move.to === to);

    const timer = setTimeout(() => {
      setPremove(null);
      if (!legal) return;

      if (needsPromotion(from, to)) setPromotion({ from, to });
      else void send(from, to);
    }, 0);

    return () => clearTimeout(timer);
    // Заготовка срабатывает на смену очереди, а не на каждую отрисовку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, fen]);

  /** Доходит ли пешка этим ходом до края: тогда нужен выбор фигуры. */
  function needsPromotion(from: string, to: string): boolean {
    const piece = rules.get(from as never);
    if (!piece || piece.type !== "p") return false;

    return piece.color === "w" ? to[1] === "8" : to[1] === "1";
  }

  async function send(from: string, to: string, choice?: PromotionChoice) {
    setPicked(null);

    // Показываем ход сразу: ответ сервера придёт через сеть, а рука уже
    // отпустила фигуру.
    const preview = new Chess(fen);
    try {
      preview.move({ from, to, promotion: choice ?? "q" });
      setOptimistic(preview.fen());
    } catch {
      // Ход нелегален по нашей копии — сервер его тоже не примет.
      return;
    }

    const accepted = await onMove({ from, to, promotion: choice, ply });
    // Отказ — доска мгновенно возвращается к серверной: она единственная
    // настоящая.
    setOptimistic(null);
    if (!accepted) setPicked(null);
  }

  function attempt(from: string, to: string): boolean {
    if (!myTurn || from === to) return false;

    const legal = rules
      .moves({ square: from as never, verbose: true })
      .some((move) => move.to === to);
    if (!legal) return false;

    if (needsPromotion(from, to)) {
      // Диалог у клетки назначения; пока он открыт, ход не сделан.
      setPromotion({ from, to });
      return true;
    }

    void send(from, to);
    return true;
  }

  function clickSquare(square: string) {
    const mineNow = () => {
      const piece = rules.get(square as never);
      return piece && piece.color === (myColor === "white" ? "w" : "b");
    };

    // Чужой ход: собираем премув. Легальность проверится, когда очередь дойдёт.
    if (!myTurn) {
      if (!premoves) return;

      if (picked) {
        setPicked(null);
        if (picked !== square && !mineNow())
          setPremove({ from: picked, to: square });
        return;
      }

      setPremove(null);
      if (mineNow()) setPicked(square);
      return;
    }

    if (picked) {
      if (picked === square) {
        setPicked(null);
        return;
      }
      if (attempt(picked, square)) return;
    }

    const mine = mineNow();
    setPicked(mine ? square : null);
    if (mine) onHold?.(square);
  }

  return (
    <div className="relative">
      <Chessboard
        options={{
          position: shown,
          pieces: PIECES,
          boardOrientation: flipped ? "black" : "white",
          allowDragging: myTurn || premoves,
          showNotation: true,
          // Анимация показывает ход, который ещё не сделан: фигура едет,
          // сервер ещё не ответил, а запись экрана это уже поймала.
          animationDurationInMs: streamer ? 0 : 180,
          lightSquareStyle: { backgroundColor: LIGHT },
          darkSquareStyle: { backgroundColor: DARK },
          squareStyles: styles,
          // В режиме стримера доска обязана выглядеть нетронутой, пока ход не
          // сделан: ни приёмника, ни фигуры под курсором. Фигура при этом
          // **остаётся** на своей клетке в полную силу — гасить её было бы
          // хуже всего: пустая клетка выдаёт выбор вернее любой подсветки.
          dropSquareStyle: streamer ? {} : undefined,
          draggingPieceStyle: streamer ? { opacity: 0 } : undefined,
          draggingPieceGhostStyle: streamer ? { opacity: 1 } : undefined,
          darkSquareNotationStyle: { color: LIGHT, opacity: 0.55 },
          lightSquareNotationStyle: { color: DARK, opacity: 0.75 },
          onSquareClick: ({ square }) => clickSquare(square),
          // Взялся за фигуру — соперник об этом узнает. Только один соперник.
          onPieceDrag: ({ square }) => {
            if (myTurn && square) onHold?.(square);
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (targetSquare === null || sourceSquare === targetSquare) {
              return false;
            }
            if (myTurn) return attempt(sourceSquare, targetSquare);

            setPremove({ from: sourceSquare, to: targetSquare });
            return false;
          },
          canDragPiece: ({ piece }) =>
            (myTurn || premoves) &&
            piece.pieceType.startsWith(myColor === "white" ? "w" : "b"),
        }}
      />

      {promotion ? (
        <Promotion
          color={myColor ?? "white"}
          // Отмена обязана откатывать ход: иначе фигура зависает в воздухе
          // (src/games/chess/docs/BACKLOG.md B3).
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
