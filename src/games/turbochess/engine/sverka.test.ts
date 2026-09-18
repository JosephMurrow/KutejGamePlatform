import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { fromFen } from "./fen";
import { squareName } from "./geometry";
import {
  insufficientMaterial,
  legalMoves,
  play,
  san,
  type Move,
} from "./moves";
import { classicPosition, type Position } from "./position";

/**
 * Сверка своего движка с `chess.js` — единственное место турбо-шахмат, где
 * библиотека вообще упоминается, и это тест (docs/BACKLOG.md B3).
 *
 * Свои правила легко написать «почти правильно»: взятие на проходе со
 * вскрытием, рокировка через битое поле, связка. Поэтому на каждом узле
 * сверяется всё сразу — множество законных ходов, запись каждого хода и
 * недостаточный материал, — и первое же расхождение называет путь до него.
 */

function uci(position: Position, move: Move): string {
  const { geometry } = position;
  return `${squareName(geometry, move.from)}${squareName(geometry, move.to)}${move.promotion ?? ""}`;
}

/**
 * Сверить узел: ходы, записи, материал. Возвращает свои ходы для обхода.
 *
 * Запись каждого хода — самое дорогое: ради шаха и мата она заглядывает на
 * ход вперёд. Поэтому её можно выключить там, где узлов много, а запись уже
 * проверена обходом деревьев.
 */
function compare(
  position: Position,
  chess: Chess,
  path: string[],
  records = true,
): Move[] {
  const where = path.length ? path.join(" ") : "начало";
  const legal = legalMoves(position);

  const ours = new Map(
    legal.map((move) => [
      uci(position, move),
      records ? san(position, move, legal) : "",
    ]),
  );
  const theirs = new Map(
    chess
      .moves({ verbose: true })
      .map((move) => [
        `${move.from}${move.to}${move.promotion ?? ""}`,
        move.san,
      ]),
  );

  assert.deepEqual(
    [...ours.keys()].sort(),
    [...theirs.keys()].sort(),
    `ходы разошлись после: ${where}`,
  );
  if (records) {
    for (const [key, text] of ours) {
      assert.equal(text, theirs.get(key), `запись ${key} после: ${where}`);
    }
  }
  assert.equal(
    insufficientMaterial(position),
    chess.isInsufficientMaterial(),
    `материал после: ${where}`,
  );

  return legal;
}

/** Обойти дерево на заданную глубину, сверяя каждый узел. */
function walk(
  position: Position,
  chess: Chess,
  depth: number,
  path: string[] = [],
): number {
  const legal = compare(position, chess, path);
  if (depth === 1) return legal.length;

  let nodes = 0;
  for (const move of legal) {
    const text = san(position, move, legal);
    chess.move({
      from: squareName(position.geometry, move.from),
      to: squareName(position.geometry, move.to),
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });
    nodes += walk(play(position, move), chess, depth - 1, [...path, text]);
    chess.undo();
  }
  return nodes;
}

/** Простой ГПСЧ с зерном: случайные партии должны повторяться при падении. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Справочные позиции perft: https://www.chessprogramming.org/Perft_Results */
const KIWIPETE =
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const POSITION_3 = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";
const POSITION_4 =
  "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1";
const POSITION_5 = "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8";
const POSITION_6 =
  "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10";

describe("сверка с chess.js", () => {
  it("совпадает с начала партии на три полухода", () => {
    assert.equal(walk(classicPosition(), new Chess(), 3), 8902);
  });

  it("совпадает на справочных позициях", () => {
    for (const [fen, depth, nodes] of [
      [KIWIPETE, 2, 2039],
      [POSITION_3, 3, 2812],
      [POSITION_4, 3, 9467],
      [POSITION_5, 2, 1486],
      [POSITION_6, 2, 2079],
    ] as const) {
      assert.equal(walk(fromFen(fen), new Chess(fen), depth), nodes, fen);
    }
  });

  it("совпадает в записи: уточнения, превращения, рокировка с шахом, мат", () => {
    for (const fen of [
      // Три ферзя бьют b2: уточнять приходится и вертикалью, и полем.
      "8/8/7k/8/8/Q1Q5/8/Q6K w - - 0 1",
      // Превращение со взятием и шахом.
      "3r3k/2P5/8/8/8/8/8/K7 w - - 0 1",
      // Рокировка, которая сама даёт шах.
      "5k2/8/8/8/8/8/8/4K2R w K - 0 1",
      // Взятие на проходе вскрывает шах ладьёй по вертикали.
      "4k3/8/8/3pP3/8/8/8/4RK2 w - d6 0 1",
      // Конь уходит со вскрытием: двойной шах, отвечать можно только королём.
      "4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1",
    ]) {
      walk(fromFen(fen), new Chess(fen), 2);
    }
  });

  it("совпадает на случайных партиях до самого конца", () => {
    const random = mulberry32(20260911);

    for (let party = 0; party < 8; party++) {
      let position = classicPosition();
      const chess = new Chess();
      const path: string[] = [];

      for (let ply = 0; ply < 200; ply++) {
        const legal = compare(position, chess, path, false);
        if (legal.length === 0 || chess.isInsufficientMaterial()) break;

        const move = legal[Math.floor(random() * legal.length)];
        if (!move) break;
        const text = san(position, move, legal);
        const made = chess.move({
          from: squareName(position.geometry, move.from),
          to: squareName(position.geometry, move.to),
          ...(move.promotion ? { promotion: move.promotion } : {}),
        });
        assert.equal(text, made.san, `запись после: ${path.join(" ")}`);
        path.push(text);
        position = play(position, move);
      }
    }
  });
});

describe("perft", () => {
  /** Число листьев дерева на заданной глубине — классическая проверка генератора. */
  function perft(position: Position, depth: number): number {
    const legal = legalMoves(position);
    if (depth === 1) return legal.length;

    let nodes = 0;
    for (const move of legal) nodes += perft(play(position, move), depth - 1);
    return nodes;
  }

  it("сходится со справочными числами", () => {
    // Глубже — в разы дольше. Прогонялось один раз до пяти полуходов с
    // начала и до четырёх на справочных позициях: всё сошлось.
    assert.equal(perft(classicPosition(), 4), 197281);
    assert.equal(perft(fromFen(KIWIPETE), 3), 97862);
    assert.equal(perft(fromFen(POSITION_3), 4), 43238);
    assert.equal(perft(fromFen(POSITION_4), 3), 9467);
    assert.equal(perft(fromFen(POSITION_5), 3), 62379);
    assert.equal(perft(fromFen(POSITION_6), 3), 89890);
  });
});
