const utils = require('./utils')

let wss
let agent

const checkResults = function (done, value) {
    wss.on('listening', () => {
        agent = utils.createAgent(3101)

        agent.ws.on('open', () => {
            expect(typeof agent.addEvent).toEqual('function')
            wss.clients.forEach(ws => {
                ws.on('message', (msg) => {
                    const event = JSON.parse(msg)
                    if (event.name === 'diagnosis_report') {
                        expect(event.data.response).toEqual(value)
                        done()
                    }
                })
                ws.send('{"name": "diagnosis_report"}')
            })
        })
    })
}

describe('Diagnosis report', () => {
    afterEach(async () => {
        jest.clearAllMocks()
        await agent.destroy()
        wss.close()
    })

    it('should start and answer not supported feature', (done) => {
        if (process.report && process.report.getReport) delete process.report
        wss = utils.createWSS(3101)
        checkResults(done, 'not supported')
    })

    it('should start and answer ok', (done) => {
        process.report = {
            getReport: () => { return { response: 'ok' } }
        }
        wss = utils.createWSS(3101)
        checkResults(done, 'ok')
    })
})
