# polkafox

Опубликованное веб-приложение «Полка» (гардероб обуви):

- GitHub Pages: https://hollyfox2026-lab.github.io/polkafox/
- Резервная копия: https://polkafox.netlify.app/

Статические файлы сайта находятся в каталоге `docs/` и публикуются из ветки `gh-pages`.

Polkafox is a small fox-sightings web application. It pairs a JSON API built on
the [Polka](https://github.com/lukeed/polka) web framework with a lightweight
static frontend served from the same process. State is held in memory, so the
app runs end to end without an external database.

## Requirements

- Node.js >= 22 (see `engines` in `package.json`)
- npm (bundled with Node)

## Setup

```bash
npm install
```

## Development

Start the dev server with automatic reload:

```bash
npm run dev
```

The app is served at http://localhost:3000. Set `PORT` or `HOST` to override the
defaults.

## Scripts

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Run the server with live reload (`tsx watch`). |
| `npm run build`     | Type-check and compile TypeScript to `dist/`.  |
| `npm start`         | Run the compiled server from `dist/`.          |
| `npm test`          | Run the Vitest suite.                          |
| `npm run typecheck` | Type-check without emitting output.            |
| `npm run lint`      | Lint sources with ESLint.                      |

## API

| Method | Path             | Description                          |
| ------ | ---------------- | ------------------------------------ |
| GET    | `/api/health`    | Liveness probe.                      |
| GET    | `/api/foxes`     | List sightings, newest first.        |
| GET    | `/api/foxes/:id` | Fetch a single sighting.             |
| POST   | `/api/foxes`     | Create a sighting (JSON body).       |

Create payload:

```json
{ "name": "Ember", "location": "Ridge Trail", "note": "Sunbathing." }
```

`name` and `location` are required; `note` is optional.

## Project layout

```
src/        API + server (TypeScript)
public/     Static frontend (HTML/CSS/JS)
test/       Vitest integration tests
```
