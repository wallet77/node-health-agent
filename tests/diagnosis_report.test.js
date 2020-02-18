const WebSocket = require('ws')

describe('Diagnosis report', () => {
    let wss
    let agent

    afterEach(async (done) => {
        jest.clearAllMocks()
        await agent.destroy()
        wss.close(done)
    })

    it('should start and answer not supported feature', (done) => {
        wss = new WebSocket.Server({
            port: 3101
        })

        wss.on('listening', () => {
            agent = require('../index')({
                appName: 'test',
                serverUrl: 'ws://localhost:3101'
            })

            agent.ws.on('open', () => {
                expect(typeof agent.addEvent).toEqual('function')
                wss.clients.forEach(ws => {
                    ws.on('message', (msg) => {
                        const event = JSON.parse(msg)
                        if (event.name === 'diagnosis_report') {
                            expect(event.data.response).toEqual('not supported')
                            done()
                        }
                    })
                    ws.send('{"name": "diagnosis_report"}')
                })
            })
        })
    })

    it('should start and answer ok', (done) => {
        wss = new WebSocket.Server({
            port: 3101
        })

        process.report = {
            getReport: () => { return { response: 'ok' } }
        }

        wss.on('listening', () => {
            agent = require('../index')({
                appName: 'test',
                serverUrl: 'ws://localhost:3101'
            })

            agent.ws.on('open', () => {
                expect(typeof agent.addEvent).toEqual('function')
                wss.clients.forEach(ws => {
                    ws.on('message', (msg) => {
                        const event = JSON.parse(msg)
                        if (event.name === 'diagnosis_report') {
                            expect(event.data.response).toEqual('ok')
                            done()
                        }
                    })
                    ws.send('{"name": "diagnosis_report"}')
                })
            })
        })
    })
})
