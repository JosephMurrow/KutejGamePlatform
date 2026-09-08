import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crownFor, roomLeaders, titlesOf, type Titles } from "./crowns";

const ids = (leaders: ReadonlySet<string>) => [...leaders].sort();

describe("Корона лидера комнаты", () => {
  it("достаётся тому, у кого больше всех", () => {
    const leaders = roomLeaders([
      { id: "а", score: 2 },
      { id: "б", score: 5 },
      { id: "в", score: 4 },
    ]);

    assert.deepEqual(ids(leaders), ["б"]);
  });

  it("при ничьей достаётся всем лидерам", () => {
    const leaders = roomLeaders([
      { id: "а", score: 5 },
      { id: "б", score: 5 },
      { id: "в", score: 1 },
    ]);

    assert.deepEqual(ids(leaders), ["а", "б"]);
  });

  it("не выдаётся, пока все на нуле", () => {
    const leaders = roomLeaders([
      { id: "а", score: 0 },
      { id: "б", score: 0 },
    ]);

    assert.equal(leaders.size, 0);
  });

  it("достаётся единственному, кто открыл счёт", () => {
    const leaders = roomLeaders([
      { id: "а", score: 1 },
      { id: "б", score: 0 },
    ]);

    assert.deepEqual(ids(leaders), ["а"]);
  });

  it("не спотыкается о пустую комнату", () => {
    assert.equal(roomLeaders([]).size, 0);
  });
});

function titles(over: Partial<Titles> = {}): Titles {
  return {
    allTimeChampionId: null,
    weekChampionId: null,
    leaders: new Set(),
    ...over,
  };
}

describe("Какую корону надевает игрок", () => {
  it("без титулов короны нет", () => {
    assert.equal(crownFor("а", titles()), null);
  });

  it("узнаёт каждый титул по отдельности", () => {
    assert.equal(crownFor("а", titles({ allTimeChampionId: "а" })), "alltime");
    assert.equal(crownFor("а", titles({ weekChampionId: "а" })), "week");
    assert.equal(crownFor("а", titles({ leaders: new Set(["а"]) })), "room");
  });

  it("при двух титулах надевает старший", () => {
    const both = titles({ weekChampionId: "а", leaders: new Set(["а"]) });
    assert.equal(crownFor("а", both), "week");
  });

  it("чемпион за всё время бьёт всё остальное", () => {
    const all = titles({
      allTimeChampionId: "а",
      weekChampionId: "а",
      leaders: new Set(["а"]),
    });
    assert.equal(crownFor("а", all), "alltime");
  });

  it("не путает соседей по комнате", () => {
    const mixed = titles({
      allTimeChampionId: "а",
      weekChampionId: "б",
      leaders: new Set(["в"]),
    });

    assert.equal(crownFor("а", mixed), "alltime");
    assert.equal(crownFor("б", mixed), "week");
    assert.equal(crownFor("в", mixed), "room");
    assert.equal(crownFor("г", mixed), null);
  });

  it("собирает титулы из снимка комнаты", () => {
    const got = titlesOf({
      players: [
        { id: "а", score: 1 },
        { id: "б", score: 4 },
      ],
      allTimeChampionId: "я",
      weekChampionId: null,
    });

    assert.equal(got.allTimeChampionId, "я");
    assert.equal(got.weekChampionId, null);
    assert.deepEqual([...got.leaders], ["б"]);
  });
});
