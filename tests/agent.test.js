const WebSocket = require('ws')
const utils = require('./utils')
const semver = require('semver')

const cpuProfilingTest = (wss, agent, done, start = true) => {
    agent.ws.on('open', () => {
        agent.ws.on('message', (msg) => {
            msg = msg.toString('utf8')
            if (msg === 'cpu_profiling_stop') {
                done()
            }
        })
        expect(typeof agent.addEvent).toEqual('function')

        wss.clients.forEach(ws => {
            if (start) ws.send('cpu_profiling_start')
            ws.send('cpu_profiling_stop')
        })
    })
}

jest.setTimeout(10000)

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

        afterEach(async () => {
            jest.clearAllMocks()
            await agent.destroy()
            wss.close()
            wss.removeAllListeners()
        })

        it('should start even without inspector', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(null, {
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
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                cpuProfilingTest(wss, agent, done)
            })
        })

        it('should start and use CPU profiling but failed', (done) => {
            wss = utils.createWSS(3101)

            wss.on('listening', () => {
                agent = utils.createAgent(null, {
                    appName: 'test',
                    serverUrl: 'ws://localhost:3101'
                })

                cpuProfilingTest(wss, agent, done)
            })
        })

        it('should stop CPU profiling but failed (no start)', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                cpuProfilingTest(wss, agent, done, false)
            })
        })

        it('should start and use CPU profiling with custom max duration', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    const mockCallback = jest.spyOn(agent._events, 'cpu_profiling_stop')
                    expect(typeof agent.addEvent).toEqual('function')

                    setTimeout(() => {
                        expect(mockCallback.mock.calls.length).toEqual(1)
                        done()
                    }, 500)

                    wss.clients.forEach(ws => {
                        ws.send('{"name":"cpu_profiling_start","config":{"duration":200}}')
                    })
                })
            })
        })

        it('should start and use CPU profiling with custom max duration but stop manually before the expiration', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    const mockCallback = jest.spyOn(agent._events, 'cpu_profiling_stop')
                    expect(typeof agent.addEvent).toEqual('function')

                    setTimeout(() => {
                        expect(mockCallback.mock.calls.length).toEqual(0)
                        wss.clients.forEach(ws => {
                            ws.send('cpu_profiling_stop')
                        })
                    }, 100)

                    setTimeout(async () => {
                        expect(mockCallback.mock.calls.length).toEqual(1)
                        const res = await mockCallback.mock.results[0].value
                        expect(typeof res).toEqual('object')
                        done()
                    }, 400)

                    wss.clients.forEach(ws => {
                        ws.send('{"name":"cpu_profiling_start","config":{"duration":200}}')
                    })
                })
            })
        })

        it('should start and use CPU profiling with custom max duration but stop manually before the expiration', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    agent._events.cpu_profiling_start({}, agent.ws, agent.inspector)

                    setTimeout(async () => {
                        const profile = await agent._events.cpu_profiling_stop({}, agent.ws, agent.inspector)
                        expect(typeof profile).toEqual('object')
                        expect(Array.isArray(profile.nodes)).toEqual(true)
                        done()
                    }, 400)
                })
            })
        })

        it('should start and use unkonwn event', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    agent.ws.on('message', (msg) => {
                        msg = msg.toString('utf8')
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

        it('should start and use custom event (test waiting queue)', (done) => {
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

        it('should start and use custom event after WS is connected', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', async () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
                    token: 'myToken'
                })

                while (agent.ws.readyState === 0) {
                    await new Promise(resolve => setTimeout(resolve, 500))
                }

                agent.addEvent('custom_event', () => {
                    done()
                })

                wss.clients.forEach(ws => {
                    ws.send('custom_event')
                })
            })
        })

        // test reconnection after one hearbeat
        it('should start and terminate after one heartbeat', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = require('../index')({
                    appName: 'test',
                    serverUrl: 'ws://localhost:3100',
                    heartbeatDelay: 100,
                    autoReconnectDelay: 100
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')
                    wss.clients.forEach(ws => {
                        ws.ping()
                    })
                })

                // wait for a ping
                agent.ws.on('ping', () => {
                    // wait for the heartbeatDelay to expire
                    agent.ws.onclose = () => {
                        done()
                    }
                })
            })
        })

        // test reconnection when server is down
        it('should start and and try to reconnect', (done) => {
            wss = utils.createWSS(3100)

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
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.addEvent('custom_event_json', (event) => {
                    expect(event.name).toEqual('custom_event_json')
                    expect(event.config.key).toEqual('value')
                    done()
                })

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.send('{"name":"custom_event_json","config":{"key":"value"}}')
                    })
                })
            })
        })

        it('should start and use extract env variables', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.on('message', (msg) => {
                            const event = JSON.parse(msg)
                            if (event.name === 'extract_env_var') {
                                expect(typeof event.data).toEqual('object')
                                done()
                            }
                        })
                        ws.send('{"name": "extract_env_var"}')
                    })
                })
            })
        })

        it('should start and use extract package file', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.on('message', (msg) => {
                            const event = JSON.parse(msg)
                            if (event.name === 'extract_package_file') {
                                expect(typeof event.data).toEqual('object')
                                done()
                            }
                        })
                        ws.send('{"name": "extract_package_file"}')
                    })
                })
            })
        })

        it('should start and use extract dependencies but failed', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.on('message', (msg) => {
                            const event = JSON.parse(msg)
                            if (event.name === 'extract_dependencies') {
                                expect(typeof event.data).toEqual('object')
                                expect(Object.keys(event.data).length === 0)
                                done()
                            }
                        })
                        ws.send('{"name": "extract_dependencies"}')
                    })
                })
            })
        })

        it('should start and use extract dependencies', (done) => {
            wss = utils.createWSS(3100)

            process.env.DEP_PATH = '/tests/node_modules_folder_example'

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.on('message', (msg) => {
                            const event = JSON.parse(msg)
                            if (event.name === 'extract_dependencies') {
                                expect(typeof event.data).toEqual('object')
                                expect(event.data.fullDependencies.module1.version).toEqual('1.1.0')
                                expect(event.data.fullDependencies['@toto/module2'].version).toEqual('1.0.0')
                                expect(event.data.fullDependencies.module1.dependencies.module3).toEqual('x.y.z')
                                expect(event.data.fullDependencies.module4.version).toEqual('1.1.4')
                                done()
                            }
                        })
                        ws.send('{"name": "extract_dependencies"}')
                    })
                })
            })
        })

        it('should start and extract memory dump', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.on('message', (msg) => {
                            const event = JSON.parse(msg)
                            if (event.name === 'memory_dump') {
                                expect(typeof event.data).toEqual('object')
                                expect(typeof event.data.snapshot).toEqual('object')
                                expect(typeof event.data.nodes).toEqual('object')
                                done()
                            }
                        })
                        ws.send('{"name": "memory_dump"}')
                    })
                })
            })
        })

        if (semver.major(process.version) > 10) {
            it('should start and use code coverage', (done) => {
                wss = utils.createWSS(3100)

                wss.on('listening', () => {
                    agent = utils.createAgent(3100)

                    agent.ws.on('open', () => {
                        agent.ws.on('message', (msg) => {
                            msg = msg.toString('utf8')
                            if (msg === 'code_coverage_stop') {
                                done()
                            }
                        })
                        expect(typeof agent.addEvent).toEqual('function')

                        wss.clients.forEach(ws => {
                            ws.send('code_coverage_start')
                            ws.send('code_coverage_stop')
                        })
                    })
                })
            })
        }

        it('should start and use memory sampling', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    agent.ws.on('message', (msg) => {
                        msg = msg.toString('utf8')
                        if (msg === 'memory_sampling_stop') {
                            done()
                        }
                    })
                    expect(typeof agent.addEvent).toEqual('function')

                    wss.clients.forEach(ws => {
                        ws.on('message', (msg) => {
                            msg = msg.toString('utf8')
                            const event = JSON.parse(msg)
                            if (event.name === 'memory_sampling_stop') {
                                expect(typeof event.data).toEqual('object')
                                done()
                            }
                        })

                        ws.send('memory_sampling_start')
                        ws.send('memory_sampling_stop')
                    })
                })
            })
        })

        it('should send connection data', (done) => {
            wss = utils.createWSS(3100)

            wss.on('listening', () => {
                agent = utils.createAgent(3100)

                agent.ws.on('open', () => {
                    wss.clients.forEach(ws => {
                        ws.on('message', (msg) => {
                            const event = JSON.parse(msg)
                            if (event.type === 'upgrade') {
                                expect(event.appName).toEqual('test')
                                const hostname = event.hostname.split('_')[0]
                                expect(hostname).toEqual(require('os').hostname())
                                expect(event.additionalInfo.agentType).toEqual('node')
                                expect(event.additionalInfo.env).toEqual('test')
                                expect(typeof event.additionalInfo.nodeVersion).toEqual('string')
                                expect(typeof event.additionalInfo.agentVersion).toEqual('string')
                                done()
                            }
                        })
                    })
                    expect(typeof agent.addEvent).toEqual('function')
                })
            })
        })
    })
})
