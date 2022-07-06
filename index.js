const os = require('os')
const debug = require('debug')
const error = debug('node-health-agent:error')
const warn = debug('node-health-agent:warn')
warn.warn = console.warn.bind(console)
const WebSocket = require('ws')
const Inspector = require('inspector-api')
const { v4: uuid } = require('uuid')
const utils = require('./utils')
const path = require('path')

const heartbeat = (ws, delay) => {
    clearTimeout(ws.pingTimeout)

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    ws.pingTimeout = setTimeout(() => {
        ws.terminate()
    }, delay)
}

const connectToWSS = (config, inspector, destroyed) => {
    const WSSConfig = {}
    const delay = config.heartbeatDelay || 31000
    const autoReconnectDelay = config.autoReconnectDelay || 1000
    if (config.token) WSSConfig.headers = { token: config.token }
    const hostname = `${os.hostname()}_${uuid()}`
    let ws = new WebSocket(`${config.serverUrl}/${hostname}/${config.appName}`, WSSConfig)
    ws.nodeHealth = {
        waitingQueue: []
    }

    const ping = () => { heartbeat(ws, delay) }

    ws.on('ping', ping)
        .on('open', () => {
            const upgrade = {
                type: 'upgrade',
                appName: config.appName,
                hostname,
                additionalInfo: {
                    agentType: 'node',
                    agentVersion: require(path.join(__dirname, '/package.json')).version,
                    appVersion: utils.extractPackageFile().version,
                    nodeVersion: process.version,
                    env: process.env.NODE_ENV
                }
            }

            // checked postponed events because socket wasn't ready
            if (ws.nodeHealth.waitingQueue.length > 0) {
                upgrade.additionalInfo.customEvents = ws.nodeHealth.waitingQueue
            }

            ws.send(JSON.stringify(upgrade))

            ws.nodeHealth.waitingQueue = []
        })

    ws.on('message', (msg) => {
        let eventName
        try {
            msg = JSON.parse(msg)
            eventName = msg.name
        } catch (e) {
            eventName = msg
        }
        if (!events[eventName]) return warn(`Event ${eventName} not handled!\nYou can use the addEvent() method to attach an action to a specific event.`)
        events[eventName](msg, ws, inspector)
    })

    ws.on('close', () => {
        ws.terminate()
        clearTimeout(ws.pingTimeout)
        if (!destroyed) {
            setTimeout(() => {
                ws.removeAllListeners()
                ws = (connectToWSS(config, inspector, destroyed)).ws
            }, autoReconnectDelay)
        }
    })

    ws.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
            ws.removeAllListeners()
            ws = (connectToWSS(config, inspector, destroyed)).ws
        }

        ws.terminate()
        error(err)
    })

    return {
        inspector,
        destroy: async () => {
            destroyed = true
            if (inspector) await inspector.destroy()
            clearTimeout(ws.pingTimeout)
            ws.terminate()
        },
        ws,
        addEvent: (event, fn) => {
            events[event] = fn
            // if WS is not connected
            // set event in waiting queue
            if (ws.readyState === 0) {
                ws.nodeHealth.waitingQueue.push(event)
                return
            }

            // send event immediately
            const data = {
                data: {
                    event
                },
                hostname,
                name: 'addEvent',
                type: 'json'
            }
            ws.send(JSON.stringify(data))
        },
        _events: events
    }
}

const isRunning = {
    isCPUProfilingRunning: false,
    isMemorySamplingRunning: false
}

const startFunction = function (inspector, message, runningName, profilerName, startFn, stopEventName, ws) {
    if (!inspector) return warn('No inspector configuration found!')
    isRunning[runningName] = true
    inspector[profilerName][startFn]()

    const duration = (typeof message === 'object' && message.config && Number.isInteger(message.config.duration)) ? message.config.duration : 10000

    setTimeout(() => {
        message.name = stopEventName
        if (isRunning[runningName]) events[stopEventName](message, ws, inspector)
    }, duration)
}

const stopFunction = async function (inspector, message, ws, runningName, profilerName, stopFn, action) {
    if (!inspector) {
        warn('No inspector configuration found!')
        return 1
    }
    if (!isRunning[runningName]) {
        warn(`No ${action} is running!`)
        return 1
    }
    const data = await inspector[profilerName][stopFn]()
    isRunning[runningName] = false
    message.data = data
    ws.send(JSON.stringify(message))
    return data
}

const events = {
    cpu_profiling_start: (message, ws, inspector) => {
        return startFunction(inspector, message, 'isCPUProfilingRunning', 'profiler', 'start', 'cpu_profiling_stop', ws)
    },
    cpu_profiling_stop: async (message, ws, inspector) => {
        return stopFunction(inspector, message, ws, 'isCPUProfilingRunning', 'profiler', 'stop', 'CPU profiling')
    },
    extract_env_var: (message, ws) => {
        message.data = process.env
        ws.send(JSON.stringify(message))
    },
    extract_package_file: (message, ws) => {
        message.data = utils.extractPackageFile()
        ws.send(JSON.stringify(message))
    },
    extract_dependencies: (message, ws) => {
        const packageFile = utils.extractPackageFile()
        const data = utils.extractDependencies(require('path').join(__dirname, process.env.DEP_PATH || '..'))
        message.data = {
            dependencies: packageFile.dependencies,
            fullDependencies: data
        }
        ws.send(JSON.stringify(message))
    },
    memory_dump: async (message, ws, inspector) => {
        const data = await inspector.heap.takeSnapshot()
        message.data = data
        ws.send(JSON.stringify(message))
    },
    memory_sampling_start: (message, ws, inspector) => {
        return startFunction(inspector, message, 'isMemorySamplingRunning', 'heap', 'startSampling', 'memory_sampling_stop', ws)
    },
    memory_sampling_stop: async (message, ws, inspector) => {
        return stopFunction(inspector, message, ws, 'isMemorySamplingRunning', 'heap', 'stopSampling', 'memory sampling')
    },
    code_coverage_start: async (message, ws, inspector) => {
        return startFunction(inspector, message, 'isCoverageRunning', 'profiler', 'startPreciseCoverage', 'code_coverage_stop', ws)
    },
    code_coverage_stop: async (message, ws, inspector) => {
        const data = await stopFunction(inspector, message, ws, 'isCoverageRunning', 'profiler', 'takePreciseCoverage', 'code coverage')
        await inspector.profiler.stopPreciseCoverage()
        return data
    },
    diagnosis_report: (message, ws) => {
        let data = { response: 'not supported' }
        if (process.report && process.report.getReport) data = process.report.getReport()
        message.data = data
        ws.send(JSON.stringify(message))
    },
    memory_cpu_usage: (message, ws) => {
        message.data = {
            totalmem: os.totalmem(),
            freemem: os.freemem(),
            cpus: os.cpus(),
            memoryUsage: process.memoryUsage()
        }
        ws.send(JSON.stringify(message))
    }
}

module.exports = (config = {}) => {
    if (!config.appName) {
        const msg = 'Can\'t start node health agent, no app name provided!'
        error(msg)
        return new Error(msg)
    }
    if (!config.serverUrl) {
        const msg = 'Can\'t start node health agent, no server url!'
        error(msg)
        return new Error(msg)
    }

    const destroyed = false
    let inspector

    if (config.inspector) {
        inspector = new Inspector(config.inspector)
        inspector.profiler.enable()
        inspector.heap.enable()
    }

    return connectToWSS(config, inspector, destroyed)
}
