import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Brand } from "@/components/Brand";
import { getCurrentUser } from "@/lib/auth/session";

const STEPS = [
  {
    title: "Ведущий читает вопрос",
    text: "Вопрос видит только он. За сколько ты бы неделю ходил в мокрых носках? У него двадцать секунд, чтобы нажать «Прочитал», и ещё пятнадцать — назвать свою сумму.",
  },
  {
    title: "Остальные угадывают",
    text: "Вопрос открывается всем. Каждый пишет, за сколько, по его мнению, ведущий на это согласился бы. Ставка одна, переиграть нельзя.",
  },
  {
    title: "Вскрытие",
    text: "Ответ ведущего и все ставки открываются разом. Очко забирает тот, кто промахнулся меньше всех, но только если мимо не больше чем вдвое. Считается не разница в рублях, а во сколько раз мимо.",
  },
  {
    title: "Ход идёт дальше",
    text: "Ведущим становится следующий по кругу, и всё повторяется. В общей комнате очки идут в рейтинг, в своей — остаются внутри компании.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
      <section className="flex flex-col items-center gap-5 text-center">
        <Brand className="text-5xl sm:text-6xl" />

        <p className="max-w-lg text-balance text-lg text-muted">
          Угадай, за какую сумму человек согласился бы это сделать. Кто ближе
          всех к правде — забирает очко.
        </p>

        {user ? (
          <div className="mt-2 flex flex-col items-center gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/play"
                className="rounded-xl bg-crimson px-8 py-3 text-lg font-semibold text-paper transition hover:bg-deep"
              >
                В общую комнату
              </Link>
              <Link
                href="/rooms/new"
                className="rounded-xl border border-line bg-paper px-8 py-3 text-lg font-semibold transition hover:border-crimson hover:text-crimson"
              >
                Своя комната
              </Link>
            </div>

            <Link
              href="/join"
              className="text-sm text-muted underline-offset-4 transition hover:text-crimson hover:underline"
            >
              Зайти по коду
            </Link>

            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-2.5 transition hover:border-crimson"
            >
              <Avatar id={user.avatarId} size={36} />
              <span className="text-left">
                <span className="block text-sm font-semibold">
                  {user.nickname}
                </span>
                <span className="block text-xs text-muted">Профиль</span>
              </span>
            </Link>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="rounded-xl bg-crimson px-8 py-3 text-lg font-semibold text-paper transition hover:bg-deep"
            >
              Начать играть
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-line bg-paper px-8 py-3 text-lg font-semibold transition hover:border-crimson hover:text-crimson"
            >
              Войти
            </Link>
          </div>
        )}

        {/* Код с телевизора или из трансляции: ссылку оттуда не кликнешь. */}
        {!user && (
          <Link
            href="/join"
            className="text-sm text-muted underline-offset-4 transition hover:text-crimson hover:underline"
          >
            Позвали в комнату? Зайти по коду
          </Link>
        )}
      </section>

      <section className="mt-14">
        <h2 className="mb-5 text-center text-xl font-bold">Как это устроено</h2>

        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-line bg-paper p-5"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-crimson text-xs font-bold text-paper">
                  {index + 1}
                </span>
                <h3 className="font-semibold">{step.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-2xl border border-crimson/30 bg-tint p-5">
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-deep">
          <span className="rounded-md bg-crimson px-1.5 py-0.5 text-xs font-bold text-paper">
            18+
          </span>
          Игра для взрослых
        </h2>
        <p className="text-sm leading-relaxed text-deep/80">
          Вопросы провокационные и местами откровенные: от «неделю в мокрых
          носках» до вещей, которые вслух обсуждают не с каждым. Регистрируясь,
          ты подтверждаешь, что тебе есть восемнадцать. В своей комнате хозяин
          может отключить откровенные вопросы — останутся только безобидные.
        </p>
      </section>

      <footer className="mt-10 text-center text-xs text-muted">
        Отвечать честно необязательно, но так интереснее.
      </footer>
    </main>
  );
}
