const os = require('os')
const WebSocket = require('ws')
const Inspector = require('inspector-api')
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
    let ws = new WebSocket(`${config.serverUrl}/${os.hostname()}/${config.appName}`, WSSConfig)

    const ping = () => { heartbeat(ws, delay) }

    ws.on('ping', ping)
        .on('open', ping)

    ws.on('message', (msg) => {
        let eventName
        try {
            msg = JSON.parse(msg)
            eventName = msg.name
        } catch (e) {
            eventName = msg
        }
        if (!events[eventName]) return console.warn(`Event ${eventName} not handled!\nYou can use the addEvent() method to attach an action to a specific event.`)
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

let isCPUProfilingRunning = false

const events = {
    cpu_profiling_start: (message, ws, inspector) => {
        if (!inspector) return console.warn('Not inspector configuration found!')
        isCPUProfilingRunning = true
        inspector.profiler.start()

        const duration = (typeof message === 'object' && message.config && Number.isInteger(message.config.duration)) ? message.config.duration : 10000

        setTimeout(() => {
            if (isCPUProfilingRunning) events.cpu_profiling_stop(message, inspector)
        }, duration)
    },
    cpu_profiling_stop: async (message, ws, inspector) => {
        if (!inspector) {
            console.warn('Not inspector configuration found!')
            return 1
        }
        if (!isCPUProfilingRunning) {
            console.warn('No CPU profiling is running!')
            return 1
        }
        const data = await inspector.profiler.stop()
        isCPUProfilingRunning = false
        message.data = data
        ws.send(JSON.stringify(message))
        return 0
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
    code_coverage_start: async (message, ws, inspector) => {
        await inspector.profiler.startPreciseCoverage()
    },
    code_coverage_stop: async (message, ws, inspector) => {
        const data = await inspector.profiler.takePreciseCoverage()
        await inspector.profiler.stopPreciseCoverage()
        message.data = data
        ws.send(JSON.stringify(message))
    }
}

module.exports = (config = {}) => {
    if (!config.appName) {
        const msg = 'Can\'t start node health agent, no app name provided!'
        console.error(msg)
        return new Error(msg)
    }
    if (!config.serverUrl) {
        const msg = 'Can\'t start node health agent, no server url!'
        console.error(msg)
        return new Error(msg)
    }

    const destroyed = false
    let inspector

    if (config.inspector) {
        inspector = new Inspector(config.inspector)
        inspector.profiler.enable()
    }

    return connectToWSS(config, inspector, destroyed)
}
