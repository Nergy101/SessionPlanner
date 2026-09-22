# SessionPlanner

A small private tool for whoever organises the company's internal knowledge
sessions. It tracks two things:

- **Subjects** - topics somebody could present, with a description, links and
  one or more speakers.
- **Sessions** - the dates, and which subjects are planned for each.

It is built for a single organiser. There are no accounts, no roles and no
"submit an idea" flow: colleagues appear in it as names on a topic, not as
users. After a session the subject keeps its slides, recording and notes, so the
backlog doubles as a record of what the team has already shared.

## Running it

```sh
cp .env.example .env      # then edit APP_PASSWORD
deno task dbup            # create/upgrade the database
deno task dev             # http://localhost:5173
```

The app refuses to start if `APP_PASSWORD` is unset, rather than quietly serving
an open app onto the network.

It starts **empty**. There is no seed task pointed at the real database on
purpose - a planning tool full of invented topics is worse than an empty one.
For a populated copy to look at, `deno task demo` seeds a throwaway database in
a temp directory and serves that; it refuses to touch `data/session-planner.db`.

### Production-ish

```sh
deno task build
APP_PASSWORD=... deno task start   # migrates, then serves on $PORT (default 8000)
```

## The status ladder

```
idea  ->  assigned  ->  planned  ->  presented  ->  archived
```

The first three follow from two facts, so you never maintain the status by hand:

| Status      | Means                                                                                   |
| ----------- | --------------------------------------------------------------------------------------- |
| `idea`      | A topic with nobody on it yet. **Needs a speaker.**                                     |
| `assigned`  | Someone has agreed to present it, but it has no date. **This is the schedulable pool.** |
| `planned`   | Sits on a session date.                                                                 |
| `presented` | It happened.                                                                            |
| `archived`  | Off the list.                                                                           |

Adding the first speaker moves `idea -> assigned`; removing the last one moves
it back. Putting it on a session makes it `planned`; taking it off drops it to
`assigned` or `idea` depending on whether a speaker remains.

`presented` and `archived` are sticky - once set, only an explicit change moves
them, so tidying up never rewrites history. Archived subjects are hidden from
the dashboard and the default subject list, and stay reachable by filtering for
them.

The dashboard is built around that split: _ready to schedule_ (find a date) and
_needs a speaker_ (find a person).

## Gamification

There is one public page, `/standings`, deliberately outside the login:
gamification needs an audience, and the rest of this app is a private
organiser's tool. It is read-only — nothing on it can change anything.

**Nothing is stored as a score.** XP, the leaderboard, seasons, the trophy,
radar coverage and the roulette pool are all recomputed from subjects, sessions
and people on every request. A stored total is a second source of truth: rename
a person, delete a subject, un-present a talk, and the number quietly stops
matching what it claims to measure.

### XP

| Event                      | XP                 |
| -------------------------- | ------------------ |
| The idea exists at all     | 1                  |
| Someone claims it          | 3                  |
| It gets a date             | 5                  |
| They present it            | 10                 |
| Slides **and** a recording | +5                 |
| Bounty                     | whatever was on it |

Co-speakers each get the full value — it's credit, not a pie to divide.

### The six mechanics

**Rolling leaderboard** — the last 12 months, not all time. An all-time board
gets locked up by whoever started early and stops motivating everyone else
within a year.

**Bounties** — put XP on an unclaimed subject from its detail page to tempt
someone into taking it. It pays out only on delivery, and it drops off the
public board the moment somebody claims it. Aimed squarely at the "needs a
speaker" column, which is the real bottleneck.

**Roulette** — spins over everyone who hasn't presented in six months,
never-presented first. The pick is uniform over that pool rather than weighted
by how overdue someone is: a wheel that always lands on the same person stops
being a game and becomes an accusation.

**Coverage radar** — twelve fixed tech areas, tagged per subject on its detail
page. Fixed rather than free-form, because the point is to show _gaps_, and you
cannot have a gap in a set that grows to fit whatever people typed. Only
delivered talks count as coverage — a tag on an unstarted idea is an intention.

**Season progress** — the status ladder already is a progression, so the whole
company gets one XP bar per calendar quarter.

**The trophy** — whoever topped the previous completed quarter. Pair it with a
physical object that moves desk to desk; the page just says who has it.

## Keyboard

Because this is SSR with real `<form>` elements, autofocus and Enter-to-submit
are **native browser behaviour** rather than something scripted.

| Where                    | Key            | What happens                                                   |
| ------------------------ | -------------- | -------------------------------------------------------------- |
| Dashboard                | _(on load)_    | The capture box is focused - type and go.                      |
| Dashboard, a session     | `Enter`        | Creates the subject from the quick-add box.                    |
| Subjects                 | _(on load)_    | The search box is focused, since browsing is why you're there. |
| Subject detail           | _(on arrival)_ | The description is focused - the title is already filled in.   |
| Subject / session detail | `Enter`        | In any single-line field, saves.                               |
| Tables                   | `Enter`        | Commits the inline edit; `Escape` reverts it.                  |
| Speaker picker           | `Enter`        | Adds the highlighted person, or creates the name you typed.    |
| Speaker picker           | `up` / `down`  | Moves through suggestions.                                     |
| Speaker picker           | `Backspace`    | On an empty box, removes the last speaker.                     |
| Speaker picker           | `Escape`       | Closes the suggestions.                                        |

Buttons that need input are disabled until there is some.

## Stack

[Deno](https://deno.com) + [Fresh 2](https://fresh.deno.dev) (SSR with islands),
[Kysely](https://kysely.dev) over SQLite, and Tailwind 4.

### Data layer

SQLite via **`node:sqlite`**, the module built into Deno - no native addon, no
FFI permission, no third-party driver. Kysely publishes dialects for
better-sqlite3, bun:sqlite and libsql but not for the built-in module, so the
adapter is written here in `db/node-sqlite-dialect.ts` (about 90 lines). It sets
`journal_mode=WAL`, `foreign_keys=ON` and a busy timeout on every connection.

Kysely is a typed query builder rather than a full ORM: no lazy relations, no
identity map. At this size that costs nothing, and it buys a migration runner
with real `up()` **and** `down()` - which Drizzle's generator does not produce.

### Migrations

Each file in `db/migrations/` exports `up()` and `down()`:

```sh
deno task dbstatus   # what is applied and what is pending
deno task dbup       # apply everything pending
deno task dbdown     # roll the most recent one back
deno task dbredo     # down then up, handy while writing one
```

Kysely keeps its own `kysely_migration` bookkeeping table and runs each
migration in a transaction, so a failure halfway leaves nothing half-built.

Migrations are listed explicitly in `db/migrations/index.ts` rather than
discovered from disk. Kysely's `FileMigrationProvider` resolves each file with a
bare dynamic import, which under Deno resolves against the provider's own jsr.io
URL and cannot load local files. A static list is better here anyway: it
survives `deno compile`, needs no source tree at runtime, and makes a missing
migration a type error.

### Styling

Hand-written Tailwind, themed after **sprintendo**: dashed hairline borders
instead of solid ones, monospace for every heading, label, badge and input,
near-zero corner radii, a flat slate palette with a single Microsoft-blue
accent, and small uppercase status badges. The design tokens live in the
`@theme` block at the top of `assets/styles.css` and the component vocabulary
(`ui-input`, `ui-card`, `ui-badge`, ...) just below it, so retheming is one
file.

Light and dark both ship; the toggle is in the header and the choice is applied
before first paint, so there is no flash of the wrong theme. No webfonts are
loaded - Segoe UI with a system fallback, and the system monospace.

### Islands

Most of the app is plain SSR. Islands exist only where the browser genuinely
needs to do something: `QuickAdd` (disable until you type), `PeoplePicker`
(typeahead), `LinkEditor` (add/remove rows), `InlineText` and `AutoSubmitSelect`
(commit on Enter/change), and `ThemeToggle`. Every one of them wraps a real form
that still posts without JavaScript.

## Auth

One shared password from `APP_PASSWORD`, compared in constant time. The cookie
holds an HMAC of the password rather than the password itself, so a stolen
cookie cannot be read back into the secret and rotating the password invalidates
every existing session.

- **Serve it over HTTPS if it leaves your network.** The `Secure` flag is set
  only when the app is reached over https, and there is no forced redirect - it
  expects to sit behind a reverse proxy that terminates TLS.
- No user table, no registration, no reset flow. Rotating the password is
  editing `.env` and restarting.

## Data and backups

Everything is one SQLite file, `data/session-planner.db` (override with
`DB_PATH`). The signed-in **data** page also provides a portable JSON export and
import. An import replaces all current application data in one transaction, so
export the current instance first if you may need to undo it.

For a direct filesystem backup, copying the SQLite file is still possible when
the app is stopped:

```sh
cp data/session-planner.db backup-$(date +%F).db
```

Migrations run at startup under `deno task start`, so an existing database is
upgraded in place and a fresh one initialises itself.

## Tests

```sh
deno task test
```

49 tests: the status ladder as a pure function, plus integration tests against a
real migrated SQLite file - case-insensitive person resolution, person merging,
that deleting a session unschedules its subjects rather than deleting them, that
archived subjects stay out of the default list, and that foreign keys are
actually enforced.

`tests/fixtures.ts` holds the demo data, used by `deno task demo` and available
to tests.

## Layout

```
db/
  node-sqlite-dialect.ts   Kysely dialect for Deno's built-in SQLite
  schema.ts                table types + the status ladder's constants
  migrations/              up()/down() files, listed in index.ts
  migrate.ts               the dbup/dbdown/dbredo/dbstatus runner
services/                  subjects (owns the ladder), sessions, people
  scoring.ts               XP, leaderboard, seasons, radar, roulette — all derived
routes/                    SSR pages and their POST handlers
  standings.tsx            the public scoreboard (no login)
islands/                   the few interactive pieces
components/                presentational, server-rendered
assets/styles.css          design tokens + component vocabulary
tests/
```
