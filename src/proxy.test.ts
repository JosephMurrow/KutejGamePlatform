import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insideGame, isGamePage } from "./proxy";

/**
 * Правило доступа к разделам игры.
 *
 * Тест заведён после настоящей поломки: правило «закрыто всё, что глубже
 * страницы игры» заодно закрыло знак игры, иконку вкладки и картинки ботов —
 * незалогиненный получал вместо них редирект на вход. Заметить это глазами
 * трудно: у вошедшего всё работает
 * (src/games/chess/docs/BACKLOG.md A4).
 */
describe("что закрыто внутри игры", () => {
  it("закрывает зал, свою комнату и рейтинг", () => {
    for (const path of [
      "/games/pricetitute/play",
      "/games/pricetitute/rooms",
      "/games/pricetitute/rooms/new",
      "/games/pricetitute/leaderboard",
      "/games/chess/play",
      "/games/chess/rooms/new",
      "/games/chess/leaderboard",
    ]) {
      assert.equal(insideGame(path), true, path);
    }
  });

  it("оставляет открытыми полку и страницу игры", () => {
    for (const path of ["/games", "/games/", "/games/chess", "/games/chess/"]) {
      assert.equal(insideGame(path), false, path);
    }
  });

  it("не трогает знак игры, иконку вкладки и картинки ботов", () => {
    for (const path of [
      "/games/chess/icon",
      "/games/chess/logo.png",
      "/games/pricetitute/icon",
      "/games/pricetitute/apple-icon.png",
      "/games/pricetitute/bots/00.svg",
    ]) {
      assert.equal(insideGame(path), false, path);
    }
  });

  it("не считает своим то, что лежит не под играми", () => {
    for (const path of ["/", "/profile", "/r/ABC123", "/login"]) {
      assert.equal(insideGame(path), false, path);
    }
  });
});

/**
 * Что закрыто гостю.
 *
 * Гость заведён под одну стримерскую комнату: полка и чужие игры ему ни к
 * чему. Но картинки той игры, в которой он сидит, лежат под тем же адресом, и
 * закрывать их нельзя — на первой же шахматной доске гость получил вместо
 * фигур бесконечный редирект (src/games/chess/docs/BACKLOG.md A4).
 */
describe("полка и картинки для гостя", () => {
  it("закрывает полку и страницы игр", () => {
    for (const path of [
      "/games",
      "/games/chess",
      "/games/chess/play",
      "/games/pricetitute/leaderboard",
    ]) {
      assert.equal(isGamePage(path), true, path);
    }
  });

  it("оставляет открытыми файлы игры", () => {
    for (const path of [
      "/games/chess/pieces/br.png",
      "/games/chess/logo.png",
      "/games/pricetitute/bots/00.svg",
      "/games/pricetitute/apple-icon.png",
    ]) {
      assert.equal(isGamePage(path), false, path);
    }
  });

  it("чужого не трогает", () => {
    for (const path of ["/", "/r/ABC123", "/profile", "/brand/icon.png"]) {
      assert.equal(isGamePage(path), false, path);
    }
  });
});
