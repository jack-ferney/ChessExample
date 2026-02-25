// @ts-nocheck
const path = require('path')
const { feathers } = require('@feathersjs/feathers')
const express = require('@feathersjs/express')
const { GamesService } = require('./services/games.service')

const app = express(feathers())
const gamesDataPath = process.env.GAMES_DATA_PATH || path.join(__dirname, '..', 'data', 'games.json')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.configure(express.rest())

app.use('/', express.static(path.join(__dirname, '..', 'public')))

app.use('/games', new GamesService({ dataPath: gamesDataPath }), {
  methods: ['find', 'get', 'create', 'patch']
})

app.use(express.errorHandler())

module.exports = { app }
