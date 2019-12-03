const WebSocket = require('ws')

describe('Agent', () => {
    describe('Errors', () => {
        it('should return an error cause no app name', () => {
            const err = require('../index')()
            expect(err.message).toEqual("Can't start node health agent, no app name provided!")
        })

        it('should return an error cause no endpoint', () => {
            const err = require('../index')({
                appName: 'test'
            })
            expect(err.message).toEqual("Can't start node health agent, no server url!")
        })
    })

    describe('Normal cases', () => {
        let wss
        let agent

        afterEach(async (done) => {
            await agent.destroy()
            wss.close(done)
        })

        it('should start even without inspector', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000'
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')
                    done()
                })
            })
        })

        it('should start and use CPU profiling', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000',
                    inspector: {
                        storage: {
                            type: 'raw'
                        }
                    }
                })

                agent.ws.on('open', () => {
                    agent.ws.on('message', (msg) => {
                        if (msg === 'cpu_profiling_stop') {
                            done()
                        }
                    })
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.send('cpu_profiling_start')
                        ws.send('cpu_profiling_stop')
                    })
                })
            })
        })

        it('should start and use CPU profiling but failed', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000'
                })

                agent.ws.on('open', () => {
                    agent.ws.on('message', (msg) => {
                        if (msg === 'cpu_profiling_stop') {
                            done()
                        }
                    })
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.send('cpu_profiling_start')
                        ws.send('cpu_profiling_stop')
                    })
                })
            })
        })

        it('should start and use unkonwn event', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000'
                })

                agent.ws.on('open', () => {
                    agent.ws.on('message', (msg) => {
                        if (msg === 'unknown_event') {
                            done()
                        }
                    })
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.send('unknown_event')
                    })
                })
            })
        })

        it('should start and use custom event', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000',
                    token: 'myToken'
                })

                agent.addEvent('custom_event', () => {
                    done()
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.send('custom_event')
                    })
                })
            })
        })

        // test reconnection after one hearbeat
        it('should start and terminate after one heartbeat', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000',
                    heartbeatDelay: 100,
                    autoReconnectDelay: 100
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')
                })

                // wait for a ping
                const timer = setTimeout(() => {
                    clearTimeout(timer)
                    done()
                }, 300)
            })
        })

        // test reconnection when server is down
        it('should start and and try to reconnect', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000',
                    autoReconnectDelay: 100
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.close(() => {
                        // wait more than autoReconnectDelay to be sure to generate an error
                        const timer = setTimeout(() => {
                            clearTimeout(timer)
                            // recreate server
                            wss = new WebSocket.Server({
                                port: 3000
                            })
                        }, 120)
                    })
                })

                const timer = setTimeout(() => {
                    clearTimeout(timer)
                    done()
                }, 300)
            })
        })

        it('should handle event as JSON object', (done) => {
            wss = new WebSocket.Server({
                port: 3000
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3000'
                })

                agent.addEvent('custom_event_json', (event) => {
                    expect(event.name).toEqual('custom_event_json')
                    expect(event.data.key).toEqual('value')
                    done()
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.send('{"name":"custom_event_json","data":{"key":"value"}}')
                    })
                })
            })
        })
    })
})
