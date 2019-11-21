module.exports = {
    verbose: true,
    collectCoverage: true,
    collectCoverageFrom: ['src/**/*.js', 'index.js'],
    coverageDirectory: './coverage',
    coverageThreshold: {
        global: {
            branches: 90,
            functions: 90,
            lines: 90,
            statements: 90
        }
    }
}
