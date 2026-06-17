/**
 * Shared safety checks for database drop operations.
 */

const PRODUCTION_ENV_NAMES = new Set(['production', 'prod', 'live']);

export function isProductionEnvironment(value: unknown = process.env['NODE_ENV']): boolean {
    if (typeof value !== 'string') {
        return false;
    }
    return PRODUCTION_ENV_NAMES.has(value.trim().toLowerCase());
}

