const os = require('os')
const WebSocket = require('ws')
const Inspector = require('inspector-api')

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
        if (!events[msg]) return console.warn(`Event ${msg} not handled!\nYou can use the addEvent() method to attach an action to a specific event.`)
        events[msg](msg, inspector)
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
        }
    }
}

const events = {
    cpu_profiling_start: (message, inspector) => {
        if (!inspector) return console.warn('Not inspector configuration found!')
        inspector.profiler.start()
    },
    cpu_profiling_stop: (message, inspector) => {
        if (!inspector) return console.warn('Not inspector configuration found!')
        inspector.profiler.stop()
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
