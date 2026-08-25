import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLetter } from "./letter";

describe("Оформление письма", () => {
  const letter = buildLetter({
    subject: "Тема",
    heading: "Заголовок",
    lines: ["Первая строка.", "Вторая строка."],
    action: { label: "Кнопка", url: "https://example.com/confirm/abc" },
    footer: "Приписка.",
  });

  it("несёт и разметку, и простой текст", () => {
    assert.ok(letter.html.includes("<html"), "нет разметки");
    assert.ok(letter.text.length > 0, "нет текстовой части");
  });

  it("в текстовой части есть ссылка — по ней и переходят", () => {
    assert.ok(letter.text.includes("https://example.com/confirm/abc"));
  });

  it("в разметке ссылка тоже видна словами", () => {
    // Кнопка может не открыться в почтовом клиенте, поэтому адрес пишем рядом.
    const withoutButton = letter.html.replace(/<a[^>]*>.*?<\/a>/gu, "");
    assert.ok(withoutButton.includes("https://example.com/confirm/abc"));
  });

  it("подставленный текст экранируется", () => {
    const dangerous = buildLetter({
      subject: "Тема",
      heading: "<script>alert(1)</script>",
      lines: ["Ссылка: <b>жир</b>"],
    });

    assert.equal(dangerous.html.includes("<script>"), false);
    assert.ok(dangerous.html.includes("&lt;script&gt;"));
  });

  it("без кнопки письмо тоже собирается", () => {
    const plain = buildLetter({
      subject: "Тема",
      heading: "Привет",
      lines: ["Текст."],
    });
    assert.ok(plain.html.includes("Привет"));
    assert.equal(plain.html.includes("<a "), false);
  });

  it("название игры в письме русское", () => {
    assert.ok(letter.text.startsWith("Платитутка"));
    assert.ok(letter.html.includes("Плати"));
  });
});
