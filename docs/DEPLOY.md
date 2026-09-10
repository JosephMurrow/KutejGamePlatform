# Выкладка

Приложение — один процесс: Next и Socket.IO слушают общий порт. Значит,
подойдёт любой хостинг, где можно держать долгоживущий Node-процесс и вебсокет:
Railway, Render, Fly, обычный VPS. **Vercel не подойдёт** — там нет постоянного
процесса под сокеты.

## Что нужно на стороне хостинга

| Переменная       | Значение                                                   |
| ---------------- | ---------------------------------------------------------- |
| `DATABASE_URL`   | строка подключения к PostgreSQL                            |
| `SESSION_SECRET` | случайная строка от 32 символов, `openssl rand -base64 48` |
| `HOST`           | `0.0.0.0`                                                  |
| `PORT`           | порт, который даёт хостинг                                 |

Секрет сессий менять нельзя без нужды: смена разлогинивает всех сразу.

## Раскатка новой версии: по шагам

Боевая машина — LXC `platitutka`. Всё лежит в `/opt/platitutka`: там же
`docker-compose.prod.yml`, `.env` с секретами и клон этого репозитория.
Контейнеров три: `app`, `postgres`, `caddy`.

Ниже — порядок, которым выкладывали 2.0 с шахматами. Команды даны целиком, с
путями: их можно выполнять как есть.

### 0. Проверки у себя

```bash
npm run lint && npm run typecheck && npm test && npm run format:check && npm run build
```

Тот же набор, что гоняет CI. Дальше идти только с зелёными.

### 1. Осмотр машины

Первым делом — откуда едем. Пропущенные версии копятся молча, и «довезти одну
игру» легко оборачивается пятнадцатью миграциями разом.

```bash
git -C /opt/platitutka log --oneline -1 && git -C /opt/platitutka status -sb
```

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select migration_name from _prisma_migrations order by finished_at desc limit 5;"'
```

```bash
df -h / && docker system df
```

Распухший сборочный кеш снести: сборке Next нужно место.

```bash
docker builder prune -af
```

### 2. Бэкап и счётчики «до»

Дамп снимается внутрь контейнера и выносится наружу — так он переживёт
пересоздание контейнера.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom -f /tmp/before.dump && ls -lh /tmp/before.dump'
```

```bash
docker cp platitutka-postgres-1:/tmp/before.dump /root/platitutka-$(date +%F).dump
```

Счётчики снять до миграций — после будет с чем сверять.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
select 'users' as t, count(*) from platform.users
union all select 'questions', count(*) from pricetitute.questions
union all select 'rounds', count(*) from pricetitute.rounds
union all select 'round_bets', count(*) from pricetitute.round_bets
union all select 'scores', count(*) from pricetitute.scores;
SQL
```

Схемы `platform` и `pricetitute` появились в 2.0; до неё всё лежало в `public`.

### 3. Исходники и образ

```bash
git -C /opt/platitutka pull --ff-only
```

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml build app
```

Сборка работающего приложения **не касается**: старый контейнер обслуживает
людей, пока рядом собирается новый образ. Простоя здесь ещё нет, и это хорошее
место, чтобы упереться в ошибку без последствий.

### 4. Репетиция на копии базы

Нужна, когда среди новых миграций есть трогающие живые данные: переезд таблиц,
перелив колонок, удаление столбцов. Стоит десять минут и ловит ошибку до того,
как она стоит данных.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" platitutka_copy && pg_restore -U "$POSTGRES_USER" -d platitutka_copy /tmp/before.dump && echo "копия поднята"'
```

Имя базы подменяется внутри контейнера, из его же `DATABASE_URL`: пароль тогда
не попадает ни в командную строку, ни в историю оболочки.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml run --rm app sh -c 'base=${DATABASE_URL%%\?*}; export DATABASE_URL="${base%/*}/platitutka_copy?schema=public"; echo "мигрируем: ${DATABASE_URL##*@}"; npx prisma migrate deploy'
```

Дальше — та же сверка счётчиков, что в шаге 2, только с `-d platitutka_copy`.
Числа обязаны совпасть до строки. Заодно стоит проверить межсхемный ключ:

```sql
select count(*) from pricetitute.scores s
  join platform.users u on u.id = s."userId";
```

### 5. Боевой прогон

Здесь начинается простой: идущие раунды и партии оборвутся, состояние комнат
живёт в памяти процесса. Выкладываться лучше в затишье.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml stop app
```

Гасить приложение **до** миграций обязательно, если среди них есть переезд
схем: старый код ходит в `public` и после переезда таблиц просто их не найдёт.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml run --rm app npx prisma migrate deploy
```

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml run --rm app npm run db:rename-questions
```

До сида скрипт честно предупреждает, что строк меньше, чем в пуле, — это не
поломка, недостающее дольёт сид. Тревожно обратное: строк больше, чем в пуле.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml run --rm app npx prisma db seed
```

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
select 'вопросы' as t, count(*) from pricetitute.questions
union all select 'дебютная книга', count(*) from chess.openings;
SQL
```

Вопросов должно быть ровно столько, сколько в пуле; сколько именно — скажет
`npm run audit:questions`. Вдвое больше — сид отработал раньше переименования.

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml up -d
```

### 6. Проверки после выкладки

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml ps && docker compose -f /opt/platitutka/docker-compose.prod.yml logs --tail=30 app
```

```bash
curl -s -o /dev/null -w 'локально: код %{http_code}\n' http://127.0.0.1:3000/games
```

Дальше — снаружи по `APP_URL` и смоуки, см. «После выкладки проверить».

### 7. Уборка

```bash
docker compose -f /opt/platitutka/docker-compose.prod.yml exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" platitutka_copy'
```

```bash
docker image prune -f
```

### Грабли этой машины

Каждая стоила времени на выкладке 2.0.

- **`.env` не читается шеллом.** `. /opt/platitutka/.env` падает на
  `MAIL_FROM=Кутёж <ящик@…>`: незакавыченное значение с `<` для shell —
  перенаправление. Docker compose такие файлы читает по-своему. Отсюда приём из
  шага 4: подменять имя базы внутри контейнера, а не собирать строку
  подключения на хосте.
- **У контейнеров нет IPv6, а домашний DNS раздаёт AAAA-записи.** Node ходит по
  ним первым и виснет на рукопожатии: `npm ci` падал с ETIMEDOUT на ровном
  месте, хотя тот же файл с хоста качался за четверть секунды. В образе поэтому
  стоит `NODE_OPTIONS=--dns-result-order=ipv4first` во всех трёх слоях.
- **Стокфиша нет в стабильных репозиториях Alpine** — ставится из
  `edge/testing`, репозиторий указан прямо в `apk add`.
- **`psql` звать через `sh -c`**, подставляя `$POSTGRES_USER` и `$POSTGRES_DB`
  уже внутри контейнера: снаружи их взять неоткуда, `.env` не читается.
- **Исходники раньше возили бандлом.** `git pull` на машине отвечал «Already up
  to date», потому что `origin` смотрел в файл, а не в GitHub. Теперь там
  обычный клон, репозиторий публичный, ключей машине не нужно.

## Первая установка

Готовый стек — `docker-compose.prod.yml`: база, приложение и Caddy как
обратный прокси. Настройки берутся из `.env` рядом с ним, образец —
`.env.prod.example`.

Исходники на машине — обычный клон этого репозитория, и обновляются они
`git pull` перед сборкой. Репозиторий публичный, так что ключей серверу не
нужно.

```bash
cp .env.prod.example .env   # и заполнить пароли, секрет и токен
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec app npm run db:rename-questions
docker compose -f docker-compose.prod.yml exec app npx prisma db seed
```

**Порядок важен, и вот почему.** Текст вопроса уникален и служит ключом при
заливке. Если вопросы переписывали, сначала надо обновить уже сохранённые
строки (`db:rename-questions`), и только потом запускать сид. Наоборот — сид
не узнает переписанные вопросы, добавит их как новые, и пул удвоится.

Скрипт безопасно запускать всегда: когда переименовывать нечего, он ничего не
делает.

**После сида обязательно сверить количество.** Это ловит ошибку сразу, а не
через неделю:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U platitutka -d platitutka -c "select count(*) from pricetitute.questions;"
```

Число должно совпадать с размером пула из
`src/games/pricetitute/seed/questions`. Если оно
вдвое больше — сид отработал раньше переименования; чинится удалением строк,
на которые не ссылается ни один раунд, и последующим переименованием
оригиналов.

**После правки вопросов в базе перезапустите приложение.** Очереди вопросов
живут в памяти процесса и держат идентификаторы; после удаления строк они
могут указывать в пустоту, и комната зависнет на «вопрос видит только
ведущий».

```bash
docker compose -f docker-compose.prod.yml restart app
```

Миграции идут **отдельной командой после запуска**, а не на старте процесса:
если инстансов больше одного, они подерутся за одну и ту же миграцию.

Сид безопасен при повторном запуске: `createMany` со `skipDuplicates` не
плодит копии и добавляет только новые вопросы. Сид платформы идёт по реестру
игр и зовёт сид каждой — каждая сеет в свою схему.

### Разовое: переезд таблиц по схемам

Миграция `20260908120000_schemas_per_game` раскладывает таблицы по схемам:
`platform` — аккаунты, ссылки и комнаты, `pricetitute` — вопросы, раунды,
ставки и очки. Журнал миграций остаётся в `public`.

**Это единственная миграция версии 2.0, которая трогает живые данные
необратимо.** `ALTER TABLE … SET SCHEMA` переносит таблицы вместе с данными,
индексами и ключами — ничего не переливается, — но откатить это «само» нельзя.
Порядок такой:

```bash
# 1. Бэкап до всего остального.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U platitutka -d platitutka --format=custom > before-schemas.dump

# 2. Прогон на копии: восстанавливаем дамп в отдельную базу и мигрируем её.
docker compose -f docker-compose.prod.yml exec -T postgres \
  createdb -U platitutka platitutka_copy
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U platitutka -d platitutka_copy < before-schemas.dump
DATABASE_URL=…/platitutka_copy npx prisma migrate deploy

# 3. Только после этого — на боевой.
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

**Что проверить после переезда:**

```sql
\dt platform.*      -- users, one_time_links, private_rooms
\dt pricetitute.*   -- questions, rounds, round_bets, scores, room_question_queues
\dt public.*        -- только _prisma_migrations
```

И что межсхемные ключи живы — очки по-прежнему ссылаются на пользователя:

```sql
select count(*) from pricetitute.scores s
  join platform.users u on u.id = s."userId";
```

**Приложение выкладывается вместе с этой миграцией, а не после.** Старый код
ходит в `public` и после переезда перестанет находить таблицы.

### Почта

Своего почтового сервера у игры нет и не будет: письма, отправленные напрямую
с домашнего адреса, режут на входе или кладут в спам. Нужен внешний релей —
подойдёт любой, у которого есть SMTP.

| Переменная      | Что это                                            |
| --------------- | -------------------------------------------------- |
| `MAIL_HOST`     | хост релея. Пустой — отправка выключена            |
| `MAIL_PORT`     | 465 для TLS с первого байта, иначе 587 со STARTTLS |
| `MAIL_USER`     | учётка релея                                       |
| `MAIL_PASSWORD` | пароль или ключ                                    |
| `MAIL_FROM`     | обратный адрес: `Кутёж <no-reply@домен>`           |

**Пустой `MAIL_HOST` — это рабочее состояние, а не поломка.** Письма тогда не
уходят, в лог пишется предупреждение, а всё, что от почты зависит, честно
сообщает человеку, что отправить не получилось. Так можно выложиться до того,
как релей заведён.

Проверять надо доставкой, а не чтением кода:

```bash
docker compose -f docker-compose.prod.yml exec app npm run mail:check -- твой@адрес.рф
```

Письмо должно прийти в настоящий ящик. Если не пришло — смотреть логи `app`.

**Для разработки** релей не нужен: в `docker-compose.yml` есть песочница
Mailpit. Письма никуда не уходят и видны на `http://localhost:8025`.

```bash
docker compose up -d mail
npm run mail:check -- кто-нибудь@пример.рф
```

### Сертификат без порта 80

Caddy собран с провайдером DuckDNS и выпускает сертификат **по DNS-записи**, а
не по обращению на порт 80. Это нужно, когда 80 и 443 снаружи заняты другим
сервисом и наружу проброшен нестандартный порт: обычная проверка Let's Encrypt
в таких условиях не проходит, а DNS-проверке порты не нужны вовсе.

Том `caddy-data` обязателен: в нём лежат выпущенные сертификаты. Без него
каждое пересоздание контейнера заказывает их заново, и Let's Encrypt довольно
быстро упирается в недельный лимит на имя.

### Движок шахмат

Ставится пакетом в образ и живёт **отдельным процессом**: в наш бандл он не
попадает, и его лицензия на наш код не распространяется. Путь задан в образе
переменной `CHESS_ENGINE_PATH=/usr/bin/stockfish`.

В стабильных репозиториях Alpine стокфиша нет — пакет лежит в `edge/testing`, и
репозиторий указан прямо в `apk add`. Зависимости у него те же, что уже есть в
базовом образе, так что ставится ровно один пакет и ничего чужого за собой не
тянет. Это единственное место, где образ смотрит в нестабильную репу: пропадёт
пакет — придётся собирать движок из исходников.

Пустая переменная — это не поломка, а «ботов нет»: комната с ботом тогда ждёт
живого соперника, всё остальное работает как обычно. Так же и на машине
разработчика: поставил движок, прописал путь — боты появились.

Движок ест процессор. На все партии сразу отведён пул из двух процессов с
очередью и жёстким таймаутом: десяток партий с ботами не должен положить сокеты
всем остальным (src/games/chess/docs/BACKLOG.md D1).

## Ограничение: один процесс

Игровое состояние комнат живёт **в памяти процесса**. Значит:

- **горизонтально масштабировать нельзя** — два инстанса будут вести две
  независимые общие комнаты, а игроки попадут в разные;
- перезапуск сервера обрывает идущие раунды. Очередь вопросов и счёт
  переживают перезапуск, текущий раунд — нет;
- выкладывать лучше в момент затишья.

Когда упрётся в один процесс, потребуется вынести состояние комнат наружу
(Redis) и настроить липкие сессии — это отдельная работа, в текущем коде её нет.

## Бэкап базы

Всё ценное лежит в PostgreSQL: игроки, вопросы, раунды, очки.

```bash
pg_dump "$DATABASE_URL" --format=custom --file=platitutka-$(date +%F).dump
pg_restore --clean --if-exists --dbname="$DATABASE_URL" platitutka-2026-08-14.dump
```

Расписание зависит от хостинга: у Railway и Render есть свои автоснимки,
на VPS достаточно ежедневного `pg_dump` по cron с хранением недели.

## После выкладки проверить

```bash
CROWD_URL=https://твой-домен npm run smoke:crowd -- 6 2
```

Скрипт поднимает живых клиентов, играет раунды и проверяет круг ходов. Ему
нужен доступ к той же базе, что и у сервера, — он заводит тестовых игроков и
убирает их за собой.

**После переезда адресов** (версия 2.0, этап 3) проверить ещё три вещи —
руками, потому что смоук их не трогает:

```bash
# 1. Старые адреса ведут на новые: ожидаем 307 и новый Location.
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://твой-домен/play

# 2. Разосланная ссылка в комнату открывается тем же адресом.
curl -s -o /dev/null -w '%{http_code}\n' https://твой-домен/r/КОД

# 3. Источник OBS ходит без куки — только по ключу экрана.
curl -s -o /dev/null -w '%{http_code}\n' 'https://твой-домен/r/КОД/tv?key=КЛЮЧ'
```

И отдельно: **вкладка, открытая до выкладки, должна доиграть партию.** Её
сокет подключается без параметра игры — сервер понимает это как платитутку.
Проверяется тем, что открытая вкладка не отваливается после перезапуска
сервера.
