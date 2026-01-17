/**
 * Sync 模块导出
 *
 * @module lib/sync
 * @since v1.0.9
 */

const ChangeStreamSyncManager = require('./ChangeStreamSyncManager');
const SyncTarget = require('./SyncTarget');
const ResumeTokenStore = require('./ResumeTokenStore');
const { validateSyncConfig } = require('./SyncConfig');

module.exports = {
    ChangeStreamSyncManager,
    SyncTarget,
    ResumeTokenStore,
    validateSyncConfig
};

