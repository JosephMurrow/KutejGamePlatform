/**
 * Вернулись в приложение — сразу проверяем соединение (docs/BACKLOG.md D3).
 *
 * Зачем это здесь. Айфон замораживает свёрнутое приложение через пару секунд,
 * и сокет при этом рвётся. Сам по себе socket.io переподключается, но не сразу:
 * он ждёт своей паузы между попытками, а на сервере у оторвавшегося всего
 * пятнадцать секунд отсрочки, после которых он теряет место в круге ходов.
 * Между «ответил в мессенджере» и «вернулся в игру» проходит ровно та минута.
 *
 * Во вкладке браузера так тоже бывает, но реже: вкладки переключают, а
 * приложения сворачивают. Установка делает редкий случай обычным.
 *
 * Чего это не чинит: случай, когда сокет считает себя живым, а связь уже
 * оборвана. Такое socket.io замечает сам, по своему таймауту, и ускорять это
 * отсюда нечем — понадобится, будет видно на живом телефоне.
 */

/** Всё, что нужно от сокета: знать, жив ли он, и уметь подключиться. */
export interface Wakeable {
  readonly connected: boolean;
  connect(): unknown;
}

/** Минимум от `document`: подписка и текущая видимость. */
export interface VisibilitySource {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/**
 * Подписаться на возвращение в приложение. Возвращает отписку — её отдают
 * в уборку эффекта рядом с закрытием сокета.
 */
export function wakeOnReturn(
  socket: Wakeable,
  source?: VisibilitySource | null,
): () => void {
  const target =
    source ??
    (typeof document === "undefined"
      ? null
      : (document as unknown as VisibilitySource));

  if (!target) return () => {};

  const onChange = () => {
    // Ушли из приложения — ничего не делаем: рвать соединение самим незачем,
    // отсрочка на сервере как раз и рассчитана на короткие отлучки.
    if (target.visibilityState !== "visible") return;
    if (socket.connected) return;

    socket.connect();
  };

  target.addEventListener("visibilitychange", onChange);
  return () => target.removeEventListener("visibilitychange", onChange);
}
