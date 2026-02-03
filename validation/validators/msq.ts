const MonSQLize = require('../../lib');

module.exports = () =>
    new MonSQLize({
        type: 'mongodb',
        databaseName: 'example',
        config: {
            useMemoryServer: true
        }
    });
