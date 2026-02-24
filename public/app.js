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

const pieceCodepoints = {
  w: { k: 9812, q: 9813, r: 9814, b: 9815, n: 9816, p: 9817 },
  b: { k: 9818, q: 9819, r: 9820, b: 9821, n: 9822, p: 9823 }
}

let currentGame = null
let selectedSquare = ''
let gamesIndex = []
let dragSourceSquare = ''

const files = 'abcdefgh'

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

  return String.fromCodePoint(pieceCodepoints[piece.color][piece.type])
}

function squareName(rowIndex, colIndex) {
  return `${files[colIndex]}${8 - rowIndex}`
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

function clearDropTargets() {
  boardEl.querySelectorAll('.drop-target').forEach((node) => {
    node.classList.remove('drop-target')
  })
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
  const response = await fetch(`/games/${id}`)
  currentGame = await parseResponse(response)
  selectedSquare = ''
  dragSourceSquare = ''
  syncSetupControlsFromGame(currentGame)
  renderGame()

  if (!quiet) {
    setStatus(`Loaded game ${currentGame.id}. ${statusLabel(currentGame)}.`)
  }
}

async function createGame() {
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

  currentGame = await parseResponse(response)
  selectedSquare = ''
  dragSourceSquare = ''
  fromEl.value = ''
  toEl.value = ''
  promotionEl.value = ''
  syncSetupControlsFromGame(currentGame)
  renderGame()
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

  currentGame = await parseResponse(response)
  selectedSquare = ''
  dragSourceSquare = ''
  syncSetupControlsFromGame(currentGame)
  renderGame()
  await fetchGamesIndex()
}

async function submitMove(fromOverride, toOverride) {
  if (!isPlayerTurn()) {
    throw new Error('It is not your turn.')
  }

  const from = (fromOverride || fromEl.value).trim().toLowerCase()
  const to = (toOverride || toEl.value).trim().toLowerCase()
  const promotion = promotionEl.value.trim().toLowerCase()

  if (!from || !to) {
    throw new Error('Both from and to squares are required.')
  }

  const payload = { move: { from, to } }
  if (promotion) {
    payload.move.promotion = promotion
  }

  await patchCurrentGame(payload)
  toEl.value = ''

  const computerReply = currentGame.computerMove ? ` Computer replied ${moveLabel(currentGame.computerMove)}.` : ''
  setStatus(`Move played. ${statusLabel(currentGame)}.${computerReply}`)
}

async function undoMove() {
  await patchCurrentGame({ undo: true })

  let message = `Move undone. ${statusLabel(currentGame)}.`
  if (currentGame.additionalUndoneMove) {
    message = `Move pair undone. ${statusLabel(currentGame)}.`
  }

  setStatus(message)
}

async function resetGame() {
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

function handleSquareClick(square) {
  if (!currentGame || !isPlayerTurn()) {
    return
  }

  if (!selectedSquare) {
    selectedSquare = square
    fromEl.value = square
  } else {
    toEl.value = square
    selectedSquare = ''
  }

  renderBoard()
}

async function handleDrop(targetSquare) {
  const sourceSquare = dragSourceSquare
  clearDropTargets()
  dragSourceSquare = ''

  if (!sourceSquare || sourceSquare === targetSquare) {
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

function renderBoard() {
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
      button.className = `square ${isLight ? 'light' : 'dark'}`
      if (square === selectedSquare) {
        button.classList.add('selected')
      }

      button.addEventListener('click', () => handleSquareClick(square))
      button.addEventListener('dragover', (event) => {
        if (!dragSourceSquare || !isPlayerTurn()) {
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

        icon.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`
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

function renderGame() {
  gameIdEl.textContent = currentGame ? currentGame.id : 'none'
  renderTurnChip()
  renderBoard()
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

async function init() {
  try {
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
