/**
 * Soft Delete Feature for Model
 *
 * Provides soft delete functionality:
 * - Mark documents as deleted instead of physical deletion
 * - Auto-filter deleted documents in queries
 * - Restore deleted documents
 * - Force physical deletion
 * - TTL index for auto-cleanup
 *
 * @module lib/model/features/soft-delete
 */

/**
 * Parse soft delete configuration
 * @param {Object|boolean} config - Soft delete config
 * @returns {Object|null} Parsed config or null if disabled
 */
function parseSoftDeleteConfig(config) {
    if (!config) return null;

    // shorthand: softDelete: true
    if (config === true) {
        return {
            enabled: true,
            field: 'deletedAt',
            type: 'timestamp',
            ttl: null
        };
    }

    // full config: softDelete: { ... }
    return {
        enabled: config.enabled !== false,
        field: config.field || 'deletedAt',
        type: config.type || 'timestamp',
        ttl: config.ttl || null
    };
}

/**
 * Get delete value based on type
 * @param {string} type - 'timestamp' or 'boolean'
 * @returns {Date|boolean} Delete value
 */
function getDeleteValue(type) {
    return type === 'boolean' ? true : new Date();
}

/**
 * Apply soft delete filter to query
 * @param {Object} filter - Original filter
 * @param {Object} config - Soft delete config
 * @param {Object} options - Query options
 * @returns {Object} Modified filter
 */
function applySoftDeleteFilter(filter, config, options = {}) {
    if (!config?.enabled) return filter;

    const field = config.field;

    // Already has explicit deletedAt filter - don't modify
    if (filter[field] !== undefined) {
        return filter;
    }

    // withDeleted: include all (no filter)
    if (options.withDeleted) {
        return filter;
    }

    // onlyDeleted: only deleted documents
    if (options.onlyDeleted) {
        return {
            ...filter,
            [field]: { $ne: null }
        };
    }

    // default: only non-deleted documents
    return {
        ...filter,
        [field]: null
    };
}

/**
 * Register soft delete hooks
 * @param {Object} modelInstance - Model instance
 * @param {Object} config - Soft delete config
 */
function registerSoftDeleteHooks(modelInstance, config) {
    if (!config?.enabled) return;

    const field = config.field;
    const type = config.type;

    // Store original deleteOne and deleteMany methods
    const originalDeleteOne = modelInstance.collection.deleteOne.bind(modelInstance.collection);
    const originalDeleteMany = modelInstance.collection.deleteMany.bind(modelInstance.collection);

    // Override deleteOne - convert to updateOne
    modelInstance.collection.deleteOne = async function(filter, options = {}) {
        // Check if force delete (bypass soft delete)
        if (options._forceDelete) {
            delete options._forceDelete;
            return await originalDeleteOne(filter, options);
        }

        // Soft delete: convert to updateOne
        const updateResult = await modelInstance.collection.updateOne(
            filter,
            { $set: { [field]: getDeleteValue(type) } },
            options
        );

        // Convert updateOne result to deleteOne result format
        return {
            acknowledged: updateResult.acknowledged,
            deletedCount: updateResult.modifiedCount
        };
    };

    // Override deleteMany - convert to updateMany
    modelInstance.collection.deleteMany = async function(filter, options = {}) {
        // Check if force delete (bypass soft delete)
        if (options._forceDelete) {
            delete options._forceDelete;
            return await originalDeleteMany(filter, options);
        }

        // Soft delete: convert to updateMany
        const updateResult = await modelInstance.collection.updateMany(
            filter,
            { $set: { [field]: getDeleteValue(type) } },
            options
        );

        // Convert updateMany result to deleteMany result format
        return {
            acknowledged: updateResult.acknowledged,
            deletedCount: updateResult.modifiedCount
        };
    };

    // Store original find/findOne/count methods
    const originalFind = modelInstance.collection.find.bind(modelInstance.collection);
    const originalFindOne = modelInstance.collection.findOne.bind(modelInstance.collection);
    const originalCount = modelInstance.collection.count.bind(modelInstance.collection);

    // Override find - auto-filter deleted
    modelInstance.collection.find = async function(filter = {}, options = {}) {
        const modifiedFilter = applySoftDeleteFilter(filter, config, options);
        return await originalFind(modifiedFilter, options);
    };

    // Override findOne - auto-filter deleted
    modelInstance.collection.findOne = async function(filter = {}, options = {}) {
        const modifiedFilter = applySoftDeleteFilter(filter, config, options);
        return await originalFindOne(modifiedFilter, options);
    };

    // Override count - auto-filter deleted
    modelInstance.collection.count = async function(filter = {}, options = {}) {
        const modifiedFilter = applySoftDeleteFilter(filter, config, options);
        return await originalCount(modifiedFilter, options);
    };
}

/**
 * Add soft delete methods to ModelInstance
 * @param {Object} modelInstance - Model instance
 * @param {Object} config - Soft delete config
 */
function addSoftDeleteMethods(modelInstance, config) {
    if (!config?.enabled) return;

    const field = config.field;

    /**
     * Find documents including deleted ones
     * @param {Object} filter - Query filter
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Documents
     */
    modelInstance.findWithDeleted = async function(filter = {}, options = {}) {
        return await this.find(filter, { ...options, withDeleted: true });
    };

    /**
     * Find only deleted documents
     * @param {Object} filter - Query filter
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Deleted documents
     */
    modelInstance.findOnlyDeleted = async function(filter = {}, options = {}) {
        return await this.find(filter, { ...options, onlyDeleted: true });
    };

    /**
     * Find one document including deleted ones
     * @param {Object} filter - Query filter
     * @param {Object} options - Query options
     * @returns {Promise<Object|null>} Document
     */
    modelInstance.findOneWithDeleted = async function(filter = {}, options = {}) {
        return await this.findOne(filter, { ...options, withDeleted: true });
    };

    /**
     * Find one deleted document
     * @param {Object} filter - Query filter
     * @param {Object} options - Query options
     * @returns {Promise<Object|null>} Deleted document
     */
    modelInstance.findOneOnlyDeleted = async function(filter = {}, options = {}) {
        return await this.findOne(filter, { ...options, onlyDeleted: true });
    };

    /**
     * Count documents including deleted ones
     * @param {Object} filter - Query filter
     * @param {Object} options - Query options
     * @returns {Promise<number>} Count
     */
    modelInstance.countWithDeleted = async function(filter = {}, options = {}) {
        return await this.count(filter, { ...options, withDeleted: true });
    };

    /**
     * Count only deleted documents
     * @param {Object} filter - Query filter
     * @param {Object} options - Query options
     * @returns {Promise<number>} Count
     */
    modelInstance.countOnlyDeleted = async function(filter = {}, options = {}) {
        return await this.count(filter, { ...options, onlyDeleted: true });
    };

    /**
     * Restore a deleted document
     * @param {Object} filter - Query filter
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Update result
     */
    modelInstance.restore = async function(filter, options) {
        // Add deleted filter to ensure we only restore deleted documents
        const restoreFilter = {
            ...filter,
            [field]: { $ne: null }
        };

        return await this.updateOne(
            restoreFilter,
            { $unset: { [field]: 1 } },
            options
        );
    };

    /**
     * Restore multiple deleted documents
     * @param {Object} filter - Query filter
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Update result
     */
    modelInstance.restoreMany = async function(filter, options) {
        // Add deleted filter to ensure we only restore deleted documents
        const restoreFilter = {
            ...filter,
            [field]: { $ne: null }
        };

        return await this.updateMany(
            restoreFilter,
            { $unset: { [field]: 1 } },
            options
        );
    };

    /**
     * Force physical deletion (bypass soft delete)
     * @param {Object} filter - Query filter
     * @param {Object} options - Delete options
     * @returns {Promise<Object>} Delete result
     */
    modelInstance.forceDelete = async function(filter, options = {}) {
        // Set flag to bypass soft delete
        return await this.collection.deleteOne(filter, { ...options, _forceDelete: true });
    };

    /**
     * Force physical deletion of multiple documents
     * @param {Object} filter - Query filter
     * @param {Object} options - Delete options
     * @returns {Promise<Object>} Delete result
     */
    modelInstance.forceDeleteMany = async function(filter, options = {}) {
        // Set flag to bypass soft delete
        return await this.collection.deleteMany(filter, { ...options, _forceDelete: true });
    };
}

/**
 * Add TTL index for soft deleted documents
 * @param {Object} modelInstance - Model instance
 * @param {Object} config - Soft delete config
 */
function addTTLIndex(modelInstance, config) {
    if (!config?.enabled || !config.ttl) return;

    // Add TTL index to automatically clean up old deleted documents
    modelInstance.indexes.push({
        key: { [config.field]: 1 },
        expireAfterSeconds: config.ttl,
        name: `${config.field}_ttl`
    });
}

/**
 * Setup soft delete feature for a model
 * @param {Object} modelInstance - Model instance
 * @param {Object|boolean} config - Soft delete config
 */
function setupSoftDelete(modelInstance, config) {
    const parsedConfig = parseSoftDeleteConfig(config);

    if (!parsedConfig) return;

    // Store config on model instance
    modelInstance.softDeleteConfig = parsedConfig;

    // Register hooks
    registerSoftDeleteHooks(modelInstance, parsedConfig);

    // Add methods
    addSoftDeleteMethods(modelInstance, parsedConfig);

    // Add TTL index
    addTTLIndex(modelInstance, parsedConfig);
}

module.exports = {
    setupSoftDelete,
    parseSoftDeleteConfig,
    applySoftDeleteFilter,
    getDeleteValue
};

