# SRVD — Bartender OS

SRVD is a professional operating system for individual bartenders. The current closed-beta build combines shift/earnings tracking, a personal recipe vault, bartender calculators, account controls, and **SRVD Connect** — a private guest-relationship system for regulars, visits, lists, consent, and small consent-gated email campaigns.

## Current beta scope

### Core SRVD

- Registration, email verification, login/logout, password reset, session revocation
- Shift logging, editing, deletion, tip totals, stats, weekly goals
- Recipe Vault: create, edit, search, read, delete
- Tools: batch scaling, ABV/proof, unit conversion
- Settings, personal-data export, account deletion
- Alpha invitation and feedback infrastructure

### SRVD Connect

- Bartender-owned venue records
- Guest profiles with Favorite / Regular / VIP status
- Guest search
- Visit logging and visit history
- Manual lists
- Smart lists: Favorites, Regulars, recent visitors
- Explicit email consent records
- Suppression / unsubscribe enforcement
- Recipient eligibility preview
- List-based email campaign selection
- Per-guest personalization using `{{first_name}}` and `{{display_name}}`
- One-click unsubscribe links using opaque single-use tokens stored hashed at rest
- Email campaign kill switch
- Beta send limits: maximum 25 selected guests per campaign and 3 sent/sending campaigns per bartender per rolling 24 hours
- Connect data included in personal-data export

**SMS is not implemented and must not be represented as available.**

## Architecture

- Node.js 22+
- TypeScript strict mode
- Native `node:http`
- Native `node:sqlite`
- Native `node:test`
- Vanilla HTML/CSS/JavaScript frontend
- No external runtime npm dependencies
- Docker packaging for vendor-neutral deployment
- GitHub Actions CI

The runtime database is currently **SQLite**. PostgreSQL schema translations exist under `db/postgres-migrations/`, but the application data-access layer is synchronous and SQLite-backed. PostgreSQL is not a working runtime target yet.

## Local setup

```bash
git clone https://github.com/playerbrycegit/SRVD.git
cd SRVD
npm ci
cp .env.example .env
npm run build
npm run migrate
```

Run API and frontend separately for development:

```bash
npm run server
npm run web
```

Then open `http://localhost:4002`.

Optional demo seed:

```bash
npm run seed
```

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
docker build -t srvd .
```

GitHub Actions runs install, production-dependency audit, strict type checking, lint, the full automated test suite, and Docker build on pushes and pull requests.

## Closed-beta deployment model

Until PostgreSQL is implemented, deploy SRVD as:

- **one application instance only**
- **one persistent disk/volume** mounted for the SQLite database
- `DATABASE_URL=file:/data/srvd.sqlite` or the equivalent absolute persistent path
- automated backups of that persistent database file
- no horizontal scaling

The Docker image runs the combined API + static frontend on a single port:

```bash
docker build -t srvd .
docker run --rm -p 4001:4001 \
  -e NODE_ENV=production \
  -e PORT=4001 \
  -e APP_URL=http://localhost:4001 \
  -e DATABASE_URL=file:/data/srvd.sqlite \
  -e SESSION_SECRET=replace-me \
  -e EMAIL_PROVIDER_API_KEY=replace-me \
  -e EMAIL_SENDER_ADDRESS=noreply@example.com \
  -e CONNECT_EMAIL_SEND_ENABLED=false \
  -v srvd-data:/data \
  srvd
```

`GET /health` should return an OK response after startup.

## Production environment variables

See `.env.example` for the complete reference. Important variables:

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Use `production` for deployed beta |
| `PORT` | HTTP port supplied by the host or `4001` |
| `APP_URL` | Public application origin used in email links |
| `DATABASE_URL` | For current beta, persistent SQLite file path |
| `SESSION_SECRET` | Required production secret |
| `EMAIL_PROVIDER_API_KEY` | Transactional-email provider key |
| `EMAIL_SENDER_ADDRESS` | Verified sender address |
| `CONNECT_EMAIL_SEND_ENABLED` | Connect email kill switch; safe default is `false` |

Production startup refuses to run without the required core variables. Development verification/reset token exposure is structurally disabled in production.

## Connect email safety

The email send endpoint is unavailable unless:

```bash
CONNECT_EMAIL_SEND_ENABLED=true
```

Keep it `false` until all of the following are manually verified in the deployment environment:

1. sender domain/address is verified with the email provider;
2. account verification and password-reset email delivery works;
3. a controlled Connect email is delivered to a test recipient;
4. its unsubscribe link works end-to-end on the public domain;
5. the unsubscribed guest is subsequently excluded by recipient preview;
6. support/complaint monitoring is active.

Even when enabled, the server rechecks consent and suppression at send time. A user cannot bypass a suppression by granting consent again through the current beta flow. Recipients receive separate emails; addresses are never exposed as a group message.

## Data ownership and privacy

Every bartender-owned record is scoped by `user_id`. Cross-user access is denied by service queries and covered by negative tests.

Connect stores personal guest information. Beta operators should collect only information genuinely useful for hospitality and must not import cold-contact lists or treat a bartender-entered contact detail as permission to message. Consent must be explicitly recorded before the guest becomes eligible.

Personal-data export includes the bartender's Connect guest/visit/list/consent/message records. Account deletion cascades through the bartender-owned Connect records using foreign-key deletion rules.

## PostgreSQL status

`db/postgres-migrations/` contains PostgreSQL translations, including Connect schema migrations. They are **not** proof that PostgreSQL is production-ready.

A real PostgreSQL migration still requires:

1. installing and selecting a PostgreSQL driver;
2. converting the shared `Database` abstraction from synchronous to asynchronous operations;
3. updating module and HTTP call sites to await database work;
4. executing all migrations against a real disposable PostgreSQL database;
5. running the complete integration/ownership/regression suite against PostgreSQL;
6. validating production migrations and rollback/recovery procedures.

See `src/shared-kernel/data-access.postgres.reference.ts` for the existing migration analysis.

## Known beta limitations

- PostgreSQL runtime is not implemented.
- SQLite beta deployment requires persistent storage and a single process/instance.
- Rate limiting is in-memory and therefore single-instance.
- SMS messaging is not implemented.
- Connect email scheduling and recipient-timezone quiet-hour delivery are not implemented; beta campaigns are immediate only.
- Guest self-follow/QR signup is not implemented yet.
- Live email delivery still requires manual provider/domain verification in a real deployed environment.
- Browser/device accessibility and responsive QA still require manual real-browser testing.
- The existing recipe editor UI has known limitations around multi-ingredient editing even though backend recipe replacement supports multiple ingredients.

## CI status

GitHub Actions is active on the repository. The Connect feature branch has successfully completed dependency installation, strict TypeScript, ESLint, automated tests, and Docker build. Check the current pull request checks for the latest head before merging; do not rely on a historical count in this README.

## Deployment rule

Do not claim SRVD is publicly production-ready merely because CI is green. Closed-beta launch still requires a real host, persistent database storage, backup verification, live email verification, public unsubscribe testing, and manual browser/mobile QA.
