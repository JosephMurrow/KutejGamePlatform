import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  wakeOnReturn,
  type VisibilitySource,
  type Wakeable,
} from "./socket-wake";

/**
 * Возвращение в приложение (docs/BACKLOG.md D3).
 *
 * Цена ошибки здесь несимметричная. Не подключиться вовремя — потерять место
 * в круге ходов: отсрочка на сервере пятнадцать секунд, а socket.io ждёт своей
 * паузы между попытками. Подключиться лишний раз — оборвать живое соединение
 * посреди партии. Поэтому проверяются оба края, а не только полезный.
 */

function сокет(connected: boolean) {
  let попыток = 0;
  return {
    socket: {
      get connected() {
        return connected;
      },
      connect() {
        попыток += 1;
        connected = true;
      },
    } satisfies Wakeable,
    попыток: () => попыток,
  };
}

function экран(visibilityState: string) {
  const слушатели: Array<() => void> = [];
  return {
    source: {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (_: "visibilitychange", l: () => void) => {
        слушатели.push(l);
      },
      removeEventListener: (_: "visibilitychange", l: () => void) => {
        const i = слушатели.indexOf(l);
        if (i >= 0) слушатели.splice(i, 1);
      },
    } satisfies VisibilitySource,
    подписчиков: () => слушатели.length,
    показать: (состояние: string) => {
      visibilityState = состояние;
      for (const l of [...слушатели]) l();
    },
  };
}

describe("возвращение в приложение", () => {
  it("оторвавшийся сокет подключается сразу", () => {
    const s = сокет(false);
    const e = экран("hidden");
    wakeOnReturn(s.socket, e.source);

    e.показать("visible");
    assert.equal(s.попыток(), 1);
  });

  /** Живое соединение трогать нельзя: переподключение оборвёт партию. */
  it("живой сокет не трогается", () => {
    const s = сокет(true);
    const e = экран("hidden");
    wakeOnReturn(s.socket, e.source);

    e.показать("visible");
    assert.equal(s.попыток(), 0);
  });

  /**
   * Уход в фон — не повод рвать связь самим: отсрочка на сервере как раз и
   * рассчитана на короткие отлучки.
   */
  it("уход в фон ничего не запускает", () => {
    const s = сокет(false);
    const e = экран("visible");
    wakeOnReturn(s.socket, e.source);

    e.показать("hidden");
    assert.equal(s.попыток(), 0);
  });

  it("два возвращения подряд дают одну попытку", () => {
    const s = сокет(false);
    const e = экран("hidden");
    wakeOnReturn(s.socket, e.source);

    e.показать("visible");
    e.показать("visible");
    assert.equal(s.попыток(), 1, "второй раз сокет уже живой");
  });

  it("отписка снимает слушателя", () => {
    const s = сокет(false);
    const e = экран("hidden");
    const стоп = wakeOnReturn(s.socket, e.source);

    assert.equal(e.подписчиков(), 1);
    стоп();
    assert.equal(e.подписчиков(), 0);

    e.показать("visible");
    assert.equal(s.попыток(), 0, "после отписки не должно быть попыток");
  });

  /** На сервере хука нет `document`, и падать там нечему. */
  it("без экрана не падает и отдаёт годную отписку", () => {
    const s = сокет(false);
    const стоп = wakeOnReturn(s.socket, null);

    assert.equal(typeof стоп, "function");
    assert.doesNotThrow(() => stopTwice(стоп));
    assert.equal(s.попыток(), 0);
  });
});

function stopTwice(стоп: () => void) {
  стоп();
  стоп();
}
