import type { BotLevelDb } from "../rooms/settings";

/**
 * Дебютный репертуар ботов.
 *
 * Линии записаны обычной шахматной нотацией одной строкой — так их можно
 * читать и дописывать глазами, а не разбирать столбик из кавычек. В позиции с ходами их разворачивает сид: ключом служит хеш позиции,
 * потому что одна и та же расстановка приходит разными порядками ходов
 * (src/games/chess/docs/BACKLOG.md D2).
 *
 * Репертуар подобран по характеру уровня: чем слабее бот, тем прямее и
 * привычнее его дебюты. Это не про силу, а про узнаваемость: соперник,
 * начинающий партию крайней пешкой, перестаёт быть похожим на человека.
 */

/** Главные линии: ими играют и эксперт, и Магнус. */
const MAIN_LINES: string[] = [
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
  "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5",
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O",
  "d4 d5 c4 c6 Nc3 Nf6 Nf3 dxc4 a4 Bf5 Ne5 e6",
  "e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3 Nc6",
  "c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7 Bf4 O-O e3 c5",
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5 Nb5 d6 c4 Be7",
  "Nf3 Nf6 c4 e6 Nc3 d5 d4 Be7 Bg5 h6 Bh4 O-O",
  "d4 d5 c4 e6 Nc3 Be7 Nf3 Nf6 Bf4 O-O e3 c5",
];

export const REPERTOIRE: Record<BotLevelDb, string[]> = {
  // Простое и прямое: центр, слон на c4, быстрая рокировка.
  EASY: [
    "e4 e5 Bc4 Nc6 Nf3 Bc5 O-O",
    "e4 e5 Nf3 Nc6 Bc4 Nf6 d3",
    "e4 e5 Nf3 d6 d4 Nf6 Nc3",
    "e4 c5 Nf3 d6 Bc4 Nf6 d3",
    "e4 e6 d4 d5 Nc3 Nf6 Bg5",
    "e4 c6 d4 d5 Nc3 dxe4 Nxe4",
    "d4 d5 Nf3 Nf6 Bf4 e6 e3",
    "d4 Nf6 Nf3 e6 Bf4 d5 e3",
    "e4 d5 exd5 Qxd5 Nc3 Qa5 d4",
    "e4 Nf6 e5 Nd5 d4 d6 Nf3",
  ],

  // Клубная классика: испанская, ферзевый гамбит, сицилианская.
  NORMAL: [
    "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O",
    "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3",
    "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4",
    "e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3",
    "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3",
    "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4",
    "d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2",
    "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3",
    "c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5",
  ],

  // Острее и современнее: маршалл, найдорф, славянская, каталонское.
  HARD: [
    "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3",
    "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6",
    "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3",
    "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6",
    "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4",
    "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7",
    "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5",
    "Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d4 O-O c4",
    "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3",
  ],

  EXPERT: MAIN_LINES,
  // Магнус играет то же, что эксперт: репертуар у него не шуточный.
  // Шутка — в том, что будет дальше (src/games/chess/docs/BACKLOG.md D3).
  MAGNUS: MAIN_LINES,
};
