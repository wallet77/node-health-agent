const WebSocket = require('ws')

module.exports = {
    createWSS: (port) => {
        return new WebSocket.Server({
            port: port
        })
    },

    createAgent: (port, conf) => {
        if (!conf) {
            conf = {
                appName: 'test',
                serverUrl: `ws://localhost:${port}`,
                inspector: {
                    storage: {
                        type: 'raw'
                    }
                }
            }
        }
        return require('../index')(conf)
    }
}
