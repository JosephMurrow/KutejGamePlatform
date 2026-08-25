import qrcode from "qrcode-generator";

/**
 * Разметка QR-кода: размер поля в модулях и путь для SVG.
 *
 * Рисуем сами, а не берём картинкой у стороннего сервиса: такому сервису
 * пришлось бы отдать ссылку на приватную комнату, а весь смысл такой комнаты в
 * том, что попасть в неё можно только по ссылке.
 */

/**
 * Белое поле вокруг кода. Четыре модуля — минимум по стандарту; без него
 * телефоны читают код заметно хуже.
 */
export const QUIET_ZONE = 4;

export interface QrLayout {
  /** Сторона поля в модулях, вместе с белой рамкой. */
  size: number;
  /** Путь для `<path d>`, где каждый тёмный модуль — квадрат один на один. */
  path: string;
}

export function buildQr(text: string): QrLayout {
  // Нулевой тип — «подбери минимальный, куда влезет». Уровень коррекции M:
  // разумная середина между размером кода и устойчивостью к бликам.
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const modules = qr.getModuleCount();
  const parts: string[] = [];

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) {
        parts.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
      }
    }
  }

  return { size: modules + QUIET_ZONE * 2, path: parts.join("") };
}
