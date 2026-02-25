// @ts-nocheck
const fs = require('fs')
const path = require('path')
const { BadRequest, NotFound } = require('@feathersjs/errors')
const { Chess } = require('chess.js')

const DEFAULT_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const DIFFICULTIES = ['easy', 'medium', 'hard']
const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0
}

function isTruthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function normalizeDifficulty(input, fallback = 'medium') {
  if (typeof input !== 'string') {
    return fallback
  }

  const value = input.toLowerCase().trim()

  if (DIFFICULTIES.includes(value)) {
    return value
  }

  return fallback
}

function normalizeColor(input, fallback = 'w') {
  if (typeof input !== 'string') {
    return fallback
  }

  const value = input.toLowerCase().trim()

  if (value === 'w' || value === 'white') {
    return 'w'
  }

  if (value === 'b' || value === 'black') {
    return 'b'
  }

  return fallback
}

function normalizeMode(data = {}) {
  const mode = typeof data.mode === 'string' ? data.mode.toLowerCase().trim() : null

  if (mode === 'computer' || mode === 'ai' || mode === 'bot') {
    return 'computer'
  }

  if (mode === 'human' || mode === 'local') {
    return 'human'
  }

  if (isTruthy(data.vsComputer)) {
    return 'computer'
  }

  return 'human'
}

class GamesService {
  constructor(options = {}) {
    this.games = new Map()
    this.nextId = 1
    this.dataPath = options.dataPath || path.join(process.cwd(), 'data', 'games.json')

    this.loadFromDisk()
  }

  getEngineColor(game) {
    if (game.mode !== 'computer') {
      return null
    }

    return game.playerColor === 'w' ? 'b' : 'w'
  }

  isPlayersTurn(game) {
    if (game.mode !== 'computer') {
      return true
    }

    return game.chess.turn() === game.playerColor
  }

  getStatus(chess) {
    if (chess.isCheckmate()) {
      return 'checkmate'
    }

    if (chess.isDraw()) {
      return 'draw'
    }

    if (chess.inCheck()) {
      return 'check'
    }

    return 'active'
  }

  getLegalMovesByFrom(chess) {
    const byFrom = {}
    const moves = chess.moves({ verbose: true })

    for (const move of moves) {
      if (!byFrom[move.from]) {
        byFrom[move.from] = []
      }

      if (!byFrom[move.from].includes(move.to)) {
        byFrom[move.from].push(move.to)
      }
    }

    return byFrom
  }

  evaluatePosition(chess) {
    if (chess.isCheckmate()) {
      return chess.turn() === 'w' ? -100000 : 100000
    }

    if (chess.isDraw()) {
      return 0
    }

    let score = 0
    const board = chess.board()

    for (const row of board) {
      for (const square of row) {
        if (!square) {
          continue
        }

        const value = PIECE_VALUES[square.type] || 0
        score += square.color === 'w' ? value : -value
      }
    }

    return score
  }

  evaluateForColor(chess, color) {
    const whiteScore = this.evaluatePosition(chess)

    return color === 'w' ? whiteScore : -whiteScore
  }

  minimax(chess, depth, alpha, beta, engineColor) {
    if (depth === 0 || chess.isGameOver()) {
      return this.evaluateForColor(chess, engineColor)
    }

    const moves = chess.moves({ verbose: true })
    const maximizing = chess.turn() === engineColor

    if (maximizing) {
      let best = -Infinity

      for (const move of moves) {
        chess.move(move)
        const score = this.minimax(chess, depth - 1, alpha, beta, engineColor)
        chess.undo()

        if (score > best) {
          best = score
        }

        alpha = Math.max(alpha, best)
        if (beta <= alpha) {
          break
        }
      }

      return best
    }

    let best = Infinity

    for (const move of moves) {
      chess.move(move)
      const score = this.minimax(chess, depth - 1, alpha, beta, engineColor)
      chess.undo()

      if (score < best) {
        best = score
      }

      beta = Math.min(beta, best)
      if (beta <= alpha) {
        break
      }
    }

    return best
  }

  getDifficultyConfig(difficulty) {
    switch (difficulty) {
      case 'easy':
        return { depth: 1, randomTop: 4, noise: 120, blunderChance: 0.35 }
      case 'hard':
        return { depth: 3, randomTop: 1, noise: 0, blunderChance: 0 }
      case 'medium':
      default:
        return { depth: 2, randomTop: 2, noise: 24, blunderChance: 0.1 }
    }
  }

  chooseEngineMove(chess, difficulty, engineColor) {
    const legalMoves = chess.moves({ verbose: true })

    if (legalMoves.length === 0) {
      return null
    }

    const config = this.getDifficultyConfig(difficulty)
    const scoredMoves = []

    for (const move of legalMoves) {
      chess.move(move)
      const baseScore = this.minimax(chess, config.depth - 1, -Infinity, Infinity, engineColor)
      chess.undo()

      const noisyScore = baseScore + (Math.random() * 2 - 1) * config.noise
      scoredMoves.push({
        move,
        baseScore,
        noisyScore
      })
    }

    scoredMoves.sort((a, b) => b.noisyScore - a.noisyScore)

    if (Math.random() < config.blunderChance && scoredMoves.length > 1) {
      const upperBound = Math.min(scoredMoves.length, config.randomTop + 2)
      const index = Math.floor(Math.random() * upperBound)

      return scoredMoves[index].move
    }

    const topCount = Math.min(scoredMoves.length, config.randomTop)
    const topMoves = scoredMoves.slice(0, topCount)
    const picked = topMoves[Math.floor(Math.random() * topMoves.length)]

    return picked.move
  }

  applyComputerMove(game) {
    if (game.mode !== 'computer') {
      return null
    }

    if (game.chess.isGameOver()) {
      return null
    }

    const engineColor = this.getEngineColor(game)
    if (!engineColor || game.chess.turn() !== engineColor) {
      return null
    }

    const chosenMove = this.chooseEngineMove(game.chess, game.difficulty, engineColor)
    if (!chosenMove) {
      return null
    }

    const applied = game.chess.move({
      from: chosenMove.from,
      to: chosenMove.to,
      promotion: chosenMove.promotion
    })

    if (applied) {
      game.updatedAt = new Date().toISOString()
    }

    return applied || null
  }

  toSummary(game) {
    const history = game.chess.history()
    const status = this.getStatus(game.chess)
    const engineColor = this.getEngineColor(game)
    const verboseHistory = game.chess.history({ verbose: true })
    const lastMoveInfo = verboseHistory.length > 0 ? verboseHistory[verboseHistory.length - 1] : null

    return {
      id: game.id,
      mode: game.mode,
      difficulty: game.difficulty,
      playerColor: game.playerColor,
      computerColor: engineColor,
      turn: game.chess.turn(),
      moveCount: history.length,
      status,
      lastMove: history.length > 0 ? history[history.length - 1] : null,
      lastMoveSquare: lastMoveInfo ? lastMoveInfo.to : null,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt
    }
  }

  toResult(game) {
    const history = game.chess.history()
    const engineColor = this.getEngineColor(game)
    const verboseHistory = game.chess.history({ verbose: true })
    const lastMoveInfo = verboseHistory.length > 0 ? verboseHistory[verboseHistory.length - 1] : null
    const legalMovesByFrom = this.getLegalMovesByFrom(game.chess)

    return {
      id: game.id,
      mode: game.mode,
      difficulty: game.difficulty,
      playerColor: game.playerColor,
      computerColor: engineColor,
      isPlayerTurn: this.isPlayersTurn(game),
      fen: game.chess.fen(),
      startFen: game.startFen,
      turn: game.chess.turn(),
      isCheck: game.chess.inCheck(),
      isCheckmate: game.chess.isCheckmate(),
      isDraw: game.chess.isDraw(),
      status: this.getStatus(game.chess),
      pgn: game.chess.pgn(),
      history,
      moveCount: history.length,
      legalMovesByFrom,
      lastMoveInfo: lastMoveInfo
        ? {
            from: lastMoveInfo.from,
            to: lastMoveInfo.to,
            promotion: lastMoveInfo.promotion
          }
        : null,
      board: game.chess.board(),
      createdAt: game.createdAt,
      updatedAt: game.updatedAt
    }
  }

  toPersistedRecord(game) {
    return {
      id: game.id,
      mode: game.mode,
      difficulty: game.difficulty,
      playerColor: game.playerColor,
      startFen: game.startFen,
      moves: game.chess.history({ verbose: true }).map((move) => ({
        from: move.from,
        to: move.to,
        promotion: move.promotion
      })),
      createdAt: game.createdAt,
      updatedAt: game.updatedAt
    }
  }

  createChessFromStartFen(startFen) {
    const chess = new Chess()

    if (startFen && startFen !== DEFAULT_START_FEN) {
      const loaded = chess.load(startFen)

      if (!loaded) {
        throw new Error('Failed to load start FEN.')
      }
    }

    return chess
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        return
      }

      const raw = fs.readFileSync(this.dataPath, 'utf8')
      const parsed = JSON.parse(raw)
      const records = Array.isArray(parsed?.games) ? parsed.games : []

      for (const record of records) {
        if (!record || !record.id) {
          continue
        }

        try {
          const startFen = typeof record.startFen === 'string' ? record.startFen : DEFAULT_START_FEN
          const chess = this.createChessFromStartFen(startFen)
          const moves = Array.isArray(record.moves) ? record.moves : []

          for (const move of moves) {
            const applied = chess.move({
              from: String(move.from || '').toLowerCase(),
              to: String(move.to || '').toLowerCase(),
              promotion: typeof move.promotion === 'string' ? move.promotion.toLowerCase() : undefined
            })

            if (!applied) {
              throw new Error(`Invalid move "${JSON.stringify(move)}" in game ${record.id}`)
            }
          }

          this.games.set(String(record.id), {
            id: String(record.id),
            mode: record.mode === 'computer' ? 'computer' : 'human',
            difficulty: normalizeDifficulty(record.difficulty, 'medium'),
            playerColor: normalizeColor(record.playerColor, 'w'),
            startFen,
            chess,
            createdAt: record.createdAt || new Date().toISOString(),
            updatedAt: record.updatedAt || new Date().toISOString()
          })
        } catch (error) {
          console.warn(`Skipping invalid persisted game "${record.id}": ${error.message}`)
        }
      }

      const maxId = Array.from(this.games.keys()).reduce((max, key) => {
        const numeric = Number(key)

        if (Number.isInteger(numeric) && numeric > max) {
          return numeric
        }

        return max
      }, 0)

      this.nextId = Number.isInteger(parsed?.nextId) ? Math.max(parsed.nextId, maxId + 1) : maxId + 1
    } catch (error) {
      console.warn(`Failed to load persisted games: ${error.message}`)
    }
  }

  saveToDisk() {
    const dir = path.dirname(this.dataPath)

    fs.mkdirSync(dir, { recursive: true })

    const payload = {
      nextId: this.nextId,
      games: Array.from(this.games.values()).map((game) => this.toPersistedRecord(game))
    }

    fs.writeFileSync(this.dataPath, JSON.stringify(payload, null, 2), 'utf8')
  }

  getGameOrThrow(id) {
    const game = this.games.get(String(id))

    if (!game) {
      throw new NotFound(`No game found for id "${id}".`)
    }

    return game
  }

  async find(params = {}) {
    const summariesOnly = isTruthy(params?.query?.summary)
    const games = Array.from(this.games.values()).sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

    if (summariesOnly) {
      return games.map((game) => this.toSummary(game))
    }

    return games.map((game) => this.toResult(game))
  }

  async get(id) {
    return this.toResult(this.getGameOrThrow(id))
  }

  async create(data = {}) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new BadRequest('Create payload must be an object.')
    }

    const chess = new Chess()
    let startFen = DEFAULT_START_FEN

    if (data.fen !== undefined) {
      if (typeof data.fen !== 'string' || !data.fen.trim()) {
        throw new BadRequest('When provided, "fen" must be a non-empty string.')
      }

      const loaded = chess.load(data.fen.trim())

      if (!loaded) {
        throw new BadRequest('Invalid FEN in create payload.')
      }

      startFen = chess.fen()
    }

    const mode = normalizeMode(data)
    const difficulty = normalizeDifficulty(data.difficulty, 'medium')
    const playerColor = normalizeColor(data.playerColor, 'w')

    const id = String(this.nextId++)
    const now = new Date().toISOString()
    const game = {
      id,
      mode,
      difficulty,
      playerColor,
      startFen,
      chess,
      createdAt: now,
      updatedAt: now
    }

    let computerMove = null
    if (mode === 'computer' && playerColor === 'b') {
      computerMove = this.applyComputerMove(game)
    }

    this.games.set(id, game)
    this.saveToDisk()

    const result = this.toResult(game)
    if (computerMove) {
      result.computerMove = computerMove
    }

    return result
  }

  async patch(id, data = {}) {
    const game = this.getGameOrThrow(id)

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new BadRequest('PATCH payload must be an object.')
    }

    const difficultyUpdate = data.setDifficulty ?? data.difficulty
    if (difficultyUpdate !== undefined) {
      const normalized = normalizeDifficulty(difficultyUpdate, null)
      if (!normalized) {
        throw new BadRequest('Difficulty must be one of: easy, medium, hard.')
      }

      game.difficulty = normalized
      game.updatedAt = new Date().toISOString()
    }

    if (data.reset === true) {
      game.chess = this.createChessFromStartFen(game.startFen)
      game.updatedAt = new Date().toISOString()

      let computerMove = null
      if (game.mode === 'computer' && game.playerColor === 'b') {
        computerMove = this.applyComputerMove(game)
      }

      this.saveToDisk()

      const result = this.toResult(game)
      if (computerMove) {
        result.computerMove = computerMove
      }

      return result
    }

    if (data.computerMove === true) {
      if (game.mode !== 'computer') {
        throw new BadRequest('Computer move is only available in computer mode.')
      }

      if (game.chess.isGameOver()) {
        throw new BadRequest('Game is already over.')
      }

      if (this.isPlayersTurn(game)) {
        throw new BadRequest('It is the player turn, not the computer turn.')
      }

      const computerMove = this.applyComputerMove(game)
      if (!computerMove) {
        throw new BadRequest('No legal computer move available.')
      }

      this.saveToDisk()

      const result = this.toResult(game)
      result.computerMove = computerMove

      return result
    }

    if (data.undo === true) {
      const firstUndone = game.chess.undo()

      if (!firstUndone) {
        throw new BadRequest('No moves available to undo.')
      }

      let secondUndone = null
      if (game.mode === 'computer' && !this.isPlayersTurn(game) && game.chess.history().length > 0) {
        secondUndone = game.chess.undo()
      }

      game.updatedAt = new Date().toISOString()
      this.saveToDisk()

      const result = this.toResult(game)
      result.lastUndoneMove = firstUndone

      if (secondUndone) {
        result.additionalUndoneMove = secondUndone
      }

      return result
    }

    if (!data.move || typeof data.move !== 'object') {
      throw new BadRequest(
        'PATCH payload must include one of: { "move": {...} }, { "undo": true }, { "reset": true }.'
      )
    }

    if (game.mode === 'computer' && !this.isPlayersTurn(game)) {
      throw new BadRequest('Wait for the computer move. It is not your turn yet.')
    }

    const { from, to, promotion } = data.move

    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new BadRequest('Move requires "from" and "to" square strings, e.g. "e2" and "e4".')
    }

    const movedPiece = game.chess.move({
      from: from.toLowerCase(),
      to: to.toLowerCase(),
      promotion: typeof promotion === 'string' ? promotion.toLowerCase() : undefined
    })

    if (!movedPiece) {
      throw new BadRequest('Illegal move for the current board position.')
    }

    game.updatedAt = new Date().toISOString()
    let computerMove = null

    const shouldAutoComputerMove =
      game.mode === 'computer' &&
      !game.chess.isGameOver() &&
      data.deferComputer !== true &&
      data.deferComputer !== 'true'

    if (shouldAutoComputerMove) {
      computerMove = this.applyComputerMove(game)
    }

    this.saveToDisk()

    const result = this.toResult(game)
    result.lastMove = movedPiece

    if (computerMove) {
      result.computerMove = computerMove
    }

    return result
  }
}

module.exports = { GamesService }
