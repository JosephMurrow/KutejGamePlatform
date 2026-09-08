/**
 * Пул аватаров платформы: 40 нарисованных зверей, файлами в `public/avatars`.
 *
 * Раньше они собирались примитивами в компоненте на пятьсот строк. Теперь
 * здесь только «номер → файл и имя»: рисунок живёт картинкой, а не кодом
 * (docs/BACKLOG.md D5, D6).
 *
 * **Номера менять нельзя.** `avatarId` лежит в базе у живых людей: аватар
 * номер 12 обязан остаться той же ящерицей того же цвета. Новые звери
 * дописываются только в конец.
 */

export interface AvatarSpec {
  /** Имя файла в `public/avatars`. */
  file: string;
  /** Как назвать вслух: читалке с экрана и в подсказке при выборе. */
  name: string;
}

/** Где лежат картинки. Тем же путём их отдаёт `<img>`. */
export const AVATAR_DIR = "/avatars";

export const AVATARS: readonly AvatarSpec[] = [
  { file: "00.svg", name: "Рыжий кот" },
  { file: "01.svg", name: "Серый кот в очках" },
  { file: "02.svg", name: "Чёрный кот с бабочкой" },
  { file: "03.svg", name: "Белый кот в шапке" },
  { file: "04.svg", name: "Рыжий пёс" },
  { file: "05.svg", name: "Серый пёс в шапке" },
  { file: "06.svg", name: "Бежевый пёс с бабочкой" },
  { file: "07.svg", name: "Тёмный пёс в очках" },
  { file: "08.svg", name: "Бурый ёж" },
  { file: "09.svg", name: "Сиреневый ёж в шапке" },
  { file: "10.svg", name: "Оливковый ёж с бабочкой" },
  { file: "11.svg", name: "Рыжий ёж в очках" },
  { file: "12.svg", name: "Зелёная ящерица" },
  { file: "13.svg", name: "Голубая ящерица в шапке" },
  { file: "14.svg", name: "Салатовая ящерица в очках" },
  { file: "15.svg", name: "Фиолетовая ящерица с бабочкой" },
  { file: "16.svg", name: "Лиса" },
  { file: "17.svg", name: "Рыжая лиса с бабочкой" },
  { file: "18.svg", name: "Серая лиса в шапке" },
  { file: "19.svg", name: "Бурая лиса в очках" },
  { file: "20.svg", name: "Зелёная лягушка" },
  { file: "21.svg", name: "Тёмная лягушка в шапке" },
  { file: "22.svg", name: "Голубая лягушка с бабочкой" },
  { file: "23.svg", name: "Сиреневая сова" },
  { file: "24.svg", name: "Синяя сова в очках" },
  { file: "25.svg", name: "Бежевая сова в шапке" },
  { file: "26.svg", name: "Серая сова с бабочкой" },
  { file: "27.svg", name: "Енот" },
  { file: "28.svg", name: "Бурый енот в шапке" },
  { file: "29.svg", name: "Серый енот в очках" },
  { file: "30.svg", name: "Капибара" },
  { file: "31.svg", name: "Капибара в очках" },
  { file: "32.svg", name: "Панда" },
  { file: "33.svg", name: "Панда с бабочкой" },
  { file: "34.svg", name: "Ворон" },
  { file: "35.svg", name: "Ворон в шапке" },
  { file: "36.svg", name: "Ворон в очках" },
  { file: "37.svg", name: "Рыжий хомяк" },
  { file: "38.svg", name: "Бежевый хомяк в шапке" },
  { file: "39.svg", name: "Розовый хомяк с бабочкой" },
];

export const AVATAR_COUNT = AVATARS.length;

/** Аватар по индексу; индекс за пределами пула заворачивается по кругу. */
export function getAvatar(id: number): AvatarSpec {
  const size = AVATARS.length;
  const index = ((Math.trunc(id) % size) + size) % size;
  const spec = AVATARS[index];
  if (!spec) {
    throw new Error(`Аватар с индексом ${id} не найден`);
  }
  return spec;
}

/** Адрес картинки аватара. */
export function avatarSrc(id: number): string {
  return `${AVATAR_DIR}/${getAvatar(id).file}`;
}

export function randomAvatarId(): number {
  return Math.floor(Math.random() * AVATARS.length);
}
