module.exports = {

    // 比较运算符
    comparisonOperators:{
        '$eq': '',                              // 等于 (MongoDB: $eq)
        '$ne': '',                              // 不等于 (MongoDB: $ne)
        '$gt': '',                              // 大于 (MongoDB: $gt)
        '$gte': '',                             // 大于等于 (MongoDB: $gte)
        '$lt': '',                              // 小于 (MongoDB: $lt)
        '$lte': '',                             // 小于等于 (MongoDB: $lte)
        '$in': '',                              // 在列表中 (MongoDB: $in)
        '$nin': '',                             // 不在列表中 (MongoDB: $nin)
    },

    // 逻辑运算符
    logicalOperators:{
        '$and': '',                             // 逻辑与 (MongoDB: $and)
        '$or': '',                              // 逻辑或 (MongoDB: $or)
        '$not': '',                             // 逻辑非 (MongoDB: $not)
        '$nor': ''                              // 逻辑或非 (MongoDB: $nor)
    },

    // 元素运算符
    elementOperators:{
        '$exists': '',                          // 是否存在 (MongoDB: $exists)
        '$type': ''                             // 类型 (MongoDB: $type)
    },

    // 评估运算符
    evaluationOperators:{
        '$expr': '',                            // 允许在查询语言中使用聚合表达式
        '$jsonSchema': '',                      // 使用JSON Schema验证文档
        '$mod': '',                             // 对字段值进行模运算并匹配结果
        '$regex': '',                           // 使用正则表达式匹配字符串
        '$text': '',                            // 执行文本搜索
        '$where': ''                            // 使用JavaScript表达式匹配文档
    },

    // 数组运算符
    arrayOperators:{
        '$all': '',                             // 数组包含所有指定元素 (MongoDB: $all)
        '$elemMatch': '',                       // 数组中至少一个元素满足所有指定条件 (MongoDB: $elemMatch)
        '$size': '',                            // 数组大小 (MongoDB: $size)
    },

    // 位运算符
    bitOperators:{
        '$bitsAllClear': '',                    // 匹配指定位置都为0的值
        '$bitsAllSet': '',                      // 匹配指定位置都为1的值
        '$bitsAnyClear': '',                    // 匹配任何指定位置为0的值
        '$bitsAnySet': '',                      // 匹配任何指定位置为1的值
    },

    // 地理空间运算符
    geospatialOperators:{
        '$geoIntersects': '',                   // 选择与GeoJSON形状相交的几何体
        '$geoWithin': '',                       // 选择在指定GeoJSON形状内的几何体
        '$near': '',                            // 选择接近某个点的几何体
        '$nearSphere': ''                       // 选择接近某个球面上点的几何体
    },

    // 投影运算符
    projectionOperators:{
        '$': '',                                // 投影数组中第一个匹配元素
        '$elemMatch': '',                       // 投影数组中第一个匹配所有条件的元素 (MongoDB: $elemMatch)
        '$meta': '',                            // 投影查询返回的元数据
        '$slice': ''                            // 限制从数组返回的元素数量
    },

    // 更新运算符
    updateOperators:{
        // 字段更新运算符
        fieldUpdateOperators:{
            '$currentDate': '',                 // 将字段值设为当前日期
            '$inc': '',                         // 将字段值增加指定数量
            '$min': '',                         // 将字段值设为指定值（仅当现有值大于指定值时）
            '$max': '',                         // 将字段值设为指定值（仅当现有值小于指定值时）
            '$mul': '',                         // 将字段值乘以指定数量
            '$rename': '',                      // 替换字段名
            '$set': '',                         // 设置字段值
            '$setOnInsert': '',                 // 如果操作导致插入文档，则设置字段值
            '$unset': '',                       // 从文档中移除指定字段
        },

        // 数组更新运算符
        arrayUpdateOperators:{
            '$addToSet': '',                    // 向数组添加不重复的元素
            '$pop': '',                         // 移除数组的第一个或最后一个元素
            '$pull': '',                        // 从数组中移除与指定查询匹配的所有元素
            '$push': '',                        // 向数组末尾添加元素
            '$pullAll': '',                     // 从数组中移除所有匹配指定值的元素
        },

        // 数组更新修饰符
        arrayUpdateModifiers:{
            "$each": '',                        // 与$push和$addToSet一起使用，添加多个值
            '$position': '',                    // 与$push一起使用，在指定位置插入元素
            '$slice': '',                       // 与$push一起使用，限制数组大小
            '$sort': ''                         // 与$push一起使用，对数组元素排序
        },

        // 按位更新运算符
        bitUpdateOperators:{
            '$bit': ''                          // 执行按位运算（AND、OR、XOR）
        }
    },

    // 聚合管道阶段
    aggregationPipelineStages:{
        '$addFields': '',                       // 添加新字段到文档
        '$bucket': '',                          // 根据指定边界将文档分类为桶
        '$bucketAuto': '',                      // 自动将文档分类为指定数量的桶
        '$collStats': '',                       // 返回有关集合或视图的统计信息
        '$count': '',                           // 计算文档数量并返回
        '$facet': '',                           // 在同一组输入文档上处理多个聚合管道
        '$geoNear': '',                         // 根据与地理空间点的接近程度输出文档
        '$graphLookup': '',                     // 执行递归搜索
        '$group': '',                           // 按指定表达式对文档进行分组
        '$indexStats': '',                      // 返回集合的索引使用统计信息
        '$limit': '',                           // 限制传递到管道下一阶段的文档数量
        '$lookup': '',                          // 执行左外连接到另一个集合
        '$match': '',                           // 筛选文档流，只输出匹配的文档
        '$merge': '',                           // 将结果写入集合
        '$out': '',                             // 将聚合管道的结果写入集合
        '$project': '',                         // 重塑文档流
        '$redact': '',                          // 根据文档内容限制文档内容
        '$replaceRoot': '',                     // 用指定的嵌入文档替换文档
        '$replaceWith': '',                     // 用指定的文档替换输入文档（$replaceRoot的别名）
        '$sample': '',                          // 随机选择指定数量的文档
        '$set': '',                             // 添加新字段到文档（$addFields的别名）
        '$skip': '',                            // 跳过前N个文档
        '$sort': '',                            // 对文档流重新排序
        '$sortByCount': '',                     // 按值分组并计数
        '$unionWith': '',                       // 组合两个集合的管道结果
        '$unset': '',                           // 从文档中移除字段
        '$unwind': ''                           // 解构数组字段，为每个元素输出一个文档
    },

    // 聚合表达式运算符
    aggregationExpressionOperators:{

        // 算术运算符
        arithmeticOperators:{
            '$abs': '',                         // 绝对值
            '$add': '',                         // 相加
            '$ceil': '',                        // 向上取整
            '$divide': '',                      // 相除
            '$exp': '',                         // 计算e的幂
            '$floor': '',                       // 向下取整
            '$ln': '',                          // 计算自然对数
            '$log': '',                         // 计算指定基数的对数
            '$log10': '',                       // 计算以10为底的对数
            '$mod': '',                         // 取模
            '$multiply': '',                    // 相乘
            '$pow': '',                         // 幂运算
            '$round': '',                       // 四舍五入
            '$sqrt': '',                        // 计算平方根
            '$subtract': '',                    // 相减
            '$trunc': ''                        // 截断为整数
        },

        // 数组运算符
        arrayOperators:{
            '$arrayElemAt': '',                 // 返回数组中指定索引位置的元素
            '$arrayToObject': '',               // 将数组转换为对象
            '$concatArrays': '',                // 连接多个数组
            '$filter': '',                      // 根据条件过滤数组
            '$first': '',                       // 返回数组第一个元素
            '$in': '',                          // 检查值是否在数组中
            '$indexOfArray': '',                // 查找数组中元素的索引
            '$isArray': '',                     // 检查是否为数组
            '$last': '',                        // 返回数组最后一个元素
            '$map': '',                         // 对数组的每个元素应用表达式
            '$objectToArray': '',               // 将对象转换为数组
            '$range': '',                       // 生成数字序列数组
            '$reduce': '',                      // 将表达式应用于数组并返回累计结果
            '$reverseArray': '',                // 反转数组顺序
            '$size': '',                        // 返回数组元素数量
            '$slice': '',                       // 返回数组的子集
            '$zip': ''                          // 将多个数组合并为一个数组
        },

        // 布尔运算符
        booleanOperators:{
            '$and': '',                         // 逻辑与
            '$not': '',                         // 逻辑非
            '$or': ''                           // 逻辑或
        },

        // 比较运算符
        comparisonOperators:{
            '$cmp': '',                         // 比较两个值
            '$eq': '',                          // 等于
            '$gt': '',                          // 大于
            '$gte': '',                         // 大于等于
            '$lt': '',                          // 小于
            '$lte': '',                         // 小于等于
            '$ne': ''                           // 不等于
        },

        // 条件运算符
        conditionalOperators:{
            '$cond': '',                        // 条件表达式
            '$ifNull': '',                      // 如果为空则提供替代值
            '$switch': ''                       // 多路分支条件
        },

        // 数据类型运算符
        dataTypeOperators:{
            '$type': '',                        // 返回变量的BSON类型
            '$convert': '',                     // 将值转换为指定类型
            '$toBool': '',                      // 转换为布尔类型
            '$toDate': '',                      // 转换为日期类型
            '$toDecimal': '',                   // 转换为十进制类型
            '$toDouble': '',                    // 转换为双精度类型
            '$toInt': '',                       // 转换为整数类型
            '$toLong': '',                      // 转换为长整数类型
            '$toObjectId': '',                  // 转换为ObjectId类型
            '$toString': ''                     // 转换为字符串类型
        },

        // 日期运算符
        dateOperators:{
            '$dateAdd': '',                     // 将指定时间单位添加到日期
            '$dateDiff': '',                    // 返回两个日期之间的差异
            '$dateFromParts': '',               // 从部分构造日期
            '$dateFromString': '',              // 将字符串转换为日期
            '$dateSubtract': '',                // 从日期减去指定时间单位
            '$dateToParts': '',                 // 将日期拆分为组件部分
            '$dateToString': '',                // 将日期转换为格式化字符串
            '$dayOfMonth': '',                  // 返回月份中的日期(1-31)
            '$dayOfWeek': '',                   // 返回星期几(1-7)
            '$dayOfYear': '',                   // 返回年中的天数(1-366)
            '$hour': '',                        // 返回小时(0-23)
            '$isoDayOfWeek': '',                // 返回ISO 8601格式的星期几(1-7)
            '$isoWeek': '',                     // 返回ISO 8601格式的周数(1-53)
            '$isoWeekYear': '',                 // 返回ISO 8601格式的年份
            '$millisecond': '',                 // 返回毫秒(0-999)
            '$minute': '',                      // 返回分钟(0-59)
            '$month': '',                       // 返回月份(1-12)
            '$second': '',                      // 返回秒(0-60)
            '$week': '',                        // 返回周数(0-53)
            '$year': ''                         // 返回年份
        },

        // 字符串运算符
        stringOperators:{
            '$concat': '',                      // 连接字符串
            '$indexOfBytes': '',                // 查找字符串中子字符串的第一个UTF-8字节索引
            '$indexOfCP': '',                   // 查找字符串中子字符串的第一个UTF-8代码点索引
            '$ltrim': '',                       // 去除左侧空白
            '$regexFind': '',                   // 返回第一个正则表达式匹配的信息
            '$regexFindAll': '',                // 返回所有正则表达式匹配的信息
            '$regexMatch': '',                  // 测试字符串是否匹配正则表达式
            '$replaceAll': '',                  // 替换所有匹配的子字符串
            '$replaceOne': '',                  // 替换第一个匹配的子字符串
            '$rtrim': '',                       // 去除右侧空白
            '$split': '',                       // 按分隔符拆分字符串
            '$strcasecmp': '',                  // 不区分大小写的字符串比较
            '$strLenBytes': '',                 // 返回字符串的UTF-8字节长度
            '$strLenCP': '',                    // 返回字符串的UTF-8代码点长度
            '$substr': '',                      // 返回子字符串
            '$substrBytes': '',                 // 返回字符串的子字符串(按字节)
            '$substrCP': '',                    // 返回字符串的子字符串(按代码点)
            '$toLower': '',                     // 转换为小写
            '$toUpper': '',                     // 转换为大写
            '$trim': ''                         // 去除两端空白
        },

        // 文本运算符
        textOperators:{
            '$meta': ''                         // 访问全文搜索元数据
        },

        // 变量运算符
        variableOperators:{
            '$$NOW': '',                        // 当前日期时间
            '$$ROOT': '',                       // 整个输入文档
            '$$CURRENT': '',                    // 当前文档
            '$$DESCEND': '',                    // 递归下降标志
            '$$PRUNE': '',                      // 排除子文档标志
            '$$KEEP': ''                        // 保留子文档标志
        },

        // 累加器运算符
        accumulatorOperatorsGroup:{
            '$accumulator': '',                 // 自定义累加器
            '$addToSet': '',                    // 添加不重复值到数组
            '$avg': '',                         // 平均值
            '$count': '',                       // 计数
            '$first': '',                       // 第一个值
            '$last': '',                        // 最后一个值
            '$max': '',                         // 最大值
            '$mergeObjects': '',                // 合并文档
            '$min': '',                         // 最小值
            '$push': '',                        // 添加值到数组
            '$stdDevPop': '',                   // 总体标准差
            '$stdDevSamp': '',                  // 样本标准差
            '$sum': ''                          // 求和
        },

        // 累加器操作器项目
        accumulatorOperatorsProject:{
            '$avg': '',                         // 平均值
            '$max': '',                         // 最大值
            '$min': '',                         // 最小值
            '$stdDevPop': '',                   // 总体标准差
            '$stdDevSamp': '',                  // 样本标准差
            '$sum': ''                          // 求和
        }
    },

    // 游标方法
    cursorMethods:{
        "$addCursorFlag": '',                   // 添加游标标志
        "$batchSize": '',                       // 设置批处理大小
        "$close": '',                           // 关闭游标
        "$comment": '',                         // 添加注释到查询
        "$itcount": '',                         // 返回游标的文档数量
        "$isExhaust": '',                       // 检查游标是否为排气模式
        "$isDead": '',                          // 检查游标是否已关闭
        "$isAlive": '',                         // 检查游标是否仍然有效
        "$maxTimeMS": '',                       // 设置最大执行时间
        "$readConcern": '',                     // 设置读取关注级别
        "$readPref": '',                        // 设置读取首选项
        "$setBatchSize": '',                    // 设置批处理大小
        "$setReadConcern": '',                  // 设置读取关注级别
        "$setReadPref": ''                      // 设置读取首选项
    }
}