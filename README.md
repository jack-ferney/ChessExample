# Feathers Chess (REST)

A modern chess web app built with Feathers v5 and a REST API.

## What it includes

- Feathers service at `/games`
- Persistent game storage in `data/games.json` (survives server restarts)
- REST methods:
  - `POST /games` create a game
  - `GET /games` list games
  - `GET /games?summary=true` list lightweight game summaries for browsing
  - `GET /games/:id` get one game
  - `PATCH /games/:id` apply a move, undo, reset, or difficulty change
- Static web UI in `public/` that calls the REST API
- Legal move validation via `chess.js`
- Computer opponent with 3 difficulties (`easy`, `medium`, `hard`)
- Drag-and-drop piece movement (with click-based fallback)
- Click a piece to preview legal destination squares, then click a target square to move
- Computer moves are delayed by ~1 second and animated
- Undo support and older-game review from the UI

## Run

```bash
npm install
npm start
```

Open: `http://localhost:3030`

Optional storage file override:

```bash
set GAMES_DATA_PATH=C:\path\to\games.json
```

## REST examples

Create a game:

```bash
curl -X POST http://localhost:3030/games ^
  -H "Content-Type: application/json" ^
  -d "{\"mode\":\"computer\",\"difficulty\":\"medium\",\"playerColor\":\"w\"}"
```

Get game list:

```bash
curl http://localhost:3030/games
```

Play a move:

```bash
curl -X PATCH http://localhost:3030/games/1 ^
  -H "Content-Type: application/json" ^
  -d "{\"move\":{\"from\":\"e2\",\"to\":\"e4\"}}"
```

Play a human move but defer computer response (used by UI for delayed AI):

```bash
curl -X PATCH http://localhost:3030/games/1 ^
  -H "Content-Type: application/json" ^
  -d "{\"move\":{\"from\":\"e2\",\"to\":\"e4\"},\"deferComputer\":true}"
```

Trigger computer move:

```bash
curl -X PATCH http://localhost:3030/games/1 ^
  -H "Content-Type: application/json" ^
  -d "{\"computerMove\":true}"
```

Undo last move:

```bash
curl -X PATCH http://localhost:3030/games/1 ^
  -H "Content-Type: application/json" ^
  -d "{\"undo\":true}"
```

Update AI difficulty on an existing game:

```bash
curl -X PATCH http://localhost:3030/games/1 ^
  -H "Content-Type: application/json" ^
  -d "{\"setDifficulty\":\"hard\"}"
```

Reset the game:

```bash
curl -X PATCH http://localhost:3030/games/1 ^
  -H "Content-Type: application/json" ^
  -d "{\"reset\":true}"
```
