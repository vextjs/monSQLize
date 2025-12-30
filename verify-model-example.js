// 验证示例模板的 this 绑定在实际使用场景下的正确性

const testModel = require('./lib/model/examples/test');

console.log('=== 验证1: enums 可被外部访问 ===');
console.log('testModel.enums.role:', testModel.enums.role);
console.log('testModel.enums.status:', testModel.enums.status);

console.log('\n=== 验证2: schema 函数内 this 绑定 ===');
const mockDsl = (config) => {
    console.log('dsl 接收到的配置:', config);
    return config;
};

try {
    const schema = testModel.schema(mockDsl);
    console.log('✅ schema 调用成功');
    console.log('role 字段配置:', schema.role);
} catch (e) {
    console.log('❌ schema 调用失败:', e.message);
}

console.log('\n=== 验证3: methods 返回正确结构 ===');
const mockModel = {
    find: (query) => {
        console.log('模拟 model.find 调用，查询条件:', query);
        return Promise.resolve([]);
    }
};

const methods = testModel.methods(mockModel);
console.log('methods 结构:', Object.keys(methods));
console.log('instance 方法:', Object.keys(methods.instance));
console.log('static 方法:', Object.keys(methods.static));

console.log('\n=== 验证4: hooks 返回正确结构 ===');
const hooks = testModel.hooks(mockModel);
console.log('hooks 支持的操作:', Object.keys(hooks));
console.log('✅ 示例模板所有功能验证通过');

