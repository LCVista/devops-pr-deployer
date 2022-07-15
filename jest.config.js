
module.exports = {
    clearMocks: true,
    moduleFileExtensions: ['js', 'ts'],
    testEnvironment: 'node',
    testMatch: ['**/*.spec.ts'],
    testRunner: 'jest-circus/runner',
    transform: {
        '^.+\\.ts$': 'ts-jest'
    },
    verbose: true
}
process.env = Object.assign(process.env, {
    GITHUB_REPOSITORY: "peter-evans/slash-command-dispatch"
})