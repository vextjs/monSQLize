module.exports = {

    // 比较运算符（查询阶段）
    comparisonOperators:{
        '$eq':  { mysql: '=' },                  // 等于 (MongoDB: $eq) —— null 在实现层转为 IS NULL
        '$ne':  { mysql: '<>' },                 // 不等于 (MongoDB: $ne) —— null 在实现层转为 IS NOT NULL
        '$gt':  { mysql: '>' },                  // 大于 (MongoDB: $gt)
        '$gte': { mysql: '>=' },                 // 大于等于 (MongoDB: $gte)
        '$lt':  { mysql: '<' },                  // 小于 (MongoDB: $lt)
        '$lte': { mysql: '<=' },                 // 小于等于 (MongoDB: $lte)
        '$in':  { mysql: 'IN' },                 // 在列表中 (MongoDB: $in)
        '$nin': { mysql: 'NOT IN' },             // 不在列表中 (MongoDB: $nin)
    },

    // 逻辑运算符（查询阶段）
    logicalOperators:{
        '$and': { mysql: 'AND' },                // 逻辑与 (MongoDB: $and)
        '$or':  { mysql: 'OR' },                 // 逻辑或 (MongoDB: $or)
        '$not': { mysql: 'NOT' },                // 逻辑非 (MongoDB: $not) —— 使用 NOT ( ... ) 包裹字段条件
        '$nor': { mysql: '' }                    // 逻辑或非 (MongoDB: $nor) —— 实现为 NOT ( ... OR ... ) 包裹（无独立 SQL 运算符）
    },

    // 元素运算符（查询阶段）
    elementOperators:{
        '$exists': { mysql: 'IS [NOT] NULL' },   // 是否存在 (MongoDB: $exists) —— MySQL 映射为 IS [NOT] NULL（列存在性以 NULL 判定）
        '$type':   { mysql: '' }                 // 类型 (MongoDB: $type) —— 未实现
    },

    // 评估运算符（查询阶段）
    evaluationOperators:{
        '$expr':       { mysql: '' },            // 使用聚合表达式 —— MySQL 端不支持
        '$jsonSchema': { mysql: '' },            // JSON Schema —— 未实现
        '$mod':        { mysql: 'col % d = r' }, // 模运算 —— MySQL 使用取模：col % divisor = remainder（参数化）
        '$regex':      { mysql: 'REGEXP' },      // 正则（MySQL: REGEXP）
        '$text':       { mysql: 'MATCH...AGAINST' }, // 全文搜索 —— 使用 MATCH(...) AGAINST (? [MODE])，需指定 $columns
        '$where':      { mysql: '' }             // JavaScript 表达式 —— MySQL 端不支持
    },

    // 数组运算符（查询阶段）
    arrayOperators:{
        '$all':       { mysql: '' },             // 未实现
        '$elemMatch': { mysql: '' },             // 未实现
        '$size':      { mysql: '' },             // 未实现
    },

    // 位运算符（查询阶段）
    bitOperators:{
        '$bitsAllClear': { mysql: '' },          // 未实现
        '$bitsAllSet':   { mysql: '' },          // 未实现
        '$bitsAnyClear': { mysql: '' },          // 未实现
        '$bitsAnySet':   { mysql: '' },          // 未实现
    },

    // 地理空间运算符（查询阶段）
    geospatialOperators:{
        '$geoIntersects': { mysql: '' },         // 未实现
        '$geoWithin':     { mysql: '' },         // 未实现
        '$near':          { mysql: '' },         // 未实现
        '$nearSphere':    { mysql: '' }          // 未实现
    },

    // 投影运算符（读取阶段，当前由适配器自行处理语义）
    projectionOperators:{
        '$':         { mysql: '' },              // 未实现
        '$elemMatch':{ mysql: '' },              // 未实现
        '$meta':     { mysql: '' },              // 未实现
        '$slice':    { mysql: '' }               // 未实现
    },

    // 更新运算符（当前不在本项目范围，预留映射位）
    updateOperators:{
        // 字段更新运算符
        fieldUpdateOperators:{
            '$currentDate': { mysql: '' },
            '$inc':         { mysql: '' },
            '$min':         { mysql: '' },
            '$max':         { mysql: '' },
            '$mul':         { mysql: '' },
            '$rename':      { mysql: '' },
            '$set':         { mysql: '' },
            '$setOnInsert': { mysql: '' },
            '$unset':       { mysql: '' },
        },

        // 数组更新运算符
        arrayUpdateOperators:{
            '$addToSet': { mysql: '' },
            '$pop':      { mysql: '' },
            '$pull':     { mysql: '' },
            '$push':     { mysql: '' },
            '$pullAll':  { mysql: '' },
        },

        // 数组更新修饰符
        arrayUpdateModifiers:{
            '$each':    { mysql: '' },
            '$position':{ mysql: '' },
            '$slice':   { mysql: '' },
            '$sort':    { mysql: '' }
        },

        // 按位更新运算符
        bitUpdateOperators:{
            '$bit': { mysql: '' }
        }
    },

    // 聚合管道阶段（预留）
    aggregationPipelineStages:{
        '$addFields':   { mysql: '' },
        '$bucket':      { mysql: '' },
        '$bucketAuto':  { mysql: '' },
        '$collStats':   { mysql: '' },
        '$count':       { mysql: '' },
        '$facet':       { mysql: '' },
        '$geoNear':     { mysql: '' },
        '$graphLookup': { mysql: '' },
        '$group':       { mysql: '' },
        '$indexStats':  { mysql: '' },
        '$limit':       { mysql: '' },
        '$lookup':      { mysql: '' },
        '$match':       { mysql: '' },
        '$merge':       { mysql: '' },
        '$out':         { mysql: '' },
        '$project':     { mysql: '' },
        '$redact':      { mysql: '' },
        '$replaceRoot': { mysql: '' },
        '$replaceWith': { mysql: '' },
        '$sample':      { mysql: '' },
        '$set':         { mysql: '' },
        '$skip':        { mysql: '' },
        '$sort':        { mysql: '' },
        '$sortByCount': { mysql: '' },
        '$unionWith':   { mysql: '' },
        '$unset':       { mysql: '' },
        '$unwind':      { mysql: '' }
    },

    // 聚合表达式运算符（预留）
    aggregationExpressionOperators:{

        // 算术运算符
        arithmeticOperators:{
            '$abs':      { mysql: '' },
            '$add':      { mysql: '' },
            '$ceil':     { mysql: '' },
            '$divide':   { mysql: '' },
            '$exp':      { mysql: '' },
            '$floor':    { mysql: '' },
            '$ln':       { mysql: '' },
            '$log':      { mysql: '' },
            '$log10':    { mysql: '' },
            '$mod':      { mysql: '' },
            '$multiply': { mysql: '' },
            '$pow':      { mysql: '' },
            '$round':    { mysql: '' },
            '$sqrt':     { mysql: '' },
            '$subtract': { mysql: '' },
            '$trunc':    { mysql: '' }
        },

        // 数组运算符
        arrayOperators:{
            '$arrayElemAt':   { mysql: '' },
            '$arrayToObject': { mysql: '' },
            '$concatArrays':  { mysql: '' },
            '$filter':        { mysql: '' },
            '$first':         { mysql: '' },
            '$in':            { mysql: '' },
            '$indexOfArray':  { mysql: '' },
            '$isArray':       { mysql: '' },
            '$last':          { mysql: '' },
            '$map':           { mysql: '' },
            '$objectToArray': { mysql: '' },
            '$range':         { mysql: '' },
            '$reduce':        { mysql: '' },
            '$reverseArray':  { mysql: '' },
            '$size':          { mysql: '' },
            '$slice':         { mysql: '' },
            '$zip':           { mysql: '' }
        },

        // 布尔运算符
        booleanOperators:{
            '$and': { mysql: '' },
            '$not': { mysql: '' },
            '$or':  { mysql: '' }
        },

        // 比较运算符
        comparisonOperators:{
            '$cmp': { mysql: '' },
            '$eq':  { mysql: '' },
            '$gt':  { mysql: '' },
            '$gte': { mysql: '' },
            '$lt':  { mysql: '' },
            '$lte': { mysql: '' },
            '$ne':  { mysql: '' }
        },

        // 条件运算符
        conditionalOperators:{
            '$cond':   { mysql: '' },
            '$ifNull': { mysql: '' },
            '$switch': { mysql: '' }
        },

        // 数据类型运算符
        dataTypeOperators:{
            '$type':       { mysql: '' },
            '$convert':    { mysql: '' },
            '$toBool':     { mysql: '' },
            '$toDate':     { mysql: '' },
            '$toDecimal':  { mysql: '' },
            '$toDouble':   { mysql: '' },
            '$toInt':      { mysql: '' },
            '$toLong':     { mysql: '' },
            '$toObjectId': { mysql: '' },
            '$toString':   { mysql: '' }
        },

        // 日期运算符
        dateOperators:{
            '$dateAdd':       { mysql: '' },
            '$dateDiff':      { mysql: '' },
            '$dateFromParts': { mysql: '' },
            '$dateFromString':{ mysql: '' },
            '$dateSubtract':  { mysql: '' },
            '$dateToParts':   { mysql: '' },
            '$dateToString':  { mysql: '' },
            '$dayOfMonth':    { mysql: '' },
            '$dayOfWeek':     { mysql: '' },
            '$dayOfYear':     { mysql: '' },
            '$hour':          { mysql: '' },
            '$isoDayOfWeek':  { mysql: '' },
            '$isoWeek':       { mysql: '' },
            '$isoWeekYear':   { mysql: '' },
            '$millisecond':   { mysql: '' },
            '$minute':        { mysql: '' },
            '$month':         { mysql: '' },
            '$second':        { mysql: '' },
            '$week':          { mysql: '' },
            '$year':          { mysql: '' }
        },

        // 字符串运算符
        stringOperators:{
            '$concat':        { mysql: '' },
            '$indexOfBytes':  { mysql: '' },
            '$indexOfCP':     { mysql: '' },
            '$ltrim':         { mysql: '' },
            '$regexFind':     { mysql: '' },
            '$regexFindAll':  { mysql: '' },
            '$regexMatch':    { mysql: '' },
            '$replaceAll':    { mysql: '' },
            '$replaceOne':    { mysql: '' },
            '$rtrim':         { mysql: '' },
            '$split':         { mysql: '' },
            '$strcasecmp':    { mysql: '' },
            '$strLenBytes':   { mysql: '' },
            '$strLenCP':      { mysql: '' },
            '$substr':        { mysql: '' },
            '$substrBytes':   { mysql: '' },
            '$substrCP':      { mysql: '' },
            '$toLower':       { mysql: '' },
            '$toUpper':       { mysql: '' },
            '$trim':          { mysql: '' }
        },

        // 文本运算符
        textOperators:{
            '$meta': { mysql: '' }
        },

        // 变量运算符
        variableOperators:{
            '$$NOW':     { mysql: '' },
            '$$ROOT':    { mysql: '' },
            '$$CURRENT': { mysql: '' },
            '$$DESCEND': { mysql: '' },
            '$$PRUNE':   { mysql: '' },
            '$$KEEP':    { mysql: '' }
        },

        // 累加器运算符（group 阶段）
        accumulatorOperatorsGroup:{
            '$accumulator':  { mysql: '' },
            '$addToSet':     { mysql: '' },
            '$avg':          { mysql: '' },
            '$count':        { mysql: '' },
            '$first':        { mysql: '' },
            '$last':         { mysql: '' },
            '$max':          { mysql: '' },
            '$mergeObjects': { mysql: '' },
            '$min':          { mysql: '' },
            '$push':         { mysql: '' },
            '$stdDevPop':    { mysql: '' },
            '$stdDevSamp':   { mysql: '' },
            '$sum':          { mysql: '' }
        },

        // 累加器运算符（project 阶段）
        accumulatorOperatorsProject:{
            '$avg':        { mysql: '' },
            '$max':        { mysql: '' },
            '$min':        { mysql: '' },
            '$stdDevPop':  { mysql: '' },
            '$stdDevSamp': { mysql: '' },
            '$sum':        { mysql: '' }
        }
    },

    // 游标方法（仅保留占位，非 SQL 语义）
    cursorMethods:{
        '$addCursorFlag':  { mysql: '' },
        '$batchSize':      { mysql: '' },
        '$close':          { mysql: '' },
        '$comment':        { mysql: '' },
        '$itcount':        { mysql: '' },
        '$isExhaust':      { mysql: '' },
        '$isDead':         { mysql: '' },
        '$isAlive':        { mysql: '' },
        '$maxTimeMS':      { mysql: '' },
        '$readConcern':    { mysql: '' },
        '$readPref':       { mysql: '' },
        '$setBatchSize':   { mysql: '' },
        '$setReadConcern': { mysql: '' },
        '$setReadPref':    { mysql: '' }
    }
};
