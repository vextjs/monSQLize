import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import { pluginSitemap } from '@rspress/plugin-sitemap';

type SidebarItemSource = {
  en: string;
  zh: string;
  link: string;
};

type SidebarGroupSource = {
  en: string;
  zh: string;
  items: SidebarItemSource[];
};

const sidebarSource: SidebarGroupSource[] = [
  {
    en: 'Getting Started',
    zh: '快速入门',
    items: [
      { en: 'Home', zh: '首页', link: '/' },
      { en: 'Getting Started', zh: '快速开始', link: '/getting-started' },
      { en: 'Examples', zh: '示例总览', link: '/examples' },
      { en: 'Connection Management', zh: '连接管理', link: '/connection' },
      { en: 'ObjectId Auto Conversion', zh: 'ObjectId 自动转换', link: '/objectid-auto-convert' },
      { en: 'ESM Support', zh: 'ESM 支持', link: '/esm-support' },
      { en: 'Documentation Index', zh: '文档索引', link: '/api-index' }
    ]
  },
  {
    en: 'Query Operations',
    zh: '查询操作',
    items: [
      { en: 'find()', zh: 'find()', link: '/find' },
      { en: 'findOne()', zh: 'findOne()', link: '/findOne' },
      { en: 'findOneById()', zh: 'findOneById()', link: '/find-one-by-id' },
      { en: 'findByIds()', zh: 'findByIds()', link: '/find-by-ids' },
      { en: 'findPage()', zh: 'findPage()', link: '/findPage' },
      { en: 'findAndCount()', zh: 'findAndCount()', link: '/find-and-count' },
      { en: 'count()', zh: 'count()', link: '/count' },
      { en: 'distinct()', zh: 'distinct()', link: '/distinct' },
      { en: 'aggregate()', zh: 'aggregate()', link: '/aggregate' },
      { en: 'explain()', zh: 'explain()', link: '/explain' },
      { en: 'watch()', zh: 'watch()', link: '/watch' }
    ]
  },
  {
    en: 'Chain Queries',
    zh: '链式查询',
    items: [
      { en: 'Chain API Overview', zh: '链式 API 概览', link: '/chaining-api' },
      { en: 'Chain Method Reference', zh: '链式方法参考', link: '/chaining-methods' }
    ]
  },
  {
    en: 'Write Operations',
    zh: '写入操作',
    items: [
      { en: 'Write Operations Overview', zh: '写入操作概览', link: '/write-operations' },
      { en: 'insertOne()', zh: 'insertOne()', link: '/insert-one' },
      { en: 'insertMany()', zh: 'insertMany()', link: '/insert-many' },
      { en: 'insertBatch()', zh: 'insertBatch()', link: '/insertBatch' },
      { en: 'updateOne()', zh: 'updateOne()', link: '/update-one' },
      { en: 'updateMany()', zh: 'updateMany()', link: '/update-many' },
      { en: 'updateBatch()', zh: 'updateBatch()', link: '/updateBatch' },
      { en: 'Update Operations Reference', zh: '更新操作参考', link: '/update-operations' },
      { en: 'Aggregation Pipeline Updates', zh: '聚合管道更新', link: '/update-aggregation' },
      { en: 'deleteOne()', zh: 'deleteOne()', link: '/delete-one' },
      { en: 'deleteMany()', zh: 'deleteMany()', link: '/delete-many' },
      { en: 'deleteBatch()', zh: 'deleteBatch()', link: '/deleteBatch' },
      { en: 'replaceOne()', zh: 'replaceOne()', link: '/replace-one' },
      { en: 'findOneAndUpdate()', zh: 'findOneAndUpdate()', link: '/find-one-and-update' },
      { en: 'findOneAndReplace()', zh: 'findOneAndReplace()', link: '/find-one-and-replace' },
      { en: 'findOneAndDelete()', zh: 'findOneAndDelete()', link: '/find-one-and-delete' },
      { en: 'upsertOne()', zh: 'upsertOne()', link: '/upsert-one' },
      { en: 'Quick Upsert Guide', zh: '快速 Upsert 指南', link: '/upsert-guide' },
      { en: 'Quick Upsert', zh: '快捷 Upsert', link: '/quick-upsert' },
      { en: 'incrementOne()', zh: 'incrementOne()', link: '/increment-one' }
    ]
  },
  {
    en: 'Expression System',
    zh: '表达式系统',
    items: [
      { en: 'Expression Function Reference', zh: '表达式函数参考', link: '/expression-functions' }
    ]
  },
  {
    en: 'Transactions and Saga',
    zh: '事务与 Saga',
    items: [
      { en: 'Transaction Management', zh: '事务管理', link: '/transaction' },
      { en: 'Transaction Optimizations', zh: '事务优化', link: '/transaction-optimizations' },
      { en: 'Saga Distributed Transactions', zh: 'Saga 分布式事务', link: '/saga-transaction' },
      { en: 'Advanced Saga Features', zh: 'Saga 高级特性', link: '/saga-advanced' }
    ]
  },
  {
    en: 'Cache System',
    zh: '缓存系统',
    items: [
      { en: 'Cache API Overview', zh: '缓存 API 概览', link: '/cache-and-function-cache' },
      { en: 'Cache API', zh: 'Cache API', link: '/cache' },
      { en: 'FunctionCache', zh: 'FunctionCache', link: '/function-cache' }
    ]
  },
  {
    en: 'Model Layer',
    zh: 'Model 层',
    items: [
      { en: 'Model Overview', zh: 'Model 概览', link: '/model' },
      { en: 'Populate API', zh: 'Populate API', link: '/populate' },
      { en: 'Relations API', zh: 'Relations API', link: '/relations' },
      { en: 'Hooks API', zh: 'Hooks API', link: '/hooks' },
      { en: 'Relations and Populate', zh: 'Relations 与 Populate', link: '/model/relations' },
      { en: 'Nested Populate', zh: '嵌套 Populate', link: '/model/nested-populate' },
      { en: 'Relations Quick Start', zh: 'Relations 快速上手', link: '/model/relations-quickstart' }
    ]
  },
  {
    en: 'Connection Pools',
    zh: '连接池',
    items: [
      { en: 'Multi-Pool Management', zh: '多连接池管理', link: '/multi-pool' },
      { en: 'Health Checks', zh: '健康检查', link: '/multi-pool-health-check' },
      { en: 'Pool Chain API', zh: '链式池访问 API', link: '/pool-chain-api' },
      { en: 'readPreference', zh: 'readPreference', link: '/readPreference' }
    ]
  },
  {
    en: 'Index Management',
    zh: '索引管理',
    items: [
      { en: 'Create Index', zh: '创建索引', link: '/create-index' },
      { en: 'Create Indexes in Bulk', zh: '批量创建索引', link: '/create-indexes' },
      { en: 'Drop Index', zh: '删除索引', link: '/drop-index' },
      { en: 'List Indexes', zh: '列出索引', link: '/list-indexes' }
    ]
  },
  {
    en: 'Advanced Capabilities',
    zh: '高级能力',
    items: [
      { en: 'Capability Index', zh: '能力索引', link: '/capability-index' },
      { en: 'Slow Query Logging', zh: '慢查询日志', link: '/slow-query-log' },
      { en: 'Business Locks', zh: '业务锁', link: '/business-lock' },
      { en: 'Bookmark Pagination', zh: '书签分页', link: '/bookmarks' },
      { en: 'Count Queue', zh: '数量队列', link: '/count-queue' },
      { en: 'Event System', zh: '事件系统', link: '/events' },
      { en: 'Database Administration', zh: '数据库管理', link: '/admin' },
      { en: 'Collection Management', zh: '集合管理', link: '/collection-management' },
      { en: 'Change Stream Sync', zh: 'Change Stream 同步', link: '/sync-backup' },
      { en: 'SSH Tunnel', zh: 'SSH 隧道', link: '/ssh-tunnel' },
      { en: 'Database Operations', zh: '数据库操作', link: '/database-ops' }
    ]
  },
  {
    en: 'Distributed Deployment',
    zh: '分布式部署',
    items: [
      { en: 'Distributed Deployment Guide', zh: '分布式部署指南', link: '/distributed-deployment' },
      { en: 'Quick Reference', zh: '快速参考', link: '/distributed-deployment-quickref' }
    ]
  },
  {
    en: 'Reference',
    zh: '参考',
    items: [
      { en: 'Error Code Reference', zh: '错误码参考', link: '/error-codes' },
      { en: 'Data Validation', zh: '数据验证', link: '/validation' },
      { en: 'Utilities', zh: '工具方法', link: '/utilities' },
      { en: 'ObjectId Conversion Scope', zh: 'ObjectId 转换范围', link: '/objectid-conversion-scope' },
      { en: 'ObjectId Cross-Version', zh: 'ObjectId 跨版本', link: '/objectid-cross-version' },
      { en: 'ObjectId Cross-Version FAQ', zh: 'ObjectId 跨版本 FAQ', link: '/objectid-cross-version-faq' },
      { en: 'ObjectId Logging Optimization', zh: 'ObjectId 日志优化', link: '/objectid-logging-optimization' },
      { en: 'MongoDB Driver Compatibility', zh: 'MongoDB Driver 兼容性', link: '/mongodb-driver-compatibility' },
      { en: 'MongoDB Native vs Extensions', zh: 'MongoDB 原生 vs 扩展', link: '/mongodb-native-vs-extensions' },
      { en: 'findOneAnd Return Value Unification', zh: 'findOneAnd 返回值统一', link: '/findOneAnd-return-value-unified' }
    ]
  }
];

const localizeLink = (link: string, language: 'en' | 'zh') => {
  if (language === 'en') {
    return link;
  }

  return link === '/' ? '/zh/' : `/zh${link}`;
};

const createSidebar = (language: 'en' | 'zh') =>
  sidebarSource.map(group => ({
    text: group[language],
    items: group.items.map(item => ({
      text: item[language],
      link: localizeLink(item.link, language)
    }))
  }));

const englishSidebar = createSidebar('en');
const chineseSidebar = createSidebar('zh');

export default defineConfig({
  root: path.join(import.meta.dirname, '..', 'docs'),
  base: '/monSQLize/',
  lang: 'en',
  title: 'monSQLize',
  icon: '/favicon.svg',
  description: 'A powerful TypeScript MongoDB ODM with full v1 API compatibility — featuring chain queries, multi-pool, transactions, caching, Saga, and slow-query logging.',
  outDir: 'dist',
  locales: [
    {
      lang: 'en',
      label: 'English',
      title: 'monSQLize',
      description: 'A TypeScript MongoDB ODM and enhancement layer.'
    },
    {
      lang: 'zh',
      label: '简体中文',
      title: 'monSQLize',
      description: 'TypeScript MongoDB ODM 与增强层。'
    }
  ],
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
  languageParity: {
    enabled: true
  },
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/getting-started'
      },
      {
        text: 'API Reference',
        link: '/api-index'
      },
      {
        text: 'Model',
        link: '/model'
      },
      {
        text: 'Advanced',
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
            text: 'Changelog',
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
      '/': englishSidebar,
      '/zh/': chineseSidebar
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
