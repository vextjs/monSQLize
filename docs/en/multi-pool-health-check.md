# Detailed explanation of the multi-connection pool health check mechanism

> **Creation time**: 2026-02-03
> **Applicable version**: v1.0.8+

---

## 📋 Table of Contents

- [Overview of health check mechanism](#overview-of-health-check-mechanism)
- [Problem Discovery Mechanism](#problem-discovery-mechanism)
- [Problem handling process](#problem-handling-process)
- [Operation and maintenance notification method](#operation-and-maintenance-notification-method)
- [Monitoring integration solution](#monitoring-integration-solution)
- [Alarm configuration example](#alarm-configuration-example)
- [FAQ](#faq)

---

## Overview of health check mechanism

## Working principle

The health checker (HealthChecker) regularly performs health checks on all connection pools. When problems are found, it will automatically mark the status of the connection pool and trigger failover.

```text
┌─────────────────────────────────────────────────────────┐
│ Health check loop (every 5 seconds) │
└─────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        │                                    │
[Connection Pool 1] [Connection Pool 2]
        │                                    │
        ↓                                    ↓
execute ping execute ping
        │                                    │
    ┌───┴───┐                            ┌───┴───┐
│ Success │ │ Failure │
    └───┬───┘                            └───┬───┘
        │                                    │
        ↓                                    ↓
Status: up consecutive failures +1
                                              │
≥ 3 times?
                                              │
                                              ↓
Status: down
                                              │
                                              ↓
🔔 Trigger alarm
```


## Health status

| Status | Meaning | selectPool behavior | Recovery method |
|------|------|----------------|---------|
| **up** | Health | ✅ Normal use | - |
| **down** | Failure | ❌ Skip this pool and use other healthy pools | Automatically recover after successful health check |
| **unknown** | Unknown | ⚠️ Use with caution | Confirmed after first health check |

---

## Problem discovery mechanism


## 1. Health check automatic discovery

**Checking method**: Use MongoDB’s `db.admin().ping()` command

**Trigger conditions**:
- Periodic check (default every 5 seconds)
- Timeout (default 3 seconds)
- Continuous failure threshold (default 3 times)

**Code Example**:
```javascript
// Health-check flow used by the pool manager
async _checkHealth(poolName) {
    const pool = this._poolManager._getPool(poolName);

    try {
        //Execute ping command
        await pool.db().admin().ping();

        //Success: reset failure count
        this.updateStatus(poolName, 'up', null);

    } catch (error) {
        //Failure: Increase failure count
        const currentStatus = this._status.get(poolName);
        currentStatus.consecutiveFailures++;

        //Threshold reached: marked as down
        if (currentStatus.consecutiveFailures >= config.retries) {
            this.updateStatus(poolName, 'down', error);

            //🔔 Trigger events (can be used for alarms)
            this.emit('poolDown', poolName, error);
        }
    }
}
```


## 2. Found when selectingPool

**Trigger time**: When selectPool tries to use a connection pool

**Discovery**:
```javascript
selectPool(operation, options) {
    //Get a list of healthy connection pools
    let candidates = this._getHealthyPools();

    //If there is no healthy pool
    if (candidates.length === 0) {
        //🔔 Alarm triggered: All connection pools failed
        this._logger.error('[CRITICAL] All connection pools failed and services cannot be provided');

        //Processed according to failover strategy
        if (this._fallbackConfig.enabled) {
            candidates = this._handleAllPoolsDown(operation);
        } else {
            throw new Error('No available connection pool');
        }
    }

    // ...
}
```


## 3. Found during actual use

**Trigger timing**: Connection failed when executing query

**Processing method**:
```javascript
//Catching errors in user code
try {
    const pool = manager.selectPool('read');
    const data = await pool.collection('users').find({}).toArray();
} catch (error) {
    //🔔 Record errors and alert
    logger.error('Query failed', { error, poolName: pool?.name });

    // Query public health state and decide whether to alert or retry
    const health = manager.getPoolHealth();
    logger.warn('Current pool health', health);
}
```

---

## Problem handling process


## Automatic processing process

```text
Problem discovery
    ↓
┌──────────────┐
│ Status: down │
└──────────────┘
    ↓
┌──────────────────────────────┐
│ selectPool automatically skips the connection pool │
└──────────────────────────────┘
    ↓
┌──────────────────────────────┐
│ Choose from other health pools │
└──────────────────────────────┘
    ↓
┌──────────────────────────────┐
│ If there is no health pool, implement the downgrade strategy │
└──────────────────────────────┘
    ↓
├─ readonly: only read operations are allowed
├─ secondary: use replica pool
└─ error: throw an error
```


## Downgrade strategy example

```javascript
const manager = new ConnectionPoolManager({
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'readonly',  //Read-only is allowed when the main database fails
        retryDelay: 1000,
        maxRetries: 3
    }
});

//Behavior when the main database fails
try {
    const pool = manager.selectPool('write');  // Write operation
    // If the primary database is down:
    // - readonly strategy: throw an error (write is not allowed)
    // - secondary strategy: use replicas (possibly write to replicas)
    // - error strategy: throw an error directly
} catch (error) {
    if (error.message.includes('readonly')) {
        // Downgrade to read-only mode
        logger.warn('The main database fails and the system enters read-only mode.');

        // Trigger alarm
        sendAlert({
            level: 'critical',
            message: 'The main database fails and the system is downgraded to read-only mode.',
            time: new Date()
        });
    }
}
```


## Automatic recovery mechanism

```javascript
//HealthChecker continuously checks the down status of the connection pool
async _checkHealth(poolName) {
    const status = this._status.get(poolName);

    //Even if it is in the down state, it will still continue to check
    if (status.status === 'down') {
        try {
            await pool.db().admin().ping();

            //Check successful: immediately restore to up
            this.updateStatus(poolName, 'up', null);

            //🔔 Trigger recovery event
            this.emit('poolRecovered', poolName);

            this._logger.info(`[HealthChecker] Connection pool restored: ${poolName}`);

        } catch (error) {
            //Still fails and remains in down state
        }
    }
}
```

---

## Operation and maintenance notification method


## Method 1: Logging (Basic)

**Automatic recording**: monSQLize automatically records all health status changes

```javascript
//Pass in logger when creating the manager
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({
            filename: 'pool-error.log',
            level: 'error'
        }),
        new winston.transports.File({
            filename: 'pool-combined.log'
        })
    ]
});

const manager = new ConnectionPoolManager({
    logger
});

//The following events are automatically logged:
//[HealthChecker] Connection pool check failed: primary (1/3 consecutive failures)
//[HealthChecker] Connection pool check failed: primary (consecutive failures 2/3)
//[HealthChecker] Connection pool check failed: primary (failed 3/3 consecutively)
//[HealthChecker] Connection pool marked as failed: primary
//[CRITICAL] All connection pools failed and services cannot be provided
```

**Operation and maintenance view log**:
```bash
# Monitor error logs in real time
tail -f pool-error.log | grep -i "Failure\|critical\|down"

# Count the number of failures
grep "Connection pool marked as failed" pool-combined.log | wc -l

# View recent failures
grep "Connection pool marked as failed" pool-combined.log | tail -10
```


## Method 2: Regular monitoring (recommended)

**Check your health regularly**:

```javascript
//monitor.js – Monitoring script
const manager = require('./pool-manager');

//Check every 30 seconds
setInterval(async () => {
    const health = manager.getPoolHealth();
    const stats = manager.getPoolStats();

    //Check fault pool
    const downPools = [];
    for (const [name, status] of health.entries()) {
        if (status.status === 'down') {
            downPools.push({
                name,
                lastError: status.lastError?.message,
                downSince: new Date(status.lastCheck - (Date.now() - status.lastSuccess))
            });
        }
    }

    //There is a faulty pool: send an alarm
    if (downPools.length > 0) {
        console.error('⚠️Faulty connection pool found:', downPools);

        //🔔 Send alerts (multiple ways)
        await sendAlert({
            level: 'critical',
            message: `${downPools.length} connection pool failures`,
            pools: downPools,
            timestamp: new Date().toISOString()
        });
    }

    //Check error rate
    for (const [name, stat] of Object.entries(stats)) {
        if (stat.errorRate > 0.05) {  //Error rate > 5%
            console.warn(`⚠️ ${name} error rate is too high: ${(stat.errorRate * 100).toFixed(2)}%`);

            //🔔 Send a warning
            await sendAlert({
                level: 'warning',
                message: `Connection pool ${name} error rate is too high`,
                errorRate: stat.errorRate,
                timestamp: new Date().toISOString()
            });
        }
    }

    //Check response time
    for (const [name, stat] of Object.entries(stats)) {
        if (stat.avgResponseTime > 100) {  //Response time > 100ms
            console.warn(`⚠️ ${name} slow response: ${stat.avgResponseTime}ms`);
        }
    }

}, 30000);  //30 seconds
```

**Run monitoring script**:
```bash
# Run in the foreground (test)
node monitor.js

# Running in the background (production)
nohup node monitor.js > monitor.log 2>&1 &

# Run with PM2 (recommended)
pm2 start monitor.js --name "pool-monitor"
pm2 logs pool-monitor
```


## Method 3: Event Listening (Advanced)

**Extended HealthChecker support events** (needs to be implemented in code):

```javascript
//Add event triggering in HealthChecker
const EventEmitter = require('events');

class HealthChecker extends EventEmitter {
    updateStatus(poolName, status, error) {
        const oldStatus = this._status.get(poolName)?.status;

        //update status
        this._status.set(poolName, {
            status,
            consecutiveFailures: status === 'up' ? 0 : this._status.get(poolName).consecutiveFailures,
            lastCheck: Date.now(),
            lastSuccess: status === 'up' ? Date.now() : this._status.get(poolName).lastSuccess,
            lastError: error
        });

        //🔔 Trigger event
        if (oldStatus !== status) {
            this.emit('statusChanged', {
                poolName,
                oldStatus,
                newStatus: status,
                error
            });

            if (status === 'down') {
                this.emit('poolDown', { poolName, error });
            } else if (status === 'up' && oldStatus === 'down') {
                this.emit('poolRecovered', { poolName });
            }
        }
    }
}

//Use event listening when you own a custom health checker
const healthChecker = new HealthChecker();
healthChecker.on('poolDown', ({ poolName, error }) => {
    console.error(`🚨 Connection pool failure: ${poolName}`, error.message);

    //🔔 Send alert
    sendAlert({
        level: 'critical',
        message: `Connection pool ${poolName} failure`,
        error: error.message,
        timestamp: new Date().toISOString()
    });
});

healthChecker.on('poolRecovered', ({ poolName }) => {
    console.info(`✅ The connection pool has been restored: ${poolName}`);

    //🔔 Send recovery notification
    sendAlert({
        level: 'info',
        message: `Connection pool ${poolName} has been restored`,
        timestamp: new Date().toISOString()
    });
});
```

---

## Monitoring integration solution


## Option 1: Integrate Prometheus + Grafana

**Exposing Prometheus Metrics**:

```javascript
// prometheus-exporter.js
const prometheus = require('prom-client');
const express = require('express');
const manager = require('./pool-manager');

//Create indicator
const poolHealthGauge = new prometheus.Gauge({
    name: 'monsqlize_pool_health',
    help: 'Pool health status (1=up, 0=down)',
    labelNames: ['pool_name']
});

const poolConnectionsGauge = new prometheus.Gauge({
    name: 'monsqlize_pool_connections',
    help: 'Current number of connections',
    labelNames: ['pool_name']
});

const poolErrorRate = new prometheus.Gauge({
    name: 'monsqlize_pool_error_rate',
    help: 'Pool error rate (0-1)',
    labelNames: ['pool_name']
});

const poolResponseTime = new prometheus.Gauge({
    name: 'monsqlize_pool_avg_response_time_ms',
    help: 'Average response time in milliseconds',
    labelNames: ['pool_name']
});

//Metrics updated every 5 seconds
setInterval(() => {
    const health = manager.getPoolHealth();
    const stats = manager.getPoolStats();

    for (const [name, status] of health.entries()) {
        poolHealthGauge.set({ pool_name: name }, status.status === 'up' ? 1 : 0);
    }

    for (const [name, stat] of Object.entries(stats)) {
        poolConnectionsGauge.set({ pool_name: name }, stat.connections);
        poolErrorRate.set({ pool_name: name }, stat.errorRate);
        poolResponseTime.set({ pool_name: name }, stat.avgResponseTime);
    }
}, 5000);

//Expose /metrics endpoint
const app = express();
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheus.register.contentType);
    res.end(await prometheus.register.metrics());
});

app.listen(9090, () => {
    console.log('Prometheus exporter listening on :9090');
});
```

**Grafana Alert Rules**:
```yaml
# alert-rules.yml
groups:
  - name: monsqlize_alerts
    interval: 30s
    rules:
      - alert: PoolDown
        expr: monsqlize_pool_health == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Connection pool failure: {{ $labels.pool_name }}"
          description: "Connection pool {{ $labels.pool_name }} has been down for more than 1 minute"

      - alert: HighErrorRate
        expr: monsqlize_pool_error_rate > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "The connection pool error rate is too high: {{ $labels.pool_name }}"
          description: "Connection pool {{ $labels.pool_name }} error rate {{ $value }}, more than 5%"

      - alert: SlowResponse
        expr: monsqlize_pool_avg_response_time_ms > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Connection pool response is slow: {{ $labels.pool_name }}"
          description: "The average response time of connection pool {{ $labels.pool_name }} is {{ $value }}ms"
```


## Solution 2: Integrate Enterprise WeChat/DingTalk

**Send alert to corporate WeChat**:

```javascript
// alert.js
const axios = require('axios');

async function sendWeChatAlert(message) {
    const webhookUrl = process.env.WECHAT_WEBHOOK_URL;

    await axios.post(webhookUrl, {
        msgtype: 'markdown',
        markdown: {
            content: `
## 🚨 Connection pool alarm

**Level**: ${message.level}
**Time**: ${message.timestamp}
**Message**: ${message.message}

${message.details ? `**Details**: ${JSON.stringify(message.details, null, 2)}` : ''}

> Please handle it in time!
            `
        }
    });
}

async function sendDingTalkAlert(message) {
    const webhookUrl = process.env.DINGTALK_WEBHOOK_URL;

    await axios.post(webhookUrl, {
        msgtype: 'markdown',
        markdown: {
            title: 'Connection pool alarm',
            text: `
## 🚨 Connection pool alarm

- **Level**: ${message.level}
- **Time**: ${message.timestamp}
- **Message**: ${message.message}

${message.details ? `\n**Details**:\n\`\`\`\n${JSON.stringify(message.details, null, 2)}\n\`\`\`` : ''}
            `
        },
        at: {
            isAtAll: message.level === 'critical'
        }
    });
}

//use
await sendWeChatAlert({
    level: 'critical',
    message: 'Connection pool primary failure',
    timestamp: new Date().toISOString(),
    details: { error: 'Connection timeout' }
});
```


## Option 3: Integrate email alerts

```javascript
// email-alert.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendEmailAlert(message) {
    const mailOptions = {
        from: 'alerts@example.com',
        to: 'ops@example.com',
        subject: `🚨 [${message.level.toUpperCase()}] Connection pool alarm: ${message.message}`,
        html: `
<h2>Connection pool alarm</h2>
            <p><strong>Level</strong>: ${message.level}</p>
            <p><strong>Time</strong>: ${message.timestamp}</p>
            <p><strong>Message</strong>: ${message.message}</p>
            ${message.details ? `<pre>${JSON.stringify(message.details, null, 2)}</pre>` : ''}
            <hr>
<p>Please log in to the system in time to check the details and process it. </p>
        `
    };

    await transporter.sendMail(mailOptions);
}
```

---

## Alarm configuration example


## Complete production environment alarm system

```javascript
// alert-system.js
const manager = require('./pool-manager');
const { sendWeChatAlert } = require('./alert');

//Alarm configuration
const alertConfig = {
    //Minimum alarm interval (to avoid alarm bombing)
    minInterval: 5 * 60 * 1000,  //5 minutes

    //Alarm recipient
    receivers: {
        critical: ['ops@example.com', 'cto@example.com'],
        warning: ['ops@example.com'],
        info: ['dev@example.com']
    },

    //Alert rules
    rules: {
        poolDown: {
            level: 'critical',
            enabled: true,
            message: (poolName) => `Connection pool ${poolName} failure`
        },
        allPoolsDown: {
            level: 'critical',
            enabled: true,
            message: () => 'All connection pools fail and the system is unavailable'
        },
        highErrorRate: {
            level: 'warning',
            enabled: true,
            threshold: 0.05,  // 5%
            message: (poolName, rate) => `Connection pool ${poolName} error rate is too high (${(rate * 100).toFixed(2)}%)`
        },
        slowResponse: {
            level: 'warning',
            enabled: true,
            threshold: 100,  // 100ms
            message: (poolName, time) => `Connection pool ${poolName} responds slowly (${time}ms)`
        }
    }
};

//Alarm history (to avoid repeated alarms)
const alertHistory = new Map();

function shouldSendAlert(key) {
    const lastAlert = alertHistory.get(key);
    if (!lastAlert) return true;

    return Date.now() - lastAlert > alertConfig.minInterval;
}

function recordAlert(key) {
    alertHistory.set(key, Date.now());
}

//monitoring loop
setInterval(async () => {
    const health = manager.getPoolHealth();
    const stats = manager.getPoolStats();

    //Rule 1: Check the fault pool
    const downPools = [];
    for (const [name, status] of health.entries()) {
        if (status.status === 'down') {
            downPools.push(name);

            if (alertConfig.rules.poolDown.enabled && shouldSendAlert(`poolDown:${name}`)) {
                await sendAlert({
                    level: alertConfig.rules.poolDown.level,
                    message: alertConfig.rules.poolDown.message(name),
                    details: {
                        error: status.lastError?.message,
                        lastSuccess: new Date(status.lastSuccess).toISOString()
                    },
                    timestamp: new Date().toISOString()
                });
                recordAlert(`poolDown:${name}`);
            }
        }
    }

    //Rule 2: All pools fail
    if (downPools.length === health.size && alertConfig.rules.allPoolsDown.enabled) {
        if (shouldSendAlert('allPoolsDown')) {
            await sendAlert({
                level: alertConfig.rules.allPoolsDown.level,
                message: alertConfig.rules.allPoolsDown.message(),
                details: { downPools },
                timestamp: new Date().toISOString()
            });
            recordAlert('allPoolsDown');
        }
    }

    //Rule 3: High error rate
    if (alertConfig.rules.highErrorRate.enabled) {
        for (const [name, stat] of Object.entries(stats)) {
            if (stat.errorRate > alertConfig.rules.highErrorRate.threshold) {
                if (shouldSendAlert(`highErrorRate:${name}`)) {
                    await sendAlert({
                        level: alertConfig.rules.highErrorRate.level,
                        message: alertConfig.rules.highErrorRate.message(name, stat.errorRate),
                        details: {
                            errorRate: stat.errorRate,
                            totalRequests: stat.totalRequests
                        },
                        timestamp: new Date().toISOString()
                    });
                    recordAlert(`highErrorRate:${name}`);
                }
            }
        }
    }

    //Rule 4: Slow response
    if (alertConfig.rules.slowResponse.enabled) {
        for (const [name, stat] of Object.entries(stats)) {
            if (stat.avgResponseTime > alertConfig.rules.slowResponse.threshold) {
                if (shouldSendAlert(`slowResponse:${name}`)) {
                    await sendAlert({
                        level: alertConfig.rules.slowResponse.level,
                        message: alertConfig.rules.slowResponse.message(name, stat.avgResponseTime),
                        details: {
                            avgResponseTime: stat.avgResponseTime,
                            totalRequests: stat.totalRequests
                        },
                        timestamp: new Date().toISOString()
                    });
                    recordAlert(`slowResponse:${name}`);
                }
            }
        }
    }

}, 30000);  //Check every 30 seconds

//Send alarms uniformly (supports multiple methods)
async function sendAlert(message) {
    console.log(`📢 Send alert: ${message.message}`);

    //Send to corporate WeChat
    if (process.env.WECHAT_WEBHOOK_URL) {
        await sendWeChatAlert(message);
    }

    //Send email
    if (message.level === 'critical') {
        await sendEmailAlert(message);
    }

    //Record to alarm log
    alertLogger.log(message);
}
```

---

## FAQ


## Q1: Will health checks affect performance?

**A**: The impact is minimal.

- Only one lightweight `ping` command is executed for each check
- The check interval defaults to 5 seconds and can be adjusted to 10-30 seconds
- Asynchronous execution, does not block business requests

**Performance overhead**:
- CPU: < 0.1%
- Network: ~100 bytes per check
- Response time: 1-3ms


## Q2: How to customize health check logic?

**A**: Currently the fixed `ping` command is used. If you need to customize it, you need to modify the code:

```javascript
//In HealthChecker.js
async _checkHealth(poolName) {
    //Custom check logic
    try {
        //Method 1: Execute custom query
        await pool.collection('health_check').findOne({});

        //Method 2: Check replication latency
        const status = await pool.db().admin().replSetGetStatus();
        const lag = calculateReplicationLag(status);
        if (lag > 5000) {  //Delay exceeds 5 seconds
            throw new Error('Replication lag too high');
        }

        this.updateStatus(poolName, 'up', null);
    } catch (error) {
        // ...
    }
}
```


## Q3: How to ensure that no data is lost after the main database fails?

**A**: Use the correct failover strategy:

```javascript
const manager = new ConnectionPoolManager({
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'readonly',  // Do not allow writes to replicas
        // Or use the 'error' strategy to report errors directly without downgrading
    }
});

// Business-level processing
try {
    const pool = manager.selectPool('write');
    await pool.collection('orders').insertOne(order);
} catch (error) {
    //Main database failure, save to queue
    await saveToQueue(order);

    //Alarm
    await sendAlert({
        level: 'critical',
        message: 'Main database failure, orders are written to the queue',
        order: order.id
    });
}
```


## Q4: How to test the alarm system?

**A**: Manual trigger fault:

```bash
# Method 1: Stop MongoDB
sudo systemctl stop mongod

# Method 2: Firewall blocking
sudo iptables -A INPUT -p tcp --dport 27017 -j DROP

# Method 3: Unit test your alert function with a synthetic health snapshot
testAlert({ poolName: 'primary', status: 'down', error: new Error('Test') });

# Observe logs and alarms
tail -f pool-error.log
```

---

**Summary**:

1. ✅ **Automatic Discovery**: Health check automatically detects issues every 5 seconds
2. ✅ **Automatic processing**: selectPool automatically skips the fault pool
3. ✅ **Multiple notifications**: logs, monitoring scripts, events, Prometheus, Enterprise WeChat/DingTalk, emails
4. ✅ **Automatic recovery**: The connection pool is automatically marked as up after recovery.

**Recommended plan**:
- Basics: Regular monitoring script + Enterprise WeChat/DingTalk
- Advanced: Prometheus + Grafana + Alert Rules

---

**Update time**: 2026-02-03
**Maintainer**: monSQLize Team
