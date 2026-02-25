// @ts-nocheck
const boardEl = document.getElementById('board')
const gameIdEl = document.getElementById('game-id')
const statusEl = document.getElementById('status')
const historyEl = document.getElementById('history')
const fromEl = document.getElementById('from')
const toEl = document.getElementById('to')
const promotionEl = document.getElementById('promotion')
const gamesListEl = document.getElementById('games-list')
const gamesCountEl = document.getElementById('games-count')
const turnChipEl = document.getElementById('turn-chip')
const modeSelectEl = document.getElementById('mode-select')
const difficultySelectEl = document.getElementById('difficulty-select')
const colorSelectEl = document.getElementById('color-select')
const themeSelectEl = document.getElementById('theme-select')
const pieceStyleSelectEl = document.getElementById('piece-style-select')

const PIECE_STYLES = {
  classic: {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' }
  },
  glass: {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' }
  },
  mono: {
    w: { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' },
    b: { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' }
  },
  cyber: {
    w: { k: '\u25C6', q: '\u25C8', r: '\u25A3', b: '\u25EC', n: '\u2736', p: '\u25CF' },
    b: { k: '\u25C7', q: '\u2B21', r: '\u25A1', b: '\u25B3', n: '\u2726', p: '\u25CB' }
  },
  emoji: {
    w: { k: '\uD83D\uDC51', q: '\uD83D\uDC8E', r: '\uD83D\uDDFC', b: '\uD83D\uDEF0', n: '\uD83E\uDD84', p: '\u26AA' },
    b: { k: '\uD83D\uDD2E', q: '\uD83D\uDCA0', r: '\uD83E\uDDF1', b: '\uD83D\uDEF8', n: '\uD83D\uDC09', p: '\u26AB' }
  }
}

const THEMES = ['aurora', 'synthwave', 'abyss', 'ember', 'blueprint']
const THEME_ALIASES = {
  forest: 'aurora',
  sunset: 'ember',
  ocean: 'abyss',
  graphite: 'synthwave',
  parchment: 'blueprint'
}
const PIECE_STYLE_ALIASES = {
  outline: 'glass',
  letters: 'mono',
  glyph: 'cyber'
}
const THEME_STORAGE_KEY = 'feathers_chess_theme'
const PIECE_STYLE_STORAGE_KEY = 'feathers_chess_piece_style'

let currentGame = null
let selectedSquare = ''
let validTargetSquares = []
let gamesIndex = []
let dragSourceSquare = ''
let lastUpdatedSquare = ''
let pendingComputerTimeoutId = null
let currentPieceStyle = 'classic'

const files = 'abcdefgh'

function normalizeSquare(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim().toLowerCase()
  return /^[a-h][1-8]$/.test(trimmed) ? trimmed : ''
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    return null
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch (error) {
    // Ignore storage failures in restricted contexts.
  }
}

function resolveTheme(theme) {
  const normalized = typeof theme === 'string' ? theme.trim().toLowerCase() : ''
  const aliased = THEME_ALIASES[normalized] || normalized
  return THEMES.includes(aliased) ? aliased : 'aurora'
}

function resolvePieceStyle(style) {
  const normalized = typeof style === 'string' ? style.trim().toLowerCase() : ''
  const aliased = PIECE_STYLE_ALIASES[normalized] || normalized
  return Object.prototype.hasOwnProperty.call(PIECE_STYLES, aliased) ? aliased : 'classic'
}

function applyTheme(theme, persist = true) {
  const selectedTheme = resolveTheme(theme)
  document.documentElement.setAttribute('data-theme', selectedTheme)
  themeSelectEl.value = selectedTheme

  if (persist) {
    safeStorageSet(THEME_STORAGE_KEY, selectedTheme)
  }
}

function applyPieceStyle(style, persist = true) {
  const selectedStyle = resolvePieceStyle(style)
  currentPieceStyle = selectedStyle
  document.documentElement.setAttribute('data-piece-style', selectedStyle)
  pieceStyleSelectEl.value = selectedStyle

  if (persist) {
    safeStorageSet(PIECE_STYLE_STORAGE_KEY, selectedStyle)
  }
}

function colorName(color) {
  return color === 'w' ? 'White' : 'Black'
}

function setStatus(message, isError = false) {
  statusEl.textContent = message
  statusEl.classList.toggle('error', isError)
}

function moveLabel(move) {
  if (!move) {
    return ''
  }

  const promotion = move.promotion ? `=${move.promotion}` : ''
  return `${move.from}-${move.to}${promotion}`
}

function toSimpleMove(move) {
  if (!move || typeof move !== 'object') {
    return null
  }

  const from = normalizeSquare(move.from)
  const to = normalizeSquare(move.to)

  if (!from || !to) {
    return null
  }

  return {
    from,
    to,
    promotion: typeof move.promotion === 'string' ? move.promotion.toLowerCase() : undefined
  }
}

function getAnimationMoveFromResponse(payload, responseData) {
  const explicitPayloadMove = payload?.move ? toSimpleMove(payload.move) : null
  const responseLastMove = toSimpleMove(responseData?.lastMove)
  const responseLastMoveInfo = toSimpleMove(responseData?.lastMoveInfo)
  const computerMove = toSimpleMove(responseData?.computerMove)

  if (explicitPayloadMove) {
    return explicitPayloadMove
  }

  return responseLastMove || computerMove || responseLastMoveInfo
}

function getHighlightSquareFromResponse(payload, responseData) {
  const computerMove = toSimpleMove(responseData?.computerMove)
  if (computerMove) {
    return computerMove.to
  }

  const responseLastMove = toSimpleMove(responseData?.lastMove)
  if (responseLastMove) {
    return responseLastMove.to
  }

  const responseLastMoveInfo = toSimpleMove(responseData?.lastMoveInfo)
  if (responseLastMoveInfo) {
    return responseLastMoveInfo.to
  }

  const extraUndo = toSimpleMove(responseData?.additionalUndoneMove)
  if (extraUndo) {
    return extraUndo.from
  }

  const undoMove = toSimpleMove(responseData?.lastUndoneMove)
  if (undoMove) {
    return undoMove.from
  }

  if (payload?.reset === true) {
    return ''
  }

  return lastUpdatedSquare
}

function statusLabel(game) {
  if (!game) {
    return 'No game'
  }

  if (game.isCheckmate || game.status === 'checkmate') {
    return 'Checkmate'
  }

  if (game.isDraw || game.status === 'draw') {
    return 'Draw'
  }

  if (game.mode === 'computer') {
    const nextSide = game.turn === game.playerColor ? 'Your move' : 'Computer move'
    const checkPrefix = game.isCheck || game.status === 'check' ? 'Check - ' : ''
    return `${checkPrefix}${nextSide} (${colorName(game.turn)})`
  }

  if (game.isCheck || game.status === 'check') {
    return `Check - ${colorName(game.turn)} to move`
  }

  return `${colorName(game.turn)} to move`
}

function pieceSymbol(piece) {
  if (!piece) {
    return ''
  }

  const style = PIECE_STYLES[currentPieceStyle] || PIECE_STYLES.classic
  return style[piece.color]?.[piece.type] || PIECE_STYLES.classic[piece.color][piece.type]
}

function squareName(rowIndex, colIndex) {
  return `${files[colIndex]}${8 - rowIndex}`
}

function squareToPosition(square) {
  const normalized = normalizeSquare(square)
  if (!normalized) {
    return null
  }

  const col = files.indexOf(normalized[0])
  const row = 8 - Number(normalized[1])
  if (col < 0 || row < 0 || row > 7) {
    return null
  }

  return { row, col }
}

function getPieceAtSquare(square) {
  const pos = squareToPosition(square)
  if (!pos || !currentGame || !Array.isArray(currentGame.board)) {
    return null
  }

  return currentGame.board[pos.row]?.[pos.col] || null
}

function formatTimestamp(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'unknown'
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function isPlayerTurn() {
  if (!currentGame) {
    return false
  }

  if (currentGame.mode !== 'computer') {
    return true
  }

  return Boolean(currentGame.isPlayerTurn)
}

function isDraggablePiece(piece) {
  if (!currentGame || !piece || !isPlayerTurn()) {
    return false
  }

  if (piece.color !== currentGame.turn) {
    return false
  }

  if (currentGame.mode === 'computer') {
    return piece.color === currentGame.playerColor
  }

  return true
}

function getValidTargetsForSquare(square) {
  const normalized = normalizeSquare(square)
  if (!normalized || !currentGame || !currentGame.legalMovesByFrom) {
    return []
  }

  const targets = currentGame.legalMovesByFrom[normalized]
  return Array.isArray(targets) ? targets.slice() : []
}

function clearSelection() {
  selectedSquare = ''
  validTargetSquares = []
}

function selectSquare(square) {
  selectedSquare = square
  fromEl.value = square
  validTargetSquares = getValidTargetsForSquare(square)
}

function canSelectSquare(square) {
  const piece = getPieceAtSquare(square)
  if (!piece || !currentGame) {
    return false
  }

  if (piece.color !== currentGame.turn) {
    return false
  }

  if (currentGame.mode === 'computer') {
    return piece.color === currentGame.playerColor
  }

  return true
}

function clearDropTargets() {
  boardEl.querySelectorAll('.drop-target').forEach((node) => {
    node.classList.remove('drop-target')
  })
}

function clearPendingComputerMove() {
  if (pendingComputerTimeoutId) {
    clearTimeout(pendingComputerTimeoutId)
    pendingComputerTimeoutId = null
  }
}

function animateRenderedMove(move) {
  const parsed = toSimpleMove(move)
  if (!parsed || parsed.from === parsed.to) {
    return
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }

  const fromSquareEl = boardEl.querySelector(`.square[data-square="${parsed.from}"]`)
  const toSquareEl = boardEl.querySelector(`.square[data-square="${parsed.to}"]`)

  if (!fromSquareEl || !toSquareEl) {
    return
  }

  const pieceEl = toSquareEl.querySelector('.piece')
  if (!pieceEl) {
    return
  }

  const fromRect = fromSquareEl.getBoundingClientRect()
  const toRect = toSquareEl.getBoundingClientRect()
  const dx = fromRect.left - toRect.left
  const dy = fromRect.top - toRect.top

  if (dx === 0 && dy === 0) {
    return
  }

  pieceEl.style.transition = 'none'
  pieceEl.style.transform = `translate(${dx}px, ${dy}px)`
  pieceEl.style.willChange = 'transform'

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pieceEl.style.transition = 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)'
      pieceEl.style.transform = 'translate(0, 0)'
    })
  })

  const cleanup = () => {
    pieceEl.style.transition = ''
    pieceEl.style.transform = ''
    pieceEl.style.willChange = ''
  }

  pieceEl.addEventListener('transitionend', cleanup, { once: true })
}

function updateSetupControlsEnabledState() {
  const vsComputer = modeSelectEl.value === 'computer'
  difficultySelectEl.disabled = !vsComputer
  colorSelectEl.disabled = !vsComputer
}

function syncSetupControlsFromGame(game) {
  if (!game) {
    return
  }

  modeSelectEl.value = game.mode === 'computer' ? 'computer' : 'human'
  difficultySelectEl.value = game.difficulty || 'medium'
  colorSelectEl.value = game.playerColor || 'w'
  updateSetupControlsEnabledState()
}

function isGameOver(game) {
  if (!game) {
    return true
  }

  return Boolean(game.isCheckmate || game.isDraw || game.status === 'checkmate' || game.status === 'draw')
}

function scheduleComputerMoveWithDelay() {
  clearPendingComputerMove()

  if (!currentGame || currentGame.mode !== 'computer' || isPlayerTurn() || isGameOver(currentGame)) {
    return
  }

  const scheduledGameId = String(currentGame.id)

  pendingComputerTimeoutId = setTimeout(async () => {
    pendingComputerTimeoutId = null

    if (!currentGame || String(currentGame.id) !== scheduledGameId) {
      return
    }

    if (currentGame.mode !== 'computer' || isPlayerTurn() || isGameOver(currentGame)) {
      return
    }

    try {
      await patchCurrentGame({ computerMove: true })

      const computerMove = toSimpleMove(currentGame.computerMove) || toSimpleMove(currentGame.lastMoveInfo)
      if (computerMove) {
        setStatus(`Computer played ${moveLabel(computerMove)}. ${statusLabel(currentGame)}.`)
      } else {
        setStatus(`Computer moved. ${statusLabel(currentGame)}.`)
      }
    } catch (error) {
      setStatus(error.message, true)
    }
  }, 1000)
}

async function parseResponse(response) {
  if (response.ok) {
    return response.json()
  }

  let error = { message: `Request failed: ${response.status}` }

  try {
    error = await response.json()
  } catch (e) {
    // Keep fallback.
  }

  throw new Error(error.message || `Request failed: ${response.status}`)
}

async function fetchGamesIndex() {
  const response = await fetch('/games?summary=true')
  gamesIndex = await parseResponse(response)
  renderGamesList()
}

async function loadGame(id, quiet = false) {
  clearPendingComputerMove()

  const response = await fetch(`/games/${id}`)
  currentGame = await parseResponse(response)
  clearSelection()
  dragSourceSquare = ''
  lastUpdatedSquare = normalizeSquare(currentGame?.lastMoveInfo?.to)
  syncSetupControlsFromGame(currentGame)
  renderGame()

  if (!quiet) {
    setStatus(`Loaded game ${currentGame.id}. ${statusLabel(currentGame)}.`)
  }
}

async function createGame() {
  clearPendingComputerMove()

  const payload = {
    mode: modeSelectEl.value,
    difficulty: difficultySelectEl.value,
    playerColor: colorSelectEl.value
  }

  const response = await fetch('/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const createdGame = await parseResponse(response)
  const animationMove = toSimpleMove(createdGame.computerMove)

  currentGame = createdGame
  clearSelection()
  dragSourceSquare = ''
  lastUpdatedSquare = createdGame.computerMove ? normalizeSquare(createdGame.computerMove.to) : ''
  fromEl.value = ''
  toEl.value = ''
  promotionEl.value = ''
  syncSetupControlsFromGame(currentGame)
  renderGame(animationMove)
  await fetchGamesIndex()

  let message = `Created game ${currentGame.id}. ${statusLabel(currentGame)}.`
  if (currentGame.computerMove) {
    message = `${message} Computer played ${moveLabel(currentGame.computerMove)}.`
  }

  setStatus(message)
}

async function patchCurrentGame(payload) {
  if (!currentGame) {
    throw new Error('Create or load a game first.')
  }

  const response = await fetch(`/games/${currentGame.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const updatedGame = await parseResponse(response)
  const animationMove = getAnimationMoveFromResponse(payload, updatedGame)

  currentGame = updatedGame
  clearSelection()
  dragSourceSquare = ''
  lastUpdatedSquare = getHighlightSquareFromResponse(payload, updatedGame)
  syncSetupControlsFromGame(currentGame)
  renderGame(animationMove)
  await fetchGamesIndex()
}

async function submitMove(fromOverride, toOverride) {
  if (!isPlayerTurn()) {
    throw new Error('It is not your turn.')
  }

  clearPendingComputerMove()

  const from = normalizeSquare(fromOverride || fromEl.value)
  const to = normalizeSquare(toOverride || toEl.value)
  const promotion = promotionEl.value.trim().toLowerCase()

  if (!from || !to) {
    throw new Error('Both from and to squares are required.')
  }

  const payload = { move: { from, to } }
  if (promotion) {
    payload.move.promotion = promotion
  }

  if (currentGame.mode === 'computer') {
    payload.deferComputer = true
  }

  await patchCurrentGame(payload)
  toEl.value = ''

  if (currentGame.mode === 'computer' && !isPlayerTurn() && !isGameOver(currentGame)) {
    setStatus(`Move played. Computer thinking...`)
    scheduleComputerMoveWithDelay()
    return
  }

  setStatus(`Move played. ${statusLabel(currentGame)}.`)
}

async function undoMove() {
  clearPendingComputerMove()
  await patchCurrentGame({ undo: true })

  let message = `Move undone. ${statusLabel(currentGame)}.`
  if (currentGame.additionalUndoneMove) {
    message = `Move pair undone. ${statusLabel(currentGame)}.`
  }

  setStatus(message)
}

async function resetGame() {
  clearPendingComputerMove()
  await patchCurrentGame({ reset: true })
  fromEl.value = ''
  toEl.value = ''
  promotionEl.value = ''

  let message = `Game ${currentGame.id} reset. ${statusLabel(currentGame)}.`
  if (currentGame.computerMove) {
    message = `${message} Computer played ${moveLabel(currentGame.computerMove)}.`
  }

  setStatus(message)
}

async function handleSquareClick(square) {
  if (!currentGame || !isPlayerTurn()) {
    return
  }

  const normalized = normalizeSquare(square)
  if (!normalized) {
    return
  }

  if (!selectedSquare) {
    if (!canSelectSquare(normalized)) {
      return
    }

    selectSquare(normalized)
    renderBoard()
    return
  }

  if (normalized === selectedSquare) {
    clearSelection()
    renderBoard()
    return
  }

  if (canSelectSquare(normalized)) {
    selectSquare(normalized)
    renderBoard()
    return
  }

  if (!validTargetSquares.includes(normalized)) {
    clearSelection()
    renderBoard()
    return
  }

  const from = selectedSquare
  clearSelection()
  renderBoard()
  fromEl.value = from
  toEl.value = normalized

  try {
    await submitMove(from, normalized)
  } catch (error) {
    setStatus(error.message, true)
    if (currentGame) {
      await loadGame(currentGame.id, true)
    }
  }
}

async function handleDrop(targetSquare) {
  const sourceSquare = dragSourceSquare
  clearDropTargets()
  dragSourceSquare = ''

  if (!sourceSquare || sourceSquare === targetSquare) {
    return
  }

  const targets = getValidTargetsForSquare(sourceSquare)
  if (!targets.includes(targetSquare)) {
    return
  }

  fromEl.value = sourceSquare
  toEl.value = targetSquare

  try {
    await submitMove(sourceSquare, targetSquare)
  } catch (error) {
    setStatus(error.message, true)
    if (currentGame) {
      await loadGame(currentGame.id, true)
    }
  }
}

function renderBoard(animationMove = null) {
  boardEl.innerHTML = ''

  if (!currentGame) {
    return
  }

  const board = currentGame.board

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = squareName(row, col)
      const piece = board[row][col]
      const isLight = (row + col) % 2 === 0

      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.square = square
      button.className = `square ${isLight ? 'light' : 'dark'}`
      if (square === selectedSquare) {
        button.classList.add('selected')
      }
      if (square === lastUpdatedSquare) {
        button.classList.add('last-updated')
      }
      if (validTargetSquares.includes(square)) {
        button.classList.add('valid-target')
      }

      button.addEventListener('click', async () => {
        await handleSquareClick(square)
      })
      button.addEventListener('dragover', (event) => {
        if (!dragSourceSquare || !isPlayerTurn()) {
          return
        }

        const targets = getValidTargetsForSquare(dragSourceSquare)
        if (!targets.includes(square)) {
          return
        }

        event.preventDefault()
        button.classList.add('drop-target')
      })
      button.addEventListener('dragleave', () => {
        button.classList.remove('drop-target')
      })
      button.addEventListener('drop', async (event) => {
        event.preventDefault()
        button.classList.remove('drop-target')
        await handleDrop(square)
      })

      if (piece) {
        const icon = document.createElement('span')
        const canDrag = isDraggablePiece(piece)

        icon.className = `piece ${piece.color === 'w' ? 'white' : 'black'} style-${currentPieceStyle}`
        if (canDrag) {
          icon.classList.add('draggable')
        }

        icon.textContent = pieceSymbol(piece)
        icon.draggable = canDrag

        if (canDrag) {
          icon.addEventListener('dragstart', (event) => {
            dragSourceSquare = square
            icon.classList.add('dragging')
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', square)
          })
          icon.addEventListener('dragend', () => {
            icon.classList.remove('dragging')
            clearDropTargets()
            dragSourceSquare = ''
          })
        }

        button.appendChild(icon)
      }

      const coord = document.createElement('span')
      coord.className = 'coord'
      coord.textContent = square
      button.appendChild(coord)

      boardEl.appendChild(button)
    }
  }

  if (animationMove) {
    animateRenderedMove(animationMove)
  }
}

function renderHistory() {
  historyEl.innerHTML = ''

  if (!currentGame || !Array.isArray(currentGame.history) || currentGame.history.length === 0) {
    const empty = document.createElement('li')
    empty.textContent = 'No moves yet.'
    historyEl.appendChild(empty)
    return
  }

  currentGame.history.forEach((move, index) => {
    const item = document.createElement('li')
    item.textContent = `${index + 1}. ${move}`
    historyEl.appendChild(item)
  })
}

function renderTurnChip() {
  turnChipEl.textContent = statusLabel(currentGame)
}

function renderGame(animationMove = null) {
  gameIdEl.textContent = currentGame ? currentGame.id : 'none'
  renderTurnChip()
  renderBoard(animationMove)
  renderHistory()
  renderGamesList()
}

function renderGamesList() {
  gamesListEl.innerHTML = ''
  gamesCountEl.textContent = String(gamesIndex.length)

  if (gamesIndex.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'game-empty'
    empty.textContent = 'No games yet. Click "New Game" to create one.'
    gamesListEl.appendChild(empty)
    return
  }

  for (const game of gamesIndex) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'game-card'
    if (currentGame && String(currentGame.id) === String(game.id)) {
      card.classList.add('active')
    }

    const head = document.createElement('div')
    head.className = 'game-head'

    const id = document.createElement('span')
    id.className = 'game-id'
    id.textContent = `#${game.id}`
    head.appendChild(id)

    const status = document.createElement('span')
    status.className = 'chip'
    status.textContent = game.status || 'active'
    head.appendChild(status)

    const modeMeta = document.createElement('p')
    modeMeta.className = 'game-meta'
    modeMeta.textContent = game.mode === 'computer' ? `vs computer (${game.difficulty || 'medium'})` : 'local human game'

    const meta = document.createElement('p')
    meta.className = 'game-meta'
    meta.textContent = `${game.moveCount || 0} moves - ${formatTimestamp(game.updatedAt)}`

    const sub = document.createElement('p')
    sub.className = 'game-meta'
    sub.textContent = game.lastMove ? `Last: ${game.lastMove}` : 'No moves yet'

    card.appendChild(head)
    card.appendChild(modeMeta)
    card.appendChild(meta)
    card.appendChild(sub)

    card.addEventListener('click', async () => {
      try {
        await loadGame(game.id)
      } catch (error) {
        setStatus(error.message, true)
      }
    })

    gamesListEl.appendChild(card)
  }
}

document.getElementById('new-game').addEventListener('click', async () => {
  try {
    await createGame()
  } catch (error) {
    setStatus(error.message, true)
  }
})

document.getElementById('refresh-games').addEventListener('click', async () => {
  try {
    await fetchGamesIndex()
    setStatus('Game list refreshed.')
  } catch (error) {
    setStatus(error.message, true)
  }
})

document.getElementById('make-move').addEventListener('click', async () => {
  try {
    await submitMove()
  } catch (error) {
    setStatus(error.message, true)
    if (currentGame) {
      await loadGame(currentGame.id, true)
    }
  }
})

document.getElementById('undo-move').addEventListener('click', async () => {
  try {
    await undoMove()
  } catch (error) {
    setStatus(error.message, true)
  }
})

document.getElementById('reset-game').addEventListener('click', async () => {
  try {
    await resetGame()
  } catch (error) {
    setStatus(error.message, true)
  }
})

modeSelectEl.addEventListener('change', () => {
  updateSetupControlsEnabledState()
})

themeSelectEl.addEventListener('change', () => {
  applyTheme(themeSelectEl.value)
})

pieceStyleSelectEl.addEventListener('change', () => {
  applyPieceStyle(pieceStyleSelectEl.value)
  renderBoard()
})

async function init() {
  try {
    applyTheme(safeStorageGet(THEME_STORAGE_KEY) || themeSelectEl.value, false)
    applyPieceStyle(safeStorageGet(PIECE_STYLE_STORAGE_KEY) || pieceStyleSelectEl.value, false)
    updateSetupControlsEnabledState()
    await fetchGamesIndex()

    if (gamesIndex.length > 0) {
      await loadGame(gamesIndex[0].id, true)
      setStatus(`Loaded latest game ${gamesIndex[0].id}. ${statusLabel(currentGame)}.`)
    } else {
      renderGame()
      setStatus('No saved games. Create one to start playing.')
    }
  } catch (error) {
    setStatus(error.message, true)
  }
}

init()

