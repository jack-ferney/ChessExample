// @ts-nocheck
const { BadRequest } = require('@feathersjs/errors')

const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])
const SQUARE_REGEX = /^[a-h][1-8]$/
const PROMOTION_REGEX = /^[qrbn]$/

function ensureObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequest(message)
  }
}

function coerceBoolean(value, fieldName) {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true
  }

  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false
  }

  throw new BadRequest(`"${fieldName}" must be a boolean.`)
}

function normalizeSquare(value, fieldName) {
  if (typeof value !== 'string') {
    throw new BadRequest(`"${fieldName}" must be a square string like "e2".`)
  }

  const normalized = value.trim().toLowerCase()
  if (!SQUARE_REGEX.test(normalized)) {
    throw new BadRequest(`"${fieldName}" must be a valid square from a1 to h8.`)
  }

  return normalized
}

function normalizeDifficulty(value) {
  if (typeof value !== 'string') {
    throw new BadRequest('"setDifficulty" must be one of: easy, medium, hard.')
  }

  const normalized = value.trim().toLowerCase()
  if (!DIFFICULTIES.has(normalized)) {
    throw new BadRequest('"setDifficulty" must be one of: easy, medium, hard.')
  }

  return normalized
}

function normalizeMode(modeValue, vsComputerValue) {
  if (typeof modeValue === 'string') {
    const normalized = modeValue.trim().toLowerCase()
    if (normalized === 'computer' || normalized === 'ai' || normalized === 'bot') {
      return 'computer'
    }
    if (normalized === 'human' || normalized === 'local') {
      return 'human'
    }
  }

  if (vsComputerValue !== undefined) {
    return coerceBoolean(vsComputerValue, 'vsComputer') ? 'computer' : 'human'
  }

  return 'human'
}

function normalizeColor(value) {
  if (value === undefined || value === null || value === '') {
    return 'w'
  }

  if (typeof value !== 'string') {
    throw new BadRequest('"playerColor" must be "w" or "b".')
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'w' || normalized === 'white') {
    return 'w'
  }

  if (normalized === 'b' || normalized === 'black') {
    return 'b'
  }

  throw new BadRequest('"playerColor" must be "w" or "b".')
}

async function trackRequestTime(context, next) {
  const startedAt = Date.now()
  await next()
  context.params.requestDurationMs = Date.now() - startedAt
}

function normalizeFindQuery(context) {
  const query = { ...(context.params?.query || {}) }

  if (Object.prototype.hasOwnProperty.call(query, 'summary')) {
    query.summary = coerceBoolean(query.summary, 'summary')
  }

  context.params.query = query
}

function normalizeCreateData(context) {
  const data = context.data
  ensureObject(data, 'Create payload must be an object.')

  const normalized = {
    mode: normalizeMode(data.mode, data.vsComputer),
    difficulty: data.difficulty ? normalizeDifficulty(data.difficulty) : 'medium',
    playerColor: normalizeColor(data.playerColor)
  }

  if (data.fen !== undefined) {
    if (typeof data.fen !== 'string' || !data.fen.trim()) {
      throw new BadRequest('When provided, "fen" must be a non-empty string.')
    }
    normalized.fen = data.fen.trim()
  }

  context.data = normalized
}

function normalizePatchData(context) {
  const data = context.data
  ensureObject(data, 'PATCH payload must be an object.')

  const normalized = {}

  if (data.setDifficulty !== undefined || data.difficulty !== undefined) {
    normalized.setDifficulty = normalizeDifficulty(data.setDifficulty ?? data.difficulty)
  }

  if (data.reset !== undefined) {
    normalized.reset = coerceBoolean(data.reset, 'reset')
  }

  if (data.undo !== undefined) {
    normalized.undo = coerceBoolean(data.undo, 'undo')
  }

  if (data.computerMove !== undefined) {
    normalized.computerMove = coerceBoolean(data.computerMove, 'computerMove')
  }

  if (data.deferComputer !== undefined) {
    normalized.deferComputer = coerceBoolean(data.deferComputer, 'deferComputer')
  }

  if (data.move !== undefined) {
    ensureObject(data.move, '"move" must be an object with "from" and "to" squares.')

    const move = {
      from: normalizeSquare(data.move.from, 'move.from'),
      to: normalizeSquare(data.move.to, 'move.to')
    }

    if (data.move.promotion !== undefined) {
      if (typeof data.move.promotion !== 'string') {
        throw new BadRequest('"move.promotion" must be one of: q, r, b, n.')
      }

      const promotion = data.move.promotion.trim().toLowerCase()
      if (promotion && !PROMOTION_REGEX.test(promotion)) {
        throw new BadRequest('"move.promotion" must be one of: q, r, b, n.')
      }

      if (promotion) {
        move.promotion = promotion
      }
    }

    normalized.move = move
  }

  const hasAction =
    normalized.reset === true || normalized.undo === true || normalized.computerMove === true || Boolean(normalized.move)

  if (!hasAction && normalized.setDifficulty === undefined) {
    throw new BadRequest(
      'PATCH payload must include one of: { "move": {...} }, { "undo": true }, { "reset": true }, { "computerMove": true }, or { "setDifficulty": "easy|medium|hard" }.'
    )
  }

  context.data = normalized
}

function sanitizeUnhandledError(context) {
  if (context.error && !context.error.message) {
    context.error.message = 'Unexpected service error.'
  }
}

const gamesHooks = {
  around: {
    all: [trackRequestTime]
  },
  before: {
    find: [normalizeFindQuery],
    create: [normalizeCreateData],
    patch: [normalizePatchData]
  },
  error: {
    all: [sanitizeUnhandledError]
  }
}

module.exports = { gamesHooks }
