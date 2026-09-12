/**
 * Кости режимов. Бросает их **сервер** и только по зерну партии: иначе партию
 * нельзя ни перемотать, ни разобрать в споре (docs/MODES.md, «Общее для всех
 * режимов»). Клиент не бросает ничего никогда.
 *
 * Соль — это то, что отличает один бросок от другого в одной партии: номер
 * полухода, номер стороны. С тем же зерном и той же солью выпадет то же самое.
 */
export function roller(seed: number, salt = 0): () => number {
  let state = (seed + Math.imul(salt, 0x9e3779b1)) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
