'use strict';

const REQUIRED_ENV = [
    'MONSQLIZE_REAL_SSH_HOST',
    'MONSQLIZE_REAL_SSH_PORT',
    'MONSQLIZE_REAL_SSH_USERNAME',
    'MONSQLIZE_REAL_SSH_PASSWORD',
    'MONSQLIZE_REAL_MONGO_URI',
];

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function parsePositiveInteger(name, fallback) {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Environment variable ${name} must be a positive integer`);
    }
    return value;
}

function parseBoolean(name, fallback) {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }
    return !['0', 'false', 'FALSE', 'False'].includes(raw);
}

function redactMongoUri(uri) {
    return uri.replace(/(\/\/[^:/?#]+:)([^@]+)(@)/, '$1***$3');
}

function loadPrivateRealEnvConfig() {
    return {
        databaseName: process.env.MONSQLIZE_REAL_DATABASE_NAME || 'test',
        ssh: {
            host: requireEnv('MONSQLIZE_REAL_SSH_HOST'),
            port: parsePositiveInteger('MONSQLIZE_REAL_SSH_PORT'),
            username: requireEnv('MONSQLIZE_REAL_SSH_USERNAME'),
            password: requireEnv('MONSQLIZE_REAL_SSH_PASSWORD'),
        },
        mongoUri: requireEnv('MONSQLIZE_REAL_MONGO_URI'),
        remoteHost: process.env.MONSQLIZE_REAL_REMOTE_HOST || '127.0.0.1',
        remotePort: parsePositiveInteger('MONSQLIZE_REAL_REMOTE_PORT', 28017),
        serverSelectionTimeoutMS: parsePositiveInteger('MONSQLIZE_REAL_SERVER_SELECTION_TIMEOUT_MS', 10000),
        connectTimeoutMS: parsePositiveInteger('MONSQLIZE_REAL_CONNECT_TIMEOUT_MS', 15000),
        directConnection: parseBoolean('MONSQLIZE_REAL_DIRECT_CONNECTION', true),
    };
}

function formatRequiredEnv() {
    return REQUIRED_ENV.join(', ');
}

function getMissingRequiredEnv(env = process.env) {
    return REQUIRED_ENV.filter((name) => !env[name]);
}

module.exports = {
    formatRequiredEnv,
    getMissingRequiredEnv,
    loadPrivateRealEnvConfig,
    redactMongoUri,
};
