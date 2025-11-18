/**
 * result-handler 工具模块单元测试
 * 测试 findOneAnd* 操作返回值处理的各种边界情况
 *
 * @module test/unit/utils/result-handler.test
 * @since 2025-11-18
 */

const assert = require("assert");
const { handleFindOneAndResult, wasDocumentModified } = require("../../../lib/mongodb/writes/result-handler");

describe("result-handler 工具函数单元测试", () => {
    describe("handleFindOneAndResult() - 基础功能", () => {
        describe("处理 null/undefined 输入", () => {
            it("应该处理 result 为 null 的情况", () => {
                const result = handleFindOneAndResult(null, {});
                assert.strictEqual(result, null, "result 为 null 时应返回 null");
            });

            it("应该处理 result 为 undefined 的情况", () => {
                const result = handleFindOneAndResult(undefined, {});
                assert.strictEqual(result, null, "result 为 undefined 时应返回 null");
            });

            it("应该处理 result 为 null 且 includeResultMetadata=true", () => {
                const result = handleFindOneAndResult(null, { includeResultMetadata: true });

                assert.ok(result, "应返回对象而非 null");
                assert.strictEqual(result.value, null, "value 应为 null");
                assert.strictEqual(result.ok, 1, "ok 应为 1");
                assert.ok(result.lastErrorObject, "应包含 lastErrorObject");
                assert.strictEqual(result.lastErrorObject.n, 0, "lastErrorObject.n 应为 0");
            });

            it("应该处理 result 为 undefined 且 includeResultMetadata=true", () => {
                const result = handleFindOneAndResult(undefined, { includeResultMetadata: true });

                assert.ok(result, "应返回对象而非 null");
                assert.strictEqual(result.value, null, "value 应为 null");
                assert.strictEqual(result.ok, 1, "ok 应为 1");
                assert.strictEqual(result.lastErrorObject.n, 0, "lastErrorObject.n 应为 0");
            });
        });

        describe("处理缺少 lastErrorObject 的情况", () => {
            it("应该处理缺少 lastErrorObject 且 value 存在", () => {
                const input = { _id: 1, name: "Alice", age: 30 };
                const result = handleFindOneAndResult(input, {});

                // 应返回 null（因为没有 value 属性，被当作原始文档）
                assert.strictEqual(result, null, "缺少 lastErrorObject 时应返回 null");
            });

            it("应该为缺少 lastErrorObject 的结果补充元数据", () => {
                const input = { value: { _id: 1, name: "Alice" } };
                const result = handleFindOneAndResult(input, { includeResultMetadata: true });

                assert.ok(result, "应返回对象");
                assert.ok(result.lastErrorObject, "应补充 lastErrorObject");
                assert.strictEqual(result.lastErrorObject.n, 1, "有 value 时 n 应为 1");
                assert.strictEqual(result.lastErrorObject.updatedExisting, true, "有 value 时应标记为已更新");
            });

            it("应该处理 value 为 null 且缺少 lastErrorObject", () => {
                const input = { value: null };
                const result = handleFindOneAndResult(input, { includeResultMetadata: true });

                assert.ok(result, "应返回对象");
                assert.ok(result.lastErrorObject, "应补充 lastErrorObject");
                assert.strictEqual(result.lastErrorObject.n, 0, "value 为 null 时 n 应为 0");
                assert.strictEqual(result.lastErrorObject.updatedExisting, undefined, "value 为 null 时不应标记为已更新");
            });
        });

        describe("处理正常的完整元数据", () => {
            it("应该正确返回完整元数据（includeResultMetadata=true）", () => {
                const input = {
                    value: { _id: 1, name: "Alice", age: 30 },
                    ok: 1,
                    lastErrorObject: { n: 1, updatedExisting: true }
                };
                const result = handleFindOneAndResult(input, { includeResultMetadata: true });

                assert.deepStrictEqual(result, input, "应返回完整的输入对象");
                assert.ok(result.value, "应包含 value");
                assert.strictEqual(result.ok, 1, "ok 应为 1");
                assert.ok(result.lastErrorObject, "应包含 lastErrorObject");
            });

            it("应该正确提取 value（includeResultMetadata=false）", () => {
                const input = {
                    value: { _id: 1, name: "Alice", age: 30 },
                    ok: 1,
                    lastErrorObject: { n: 1, updatedExisting: true }
                };
                const result = handleFindOneAndResult(input, {});

                assert.deepStrictEqual(result, input.value, "应仅返回 value");
                assert.strictEqual(result._id, 1);
                assert.strictEqual(result.name, "Alice");
                assert.strictEqual(result.age, 30);
            });

            it("应该处理 value 为 null 的完整元数据", () => {
                const input = {
                    value: null,
                    ok: 1,
                    lastErrorObject: { n: 0 }
                };
                const result = handleFindOneAndResult(input, {});

                assert.strictEqual(result, null, "value 为 null 时应返回 null");
            });

            it("应该处理 value 为 null 且 includeResultMetadata=true", () => {
                const input = {
                    value: null,
                    ok: 1,
                    lastErrorObject: { n: 0 }
                };
                const result = handleFindOneAndResult(input, { includeResultMetadata: true });

                assert.deepStrictEqual(result, input, "应返回完整的输入对象");
                assert.strictEqual(result.value, null);
            });
        });

        describe("处理各种 lastErrorObject 场景", () => {
            it("应该处理 updatedExisting=true 的情况", () => {
                const input = {
                    value: { _id: 1, name: "Updated" },
                    ok: 1,
                    lastErrorObject: { n: 1, updatedExisting: true }
                };
                const result = handleFindOneAndResult(input, {});

                assert.ok(result, "应返回文档");
                assert.strictEqual(result.name, "Updated");
            });

            it("应该处理 upserted 的情况", () => {
                const input = {
                    value: { _id: "507f1f77bcf86cd799439011", name: "New" },
                    ok: 1,
                    lastErrorObject: { n: 1, upserted: "507f1f77bcf86cd799439011" }
                };
                const result = handleFindOneAndResult(input, {});

                assert.ok(result, "应返回文档");
                assert.strictEqual(result.name, "New");
            });

            it("应该处理 n=0（未找到文档）的情况", () => {
                const input = {
                    value: null,
                    ok: 1,
                    lastErrorObject: { n: 0 }
                };
                const result = handleFindOneAndResult(input, {});

                assert.strictEqual(result, null, "未找到文档时应返回 null");
            });

            it("应该处理 n>1（理论情况）的情况", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    ok: 1,
                    lastErrorObject: { n: 5 }
                };
                const result = handleFindOneAndResult(input, {});

                assert.ok(result, "应返回文档");
                assert.strictEqual(result._id, 1);
            });
        });

        describe("处理 options 参数", () => {
            it("应该处理 options 为 undefined", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    ok: 1,
                    lastErrorObject: { n: 1 }
                };
                const result = handleFindOneAndResult(input);

                assert.ok(result, "应返回文档");
                assert.strictEqual(result._id, 1);
            });

            it("应该处理 options 为空对象", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    ok: 1,
                    lastErrorObject: { n: 1 }
                };
                const result = handleFindOneAndResult(input, {});

                assert.ok(result, "应返回文档");
                assert.strictEqual(result._id, 1);
            });

            it("应该处理 includeResultMetadata 为 false", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    ok: 1,
                    lastErrorObject: { n: 1 }
                };
                const result = handleFindOneAndResult(input, { includeResultMetadata: false });

                assert.ok(result, "应返回文档");
                assert.strictEqual(result._id, 1);
                assert.strictEqual(result.ok, undefined, "不应包含元数据");
            });

            it("应该处理其他 options 属性（不影响行为）", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    ok: 1,
                    lastErrorObject: { n: 1 }
                };
                const result = handleFindOneAndResult(input, {
                    returnDocument: "after",
                    projection: { name: 1 }
                });

                assert.ok(result, "应返回文档");
                assert.strictEqual(result._id, 1);
            });
        });
    });

    describe("wasDocumentModified() - 基础功能", () => {
        describe("处理 null/undefined 输入", () => {
            it("result 为 null 时应返回 false", () => {
                const result = wasDocumentModified(null);
                assert.strictEqual(result, false, "null 应判断为未修改");
            });

            it("result 为 undefined 时应返回 false", () => {
                const result = wasDocumentModified(undefined);
                assert.strictEqual(result, false, "undefined 应判断为未修改");
            });

            it("result 为空对象时应返回 false", () => {
                const result = wasDocumentModified({});
                assert.strictEqual(result, false, "空对象应判断为未修改");
            });
        });

        describe("处理缺少 lastErrorObject 的情况", () => {
            it("缺少 lastErrorObject 时应返回 false", () => {
                const input = { value: { _id: 1, name: "Alice" } };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false, "缺少 lastErrorObject 应判断为未修改");
            });

            it("lastErrorObject 为 null 时应返回 false", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    lastErrorObject: null
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false, "lastErrorObject 为 null 应判断为未修改");
            });

            it("lastErrorObject 为 undefined 时应返回 false", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    lastErrorObject: undefined
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false);
            });
        });

        describe("处理 updatedExisting 标志", () => {
            it("updatedExisting=true 时应返回 true", () => {
                const input = {
                    value: { _id: 1, name: "Updated" },
                    lastErrorObject: { updatedExisting: true }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "updatedExisting=true 应判断为已修改");
            });

            it("updatedExisting=false 时应根据其他标志判断", () => {
                const input = {
                    value: null,
                    lastErrorObject: { updatedExisting: false, n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false, "所有标志为 false 时应判断为未修改");
            });

            it("updatedExisting=true 但 value 为 null 时应返回 true", () => {
                const input = {
                    value: null,
                    lastErrorObject: { updatedExisting: true, n: 1 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "updatedExisting=true 应判断为已修改（即使 value 为 null）");
            });
        });

        describe("处理 upserted 标志", () => {
            it("upserted 存在时应返回 true", () => {
                const input = {
                    value: { _id: "507f1f77bcf86cd799439011", name: "New" },
                    lastErrorObject: { upserted: "507f1f77bcf86cd799439011" }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "存在 upserted 应判断为已修改");
            });

            it("upserted 存在但 value 为 null 时应返回 true", () => {
                const input = {
                    value: null,
                    lastErrorObject: { upserted: "507f1f77bcf86cd799439011" }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "存在 upserted 应判断为已修改");
            });

            it("upserted 为 null 时应根据其他标志判断", () => {
                const input = {
                    value: null,
                    lastErrorObject: { upserted: null, n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false);
            });

            it("upserted 为 undefined 时应根据其他标志判断", () => {
                const input = {
                    value: null,
                    lastErrorObject: { upserted: undefined, n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false);
            });
        });

        describe("处理 n 标志", () => {
            it("n > 0 时应返回 true", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    lastErrorObject: { n: 1 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "n > 0 应判断为已修改");
            });

            it("n = 1 时应返回 true", () => {
                const input = {
                    value: { _id: 1 },
                    lastErrorObject: { n: 1 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true);
            });

            it("n = 0 时应返回 false（如果其他标志也不满足）", () => {
                const input = {
                    value: null,
                    lastErrorObject: { n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false, "n = 0 且 value 为 null 应判断为未修改");
            });

            it("n = 5（理论情况）时应返回 true", () => {
                const input = {
                    value: { _id: 1 },
                    lastErrorObject: { n: 5 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "n > 0 应判断为已修改");
            });

            it("n 为负数时应返回 false", () => {
                const input = {
                    value: null,
                    lastErrorObject: { n: -1 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false, "n < 0 应判断为未修改");
            });
        });

        describe("处理 value 标志", () => {
            it("value 不为 null 时应返回 true（即使 n=0）", () => {
                const input = {
                    value: { _id: 1, name: "Alice" },
                    lastErrorObject: { n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "value 存在应判断为已修改");
            });

            it("value 为空对象时应返回 true", () => {
                const input = {
                    value: {},
                    lastErrorObject: { n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "value 为空对象也应判断为已修改");
            });

            it("value 为 null 时应根据其他标志判断", () => {
                const input = {
                    value: null,
                    lastErrorObject: { n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false, "所有标志为 false 时应判断为未修改");
            });

            it("value 为 undefined 时应根据其他标志判断", () => {
                const input = {
                    value: undefined,
                    lastErrorObject: { n: 0 }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false);
            });
        });

        describe("处理多个标志的组合", () => {
            it("updatedExisting=true 且 n>0 且 value 存在", () => {
                const input = {
                    value: { _id: 1, name: "Updated" },
                    lastErrorObject: {
                        n: 1,
                        updatedExisting: true
                    }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "多个标志为 true 时应判断为已修改");
            });

            it("只有 upserted 为 true，其他为 false", () => {
                const input = {
                    value: null,
                    lastErrorObject: {
                        n: 0,
                        updatedExisting: false,
                        upserted: "507f1f77bcf86cd799439011"
                    }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true, "任一标志为 true 即应判断为已修改");
            });

            it("只有 n>0，其他为 false", () => {
                const input = {
                    value: null,
                    lastErrorObject: {
                        n: 1,
                        updatedExisting: false
                    }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true);
            });

            it("只有 value 存在，其他为 false", () => {
                const input = {
                    value: { _id: 1 },
                    lastErrorObject: {
                        n: 0,
                        updatedExisting: false
                    }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, true);
            });

            it("所有标志都为 false 或 0", () => {
                const input = {
                    value: null,
                    lastErrorObject: {
                        n: 0,
                        updatedExisting: false
                    }
                };
                const result = wasDocumentModified(input);
                assert.strictEqual(result, false, "所有标志为 false 时应判断为未修改");
            });
        });

        describe("真实使用场景", () => {
            it("场景：findOneAndUpdate 找到并更新文档", () => {
                const result = {
                    value: { _id: 1, name: "Alice Updated", age: 31 },
                    ok: 1,
                    lastErrorObject: { n: 1, updatedExisting: true }
                };
                assert.strictEqual(wasDocumentModified(result), true, "更新成功应判断为已修改");
            });

            it("场景：findOneAndUpdate 未找到文档（无 upsert）", () => {
                const result = {
                    value: null,
                    ok: 1,
                    lastErrorObject: { n: 0 }
                };
                assert.strictEqual(wasDocumentModified(result), false, "未找到文档应判断为未修改");
            });

            it("场景：findOneAndUpdate upsert 插入新文档", () => {
                const result = {
                    value: { _id: "507f1f77bcf86cd799439011", name: "New User" },
                    ok: 1,
                    lastErrorObject: { n: 1, upserted: "507f1f77bcf86cd799439011" }
                };
                assert.strictEqual(wasDocumentModified(result), true, "upsert 插入应判断为已修改");
            });

            it("场景：findOneAndDelete 找到并删除文档", () => {
                const result = {
                    value: { _id: 1, name: "Deleted User" },
                    ok: 1,
                    lastErrorObject: { n: 1 }
                };
                assert.strictEqual(wasDocumentModified(result), true, "删除成功应判断为已修改");
            });

            it("场景：findOneAndDelete 未找到文档", () => {
                const result = {
                    value: null,
                    ok: 1,
                    lastErrorObject: { n: 0 }
                };
                assert.strictEqual(wasDocumentModified(result), false, "未找到文档应判断为未修改");
            });

            it("场景：findOneAndReplace 替换文档", () => {
                const result = {
                    value: { _id: 1, name: "Replaced", status: "active" },
                    ok: 1,
                    lastErrorObject: { n: 1, updatedExisting: true }
                };
                assert.strictEqual(wasDocumentModified(result), true, "替换成功应判断为已修改");
            });
        });
    });

    describe("边界情况和异常输入", () => {
        describe("handleFindOneAndResult() 异常输入", () => {
            it("应该处理 result 为数字 0", () => {
                const result = handleFindOneAndResult(0, {});
                assert.strictEqual(result, null, "数字 0 应被视为 falsy，返回 null");
            });

            it("应该处理 result 为空字符串", () => {
                const result = handleFindOneAndResult("", {});
                assert.strictEqual(result, null, "空字符串应被视为 falsy，返回 null");
            });

            it("应该处理 result 为 false", () => {
                const result = handleFindOneAndResult(false, {});
                assert.strictEqual(result, null, "false 应被视为 falsy，返回 null");
            });

            it("应该处理 result 为空数组", () => {
                const input = [];
                const result = handleFindOneAndResult(input, {});
                assert.strictEqual(result, null, "空数组缺少 value，应返回 null");
            });

            it("应该处理 result 为字符串（非预期输入）", () => {
                const input = "unexpected string";
                const result = handleFindOneAndResult(input, {});
                // 字符串不是对象，没有 lastErrorObject
                assert.strictEqual(result, null);
            });
        });

        describe("wasDocumentModified() 异常输入", () => {
            it("应该处理 result 为数字 0", () => {
                const result = wasDocumentModified(0);
                assert.strictEqual(result, false);
            });

            it("应该处理 result 为空字符串", () => {
                const result = wasDocumentModified("");
                assert.strictEqual(result, false);
            });

            it("应该处理 result 为 false", () => {
                const result = wasDocumentModified(false);
                assert.strictEqual(result, false);
            });

            it("应该处理 result 为空数组", () => {
                const result = wasDocumentModified([]);
                assert.strictEqual(result, false);
            });

            it("应该处理 lastErrorObject 为空对象", () => {
                const input = {
                    value: { _id: 1 },
                    lastErrorObject: {}
                };
                const result = wasDocumentModified(input);
                // 空对象的所有属性都是 undefined，但 value 存在
                assert.strictEqual(result, true, "value 存在应判断为已修改");
            });
        });
    });

    describe("文档示例验证", () => {
        it("示例1：正常情况（找到文档）", () => {
            const result = {
                value: { name: "Alice" },
                ok: 1,
                lastErrorObject: { n: 1, updatedExisting: true }
            };
            const output = handleFindOneAndResult(result, {});

            assert.deepStrictEqual(output, { name: "Alice" }, "应仅返回文档对象");
        });

        it("示例2：未找到文档", () => {
            const result = {
                value: null,
                ok: 1,
                lastErrorObject: { n: 0 }
            };
            const output = handleFindOneAndResult(result, {});

            assert.strictEqual(output, null, "应返回 null");
        });

        it("示例3：result 为 null（驱动异常情况）", () => {
            const output = handleFindOneAndResult(null, {});

            assert.strictEqual(output, null, "应返回 null");
        });

        it("示例4：返回完整元数据", () => {
            const output = handleFindOneAndResult(null, { includeResultMetadata: true });

            assert.deepStrictEqual(output, {
                value: null,
                ok: 1,
                lastErrorObject: { n: 0 }
            }, "应返回标准空结果元数据");
        });
    });

    describe("集成场景模拟", () => {
        it("模拟：MongoDB 驱动 6.x 返回文档对象（缺少元数据）", () => {
            // 驱动 6.x 默认行为：直接返回文档
            const driverResult = { _id: 1, name: "Alice", age: 30 };

            // 应该能处理这种情况（补充元数据）
            const result = handleFindOneAndResult(driverResult, { includeResultMetadata: true });

            assert.ok(result, "应返回对象");
            assert.ok(result.lastErrorObject, "应补充 lastErrorObject");
        });

        it("模拟：MongoDB 驱动 5.x 返回完整元数据", () => {
            // 驱动 5.x 默认行为：返回完整元数据
            const driverResult = {
                value: { _id: 1, name: "Alice" },
                ok: 1,
                lastErrorObject: { n: 1, updatedExisting: true }
            };

            const result = handleFindOneAndResult(driverResult, {});

            assert.ok(result, "应正确处理");
            assert.strictEqual(result._id, 1);
        });

        it("模拟：缓存失效判断（更新成功）", () => {
            const result = {
                value: { _id: 1, name: "Updated" },
                ok: 1,
                lastErrorObject: { n: 1, updatedExisting: true }
            };

            // 模拟缓存失效逻辑
            if (wasDocumentModified(result)) {
                assert.ok(true, "应触发缓存失效");
            } else {
                assert.fail("应该触发缓存失效但没有触发");
            }
        });

        it("模拟：缓存失效判断（未找到文档）", () => {
            const result = {
                value: null,
                ok: 1,
                lastErrorObject: { n: 0 }
            };

            // 模拟缓存失效逻辑
            if (wasDocumentModified(result)) {
                assert.fail("不应触发缓存失效");
            } else {
                assert.ok(true, "正确判断为未修改");
            }
        });
    });
});

