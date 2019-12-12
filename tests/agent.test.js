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
            jest.clearAllMocks()
            await agent.destroy()
            wss.close(done)
        })

        it('should start even without inspector', (done) => {
            wss = new WebSocket.Server({
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100'
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')
                    done()
                })
            })
        })

        it('should start and use CPU profiling', (done) => {
            wss = new WebSocket.Server({
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
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
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100'
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

        it('should stop CPU profiling but failed (no start)', (done) => {
            wss = new WebSocket.Server({
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
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
                        ws.send('cpu_profiling_stop')
                    })
                })
            })
        })

        it('should start and use CPU profiling with custom max duration', (done) => {
            wss = new WebSocket.Server({
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
                    inspector: {
                        storage: {
                            type: 'raw'
                        }
                    }
                })

                agent.ws.on('open', () => {
                    const mockCallback = jest.spyOn(agent._events, 'cpu_profiling_stop')
                    expect(typeof agent.addEvent).toEqual('function')

                    setTimeout(() => {
                        expect(mockCallback.mock.calls.length).toEqual(1)
                        done()
                    }, 350)

                    wss.clients.forEach(ws => {
                        ws.send('{"name":"cpu_profiling_start","data":{"duration":200}}')
                    })
                })
            })
        })

        it('should start and use CPU profiling with custom max duration but stop manually before the expiration', (done) => {
            wss = new WebSocket.Server({
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
                    inspector: {
                        storage: {
                            type: 'raw'
                        }
                    }
                })

                agent.ws.on('open', () => {
                    const mockCallback = jest.spyOn(agent._events, 'cpu_profiling_stop')
                    expect(typeof agent.addEvent).toEqual('function')

                    setTimeout(() => {
                        expect(mockCallback.mock.calls.length).toEqual(0)
                        wss.clients.forEach(ws => {
                            ws.send('cpu_profiling_stop')
                        })
                    }, 100)

                    setTimeout(() => {
                        expect(mockCallback.mock.calls.length).toEqual(1)
                        expect(mockCallback.mock.results[0].value).toEqual(0)
                        done()
                    }, 300)

                    wss.clients.forEach(ws => {
                        ws.send('{"name":"cpu_profiling_start","data":{"duration":200}}')
                    })
                })
            })
        })

        it('should start and use unkonwn event', (done) => {
            wss = new WebSocket.Server({
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100'
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
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
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
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
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
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
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
                                port: 3100
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
                port: 3100
            })

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100'
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
