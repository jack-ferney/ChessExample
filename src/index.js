const { app } = require('./app')

const port = Number(process.env.PORT || 3030)
const host = process.env.HOST || 'localhost'

app
  .listen(port)
  .then((server) => {
    const address = server.address()
    const runningPort = typeof address === 'object' && address ? address.port : port
    console.log(`Feathers chess app running at http://${host}:${runningPort}`)
  })
  .catch((error) => {
    console.error('Failed to start Feathers app:', error)
    process.exit(1)
  })
