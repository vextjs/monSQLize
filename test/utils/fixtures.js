/**
 * P1 最小 fixtures/test utils。
 *
 * 说明：
 * - 当前只提供后续 P2/P3 可复用的最小样例数据工厂。
 * - 更完整的场景 fixture 会在对应阶段继续补齐。
 */

function createUserFixture(overrides = {}) {
    return {
        _id: overrides._id || 'user_1',
        username: overrides.username || 'alice',
        email: overrides.email || 'alice@example.com',
        status: overrides.status || 'active',
        ...overrides,
    };
}

function createOrderFixture(overrides = {}) {
    return {
        _id: overrides._id || 'order_1',
        userId: overrides.userId || 'user_1',
        amount: overrides.amount || 100,
        currency: overrides.currency || 'CNY',
        ...overrides,
    };
}

module.exports = {
    createUserFixture,
    createOrderFixture,
};

