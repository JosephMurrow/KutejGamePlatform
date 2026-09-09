import { z } from "zod";

/**
 * Переменные окружения игрового сервера. Модуль серверный — не импортировать
 * из клиентских компонентов.
 *
 * .env подгружается флагом `node --env-file-if-exists=.env` в npm-скриптах,
 * а для Prisma CLI — через dotenv в prisma.config.ts.
 *
 * Проверка ленивая и срабатывает при первом обращении к значению. Так сборка
 * не требует боевых секретов: `next build` обходит модули страниц и уронил бы
 * себя на пустом DATABASE_URL, хотя базу при сборке никто не трогает. Сервер
 * же читает окружение сразу на старте, так что падать не вовремя он не начнёт.
 */
/**
 * Пустая строка — это «не задано», а не значение.
 *
 * docker compose подставляет пустую строку вместо переменной, которой нет в
 * .env. Без этой обёртки такая переменная роняет проверку вместо того, чтобы
 * откатиться к значению по умолчанию, — и приложение не поднимается вовсе.
 */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL не задан"),
  HOST: z.string().min(1).default("localhost"),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET должен быть не короче 32 символов"),

  /**
   * Внешний адрес игры. Нужен письмам: ссылку в письме собрать из запроса
   * нельзя — письмо уходит из фоновой задачи, где никакого запроса нет.
   */
  APP_URL: optional(z.string().url().default("http://localhost:3000")),

  /**
   * Почтовый релей. Пустой хост означает «отправка не настроена»: письма
   * тогда не уходят, а всё, что от них зависит, честно об этом сообщает.
   */
  MAIL_HOST: z.string().default(""),
  MAIL_PORT: optional(z.coerce.number().int().positive().default(587)),
  MAIL_USER: z.string().default(""),
  MAIL_PASSWORD: z.string().default(""),
  MAIL_FROM: optional(z.string().min(1).default("Кутёж <no-reply@localhost>")),

  /**
   * Путь к движку шахмат. Движок живёт отдельным процессом и в наш бандл не
   * попадает: этого требует его лицензия, и это же не пускает подсказку в
   * браузер игрока (src/games/chess/docs/BACKLOG.md D1).
   *
   * Пусто — значит ботов в шахматах нет; всё остальное работает как обычно.
   */
  CHESS_ENGINE_PATH: z.string().default(""),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Некорректное окружение. Проверь .env (образец — .env.example):\n${details}`,
    );
  }

  return parsed.data;
}

export const env = new Proxy({} as Env, {
  get(_target, property) {
    cached ??= load();
    return cached[property as keyof Env];
  },
});
