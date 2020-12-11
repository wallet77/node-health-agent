module.exports = {
    verbose: true,
    collectCoverage: true,
    collectCoverageFrom: ['index.js', 'utils.js'],
    coverageDirectory: './coverage'
}

jest.setTimeout(10000)
