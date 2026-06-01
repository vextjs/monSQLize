import { webcrypto } from 'node:crypto';

type GlobalWithOptionalCrypto = typeof globalThis & {
    crypto?: unknown;
};

export function ensureWebCryptoGlobal(): void {
    const target = globalThis as GlobalWithOptionalCrypto;
    if (target.crypto) {
        return;
    }

    Object.defineProperty(target, 'crypto', {
        configurable: true,
        enumerable: false,
        value: webcrypto,
        writable: false,
    });
}
