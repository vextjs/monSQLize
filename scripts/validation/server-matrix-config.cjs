const memoryServerPolicy = require('../../config/mongodb-memory-server.json');

const REQUIRED_NODE_MAJORS = Object.freeze([20, 22]);
const INTEGRATION_TEST_CONCURRENCY = 1;

const REQUIRED_MONGODB_SERVER_VERSIONS = Object.freeze(
    memoryServerPolicy.requiredVersions.map((entry) => Object.freeze({ ...entry })),
);

function summarizeVersionProbes(results, requiredVersions = REQUIRED_MONGODB_SERVER_VERSIONS) {
    const missing = [];
    const failed = [];

    for (const required of requiredVersions) {
        const matches = results.filter((result) => result.version === required.version);
        if (matches.length !== 1) {
            missing.push(required.version);
            continue;
        }
        if (!matches[0].ready) {
            failed.push(required.version);
        }
    }

    return {
        ready: missing.length === 0 && failed.length === 0,
        missing,
        failed,
    };
}

function summarizeMatrixExecution(driverResults, expectedDriverCount, expectedResultsPerDriver) {
    const failures = [];

    if (driverResults.length !== expectedDriverCount) {
        failures.push(`expected ${expectedDriverCount} driver results, received ${driverResults.length}`);
    }

    for (const driverResult of driverResults) {
        if (driverResult.status !== 'verified') {
            failures.push(`${driverResult.driver}: ${driverResult.status}`);
        }
        if (driverResult.results.length !== expectedResultsPerDriver) {
            failures.push(
                `${driverResult.driver}: expected ${expectedResultsPerDriver} combinations, received ${driverResult.results.length}`,
            );
        }
        for (const result of driverResult.results) {
            if (result.status !== 'verified') {
                failures.push(`${driverResult.driver} / ${result.node || 'unknown node'} / ${result.mongo || 'unknown server'}: ${result.status}`);
            }
        }
    }

    return {
        ready: failures.length === 0,
        failures,
    };
}

function selectAdditionalVoltaNodeMajors(currentMajor, hasVolta) {
    if (!hasVolta) {
        return [];
    }
    return REQUIRED_NODE_MAJORS.filter((major) => major !== currentMajor);
}

module.exports = {
    INTEGRATION_TEST_CONCURRENCY,
    REQUIRED_NODE_MAJORS,
    REQUIRED_MONGODB_SERVER_VERSIONS,
    selectAdditionalVoltaNodeMajors,
    summarizeMatrixExecution,
    summarizeVersionProbes,
};
