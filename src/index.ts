// @ts-nocheck
const { app } = require('./app')

const port = Number(process.env.PORT || 3030)
const host = process.env.HOST || 'localhost'
let runningServer = null
let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  console.log(`Received ${signal}. Shutting down Feathers app...`)

  try {
    await app.teardown()
  } catch (error) {
    console.error('Error during app teardown:', error)
  }

  if (runningServer && typeof runningServer.close === 'function') {
    runningServer.close(() => {
      process.exit(0)
    })

    setTimeout(() => process.exit(1), 5000).unref()
    return
  }

  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

app
  .listen(port)
  .then((server) => {
    runningServer = server
    const address = server.address()
    const runningPort = typeof address === 'object' && address ? address.port : port
    console.log(`Feathers chess app running at http://${host}:${runningPort}`)
  })
  .catch((error) => {
    console.error('Failed to start Feathers app:', error)
    process.exit(1)
  })
