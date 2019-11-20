const os = require('os')
const WebSocket = require('ws')
const Inspector = require('inspector-api')

const heartbeat = (ws) => {
    clearTimeout(ws.pingTimeout)

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    ws.pingTimeout = setTimeout(() => {
        ws.terminate()
    }, 30000 + 1000)
}

const connectToWSS = async (config, inspector) => {
    const WSSConfig = {}
    if (config.token) WSSConfig.headers = { token: config.token }
    const ws = new WebSocket(`${config.serverUrl}/${os.hostname()}/${config.appName}`, WSSConfig)

    ws.on('ping', () => { heartbeat(ws) })

    ws.on('open', () => {
        console.info('Connected to WS server.')
        heartbeat(ws)
    })

    ws.on('message', (msg) => {
        if (!events[msg]) return console.warn(`Event ${msg} not handled!\nYou can use the addEvent() method to attach an action to a specific event.`)
        events[msg](msg, inspector)
    })

    ws.on('close', async () => {
        ws.terminate()
        await connectToWSS(config, inspector)
        clearTimeout(ws.pingTimeout)
    })

    ws.on('error', async (err) => {
        ws.terminate()
    })
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
        console.error('Can\'t start node health agent, no app name provided!')
        return
    }
    if (!config.serverUrl) {
        console.error('Can\'t start node health agent, no server url!')
        return
    }

    let inspector
    if (config.inspector) {
        inspector = new Inspector(config.inspector)
        inspector.profiler.enable()
    }

    connectToWSS(config, inspector)

    return {
        addEvent: (event, fn) => {
            events[event] = fn
        }
    }
}
