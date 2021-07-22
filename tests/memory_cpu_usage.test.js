const utils = require('./utils')

describe('Memory & CPU usage', () => {
    let wss
    let agent

    afterEach(async () => {
        jest.clearAllMocks()
        await agent.destroy()
        wss.close()
    })

    it('should start and get memory and CPU info', (done) => {
        wss = utils.createWSS(3102)

        wss.on('listening', () => {
            agent = utils.createAgent(3102)

            agent.ws.on('open', () => {
                wss.clients.forEach(ws => {
                    ws.on('message', (msg) => {
                        const event = JSON.parse(msg)
                        if (event.name === 'memory_cpu_usage') {
                            expect(event.data.totalmem).toEqual(require('os').totalmem())
                            expect(typeof event.data.freemem).toEqual('number')
                            expect(event.data.cpus.length).toEqual(require('os').cpus().length)
                            expect(Object.hasOwnProperty.call(event.data.memoryUsage, 'heapTotal')).toEqual(true)
                            expect(Object.hasOwnProperty.call(event.data.memoryUsage, 'heapUsed')).toEqual(true)
                            done()
                        }
                    })
                    ws.send('{"name": "memory_cpu_usage"}')
                })
            })
        })
    })
})
