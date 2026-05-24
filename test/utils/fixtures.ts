type UserFixture = {
    _id: string;
    username: string;
    email: string;
    status: string;
    [key: string]: unknown;
};

type OrderFixture = {
    _id: string;
    userId: string;
    amount: number;
    currency: string;
    [key: string]: unknown;
};

export function createUserFixture(overrides: Partial<UserFixture> = {}): UserFixture {
    return {
        _id: overrides._id || 'user_1',
        username: overrides.username || 'alice',
        email: overrides.email || 'alice@example.com',
        status: overrides.status || 'active',
        ...overrides,
    };
}

export function createOrderFixture(overrides: Partial<OrderFixture> = {}): OrderFixture {
    return {
        _id: overrides._id || 'order_1',
        userId: overrides.userId || 'user_1',
        amount: overrides.amount || 100,
        currency: overrides.currency || 'CNY',
        ...overrides,
    };
}