import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginSitemap } from '@rspress/plugin-sitemap';

export default defineConfig({
  root: path.join(import.meta.dirname, '..', 'docs'),
  base: '/monSQLize/',
  title: 'monSQLize',
  icon: '/favicon.svg',
  description: 'A powerful TypeScript MongoDB ODM with full v1 API compatibility — featuring chain queries, multi-pool, transactions, caching, Saga, and slow-query logging.',
  outDir: 'dist',
  plugins: [
    pluginSitemap({
      siteUrl: 'https://vextjs.github.io/monSQLize'
    })
  ],
  markdown: {
    link: {
      checkDeadLinks: false
    }
  },
  search: {
    codeBlocks: true
  },
  themeConfig: {
    nav: [
      {
        text: '入门指南',
        link: '/getting-started'
      },
      {
        text: 'API 参考',
        link: '/api-index'
      },
      {
        text: 'Model',
        link: '/model'
      },
      {
        text: '高级能力',
        link: '/capability-index'
      },
      {
        text: 'Versions',
        items: [
          {
            text: 'v2.0.2 (Current TS)',
            link: '/getting-started'
          },
          {
            text: '更新日志',
            link: 'https://github.com/vextjs/monSQLize/blob/main/CHANGELOG.md'
          },
          {
            text: 'GitHub Pages',
            link: 'https://vextjs.github.io/monSQLize/'
          },
          {
            text: 'v1.x (Legacy JS)',
            link: 'https://github.com/vextjs/monSQLize/tree/v1'
          }
        ]
      }
    ],
    sidebar: {
      '/': [
        {
          text: '快速入门',
          items: [
            { text: '首页', link: '/' },
            { text: '快速开始', link: '/getting-started' },
            { text: '示例总览', link: '/examples' },
            { text: '连接管理', link: '/connection' },
            { text: 'ObjectId 自动转换', link: '/objectid-auto-convert' },
            { text: 'ESM 支持', link: '/esm-support' },
            { text: '文档索引', link: '/api-index' }
          ]
        },
        {
          text: '查询操作',
          items: [
            { text: 'find()', link: '/find' },
            { text: 'findOne()', link: '/findOne' },
            { text: 'findOneById()', link: '/find-one-by-id' },
            { text: 'findByIds()', link: '/find-by-ids' },
            { text: 'findPage()', link: '/findPage' },
            { text: 'findAndCount()', link: '/find-and-count' },
            { text: 'count()', link: '/count' },
            { text: 'distinct()', link: '/distinct' },
            { text: 'aggregate()', link: '/aggregate' },
            { text: 'explain()', link: '/explain' },
            { text: 'watch()', link: '/watch' }
          ]
        },
        {
          text: '链式查询',
          items: [
            { text: '链式 API 概览', link: '/chaining-api' },
            { text: '链式方法参考', link: '/chaining-methods' }
          ]
        },
        {
          text: '写入操作',
          items: [
            { text: '写入操作概览', link: '/write-operations' },
            { text: 'insertOne()', link: '/insert-one' },
            { text: 'insertMany()', link: '/insert-many' },
            { text: 'insertBatch()', link: '/insertBatch' },
            { text: 'updateOne()', link: '/update-one' },
            { text: 'updateMany()', link: '/update-many' },
            { text: 'updateBatch()', link: '/updateBatch' },
            { text: '更新操作参考', link: '/update-operations' },
            { text: '聚合管道更新', link: '/update-aggregation' },
            { text: 'deleteOne()', link: '/delete-one' },
            { text: 'deleteMany()', link: '/delete-many' },
            { text: 'deleteBatch()', link: '/deleteBatch' },
            { text: 'replaceOne()', link: '/replace-one' },
            { text: 'findOneAndUpdate()', link: '/find-one-and-update' },
            { text: 'findOneAndReplace()', link: '/find-one-and-replace' },
            { text: 'findOneAndDelete()', link: '/find-one-and-delete' },
            { text: 'upsertOne()', link: '/upsert-one' },
            { text: '快速 Upsert 指南', link: '/upsert-guide' },
            { text: '快捷 Upsert', link: '/quick-upsert' },
            { text: 'incrementOne()', link: '/increment-one' }
          ]
        },
        {
          text: '表达式系统',
          items: [
            { text: '表达式函数参考', link: '/expression-functions' }
          ]
        },
        {
          text: '事务与 Saga',
          items: [
            { text: '事务管理', link: '/transaction' },
            { text: '事务优化', link: '/transaction-optimizations' },
            { text: 'Saga 分布式事务', link: '/saga-transaction' },
            { text: 'Saga 高级特性', link: '/saga-advanced' }
          ]
        },
        {
          text: '缓存系统',
          items: [
            { text: '缓存 API 概览', link: '/cache-and-function-cache' },
            { text: 'Cache API', link: '/cache' },
            { text: 'FunctionCache', link: '/function-cache' }
          ]
        },
        {
          text: 'Model 层',
          items: [
            { text: 'Model 概览', link: '/model' },
            { text: 'Populate API', link: '/populate' },
            { text: 'Relations API', link: '/relations' },
            { text: 'Hooks API', link: '/hooks' },
            { text: 'Relations 与 Populate', link: '/model/relations' },
            { text: '嵌套 Populate', link: '/model/nested-populate' },
            { text: 'Relations 快速上手', link: '/model/relations-quickstart' }
          ]
        },
        {
          text: '连接池',
          items: [
            { text: '多连接池管理', link: '/multi-pool' },
            { text: '健康检查', link: '/multi-pool-health-check' },
            { text: '链式池访问 API', link: '/pool-chain-api' },
            { text: 'readPreference', link: '/readPreference' }
          ]
        },
        {
          text: '索引管理',
          items: [
            { text: '创建索引', link: '/create-index' },
            { text: '批量创建索引', link: '/create-indexes' },
            { text: '删除索引', link: '/drop-index' },
            { text: '列出索引', link: '/list-indexes' }
          ]
        },
        {
          text: '高级能力',
          items: [
            { text: '能力索引', link: '/capability-index' },
            { text: '慢查询日志', link: '/slow-query-log' },
            { text: '业务锁', link: '/business-lock' },
            { text: '书签分页', link: '/bookmarks' },
            { text: '数量队列', link: '/count-queue' },
            { text: '事件系统', link: '/events' },
            { text: '数据库管理', link: '/admin' },
            { text: '集合管理', link: '/collection-management' },
            { text: 'Change Stream 同步', link: '/sync-backup' },
            { text: 'SSH 隧道', link: '/ssh-tunnel' },
            { text: '数据库操作', link: '/database-ops' }
          ]
        },
        {
          text: '分布式部署',
          items: [
            { text: '分布式部署指南', link: '/distributed-deployment' },
            { text: '快速参考', link: '/distributed-deployment-quickref' }
          ]
        },
        {
          text: '参考',
          items: [
            { text: '错误码参考', link: '/error-codes' },
            { text: '数据验证', link: '/validation' },
            { text: '工具方法', link: '/utilities' },
            { text: 'ObjectId 转换范围', link: '/objectid-conversion-scope' },
            { text: 'ObjectId 跨版本', link: '/objectid-cross-version' },
            { text: 'ObjectId 跨版本 FAQ', link: '/objectid-cross-version-faq' },
            { text: 'ObjectId 日志优化', link: '/objectid-logging-optimization' },
            { text: 'MongoDB Driver 兼容性', link: '/mongodb-driver-compatibility' },
            { text: 'MongoDB 原生 vs 扩展', link: '/mongodb-native-vs-extensions' },
            { text: 'findOneAnd 返回值统一', link: '/findOneAnd-return-value-unified' }
          ]
        }
      ]
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/vextjs/monSQLize'
      }
    ],
    footer: {
      message: 'Released under the Apache License 2.0.'
    }
  }
});
