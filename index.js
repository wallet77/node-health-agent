const os = require('os')
const debug = require('debug')
const error = debug('node-health-agent:error')
const warn = debug('node-health-agent:warn')
warn.warn = console.warn.bind(console)
const WebSocket = require('ws')
const Inspector = require('inspector-api')
const { uuid } = require('uuidv4')
const utils = require('./utils')

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

    const ping = () => { heartbeat(ws, delay) }

    ws.on('ping', ping)
        .on('open', () => {
            ws.send(JSON.stringify({
                type: 'upgrade',
                appName: config.appName,
                hostname: hostname,
                additionalInfo: {
                    agentType: 'node',
                    agentVersion: require(`${__dirname}/package.json`).version,
                    nodeVersion: process.version,
                    env: process.env.NODE_ENV
                }
            }))
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
        destroy: async () => {
            destroyed = true
            if (inspector) await inspector.destroy()
            clearTimeout(ws.pingTimeout)
            ws.terminate()
        },
        ws: ws,
        addEvent: (event, fn) => {
            events[event] = fn
        },
        _events: events
    }
}

const isRunning = {
    isCPUProfilingRunning: false,
    isMemorySamplingRunning: false
}

const startFunction = function (inspector, message, runningName, profilerName, startFn, stopEventName) {
    if (!inspector) return warn('No inspector configuration found!')
    isRunning[runningName] = true
    inspector[profilerName][startFn]()

    const duration = (typeof message === 'object' && message.config && Number.isInteger(message.config.duration)) ? message.config.duration : 10000

    setTimeout(() => {
        if (isRunning[runningName]) events[stopEventName](message, inspector)
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
    return 0
}

const events = {
    cpu_profiling_start: (message, ws, inspector) => {
        return startFunction(inspector, message, 'isCPUProfilingRunning', 'profiler', 'start', 'cpu_profiling_stop')
    },
    cpu_profiling_stop: async (message, ws, inspector) => {
        return stopFunction(inspector, message, ws, 'isCPUProfilingRunning', 'profiler', 'stop', 'CPU profiling')
    },
    extract_env_var: (message, ws) => {
        message.data = process.env
        ws.send(JSON.stringify(message))
    },
    extract_package_file: (message, ws) => {
        try {
            message.data = require(`${__dirname}/../../package.json`)
        } catch (err) {
            message.data = {}
            error(err)
        }
        ws.send(JSON.stringify(message))
    },
    extract_dependencies: (message, ws) => {
        const data = utils.extractDependencies(require('path').join(__dirname, process.env.DEP_PATH || '..'))
        message.data = data
        ws.send(JSON.stringify(message))
    },
    memory_dump: async (message, ws, inspector) => {
        const data = await inspector.heap.takeSnapshot()
        message.data = data
        ws.send(JSON.stringify(message))
    },
    memory_sampling_start: (message, ws, inspector) => {
        return startFunction(inspector, message, 'isMemorySamplingRunning', 'heap', 'startSampling', 'memory_sampling_stop')
    },
    memory_sampling_stop: async (message, ws, inspector) => {
        return stopFunction(inspector, message, ws, 'isMemorySamplingRunning', 'heap', 'stopSampling', 'memory sampling')
    },
    code_coverage_start: async (message, ws, inspector) => {
        await inspector.profiler.startPreciseCoverage()
    },
    code_coverage_stop: async (message, ws, inspector) => {
        const data = await inspector.profiler.takePreciseCoverage()
        await inspector.profiler.stopPreciseCoverage()
        message.data = data
        ws.send(JSON.stringify(message))
    },
    diagnosis_report: (message, ws) => {
        let data = { response: 'not supported' }
        if (process.report && process.report.getReport) data = process.report.getReport()
        message.data = data
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
