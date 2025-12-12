/**
 * ESLint v9 Flat Config
 * 从 .eslintrc.js 迁移而来
 */

const js = require('@eslint/js');

module.exports = [
    // ESLint 推荐规则
    js.configs.recommended,
    
    // 全局配置
    {
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                // Node.js 全局变量
                __dirname: 'readonly',
                __filename: 'readonly',
                Buffer: 'readonly',
                console: 'readonly',
                process: 'readonly',
                require: 'readonly',
                module: 'readonly',
                exports: 'writable',
                global: 'readonly',
                setImmediate: 'readonly',
                clearImmediate: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                queueMicrotask: 'readonly',
            }
        },
        rules: {
            // 代码风格
            'indent': 'off',  // 暂时关闭缩进检查，项目代码风格已稳定
            'quotes': ['warn', 'single', { avoidEscape: true }],
            'semi': ['error', 'always'],
            'no-trailing-spaces': 'warn',
            
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
            
            // 错误预防
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-unreachable': 'error',
        }
    },
    
    // 测试文件特殊配置
    {
        files: ['test/**/*.js', '**/*.test.js'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                before: 'readonly',
                after: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                expect: 'readonly',
            }
        }
    },
    
    // 忽略文件
    {
        ignores: [
            'node_modules/',
            'coverage/',
            'old/',
            'reports/',
            '*.min.js',
            '.nyc_output/',
        ]
    }
];

