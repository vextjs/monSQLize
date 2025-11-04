module.exports = {
    env: {
        node: true,
        es2021: true,
        mocha: true,
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'commonjs',
    },
    rules: {
        // 代码风格
        'indent': ['error', 4, { SwitchCase: 1 }],
        'linebreak-style': ['warn', 'unix'], // Windows 使用 CRLF，降级为警告
        'quotes': ['warn', 'single', { avoidEscape: true }],
        'semi': ['error', 'always'],
        'no-trailing-spaces': 'warn',
        'eol-last': ['warn', 'always'],
        
        // 最佳实践
        'no-unused-vars': ['warn', { 
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
        }],
        'no-console': 'off', // 允许 console（日志库）
        'no-empty': ['error', { allowEmptyCatch: true }],
        'no-prototype-builtins': 'off',
        
        // ES6+
        'prefer-const': 'warn',
        'no-var': 'warn',
        'object-shorthand': 'warn',
        'prefer-arrow-callback': 'off',
        
        // 异步
        'require-await': 'warn',
        'no-return-await': 'off',
        
        // 错误预防
        'no-undef': 'error',
        'no-dupe-keys': 'error',
        'no-duplicate-case': 'error',
        'no-unreachable': 'error',
    },
    ignorePatterns: [
        'node_modules/',
        'coverage/',
        'old/',
        '*.min.js',
    ],
};

