// 测试 module.exports 中 function 的 this 绑定

const modelDef = {
    enums: {
        role: 'admin|user',
        status: 'active|inactive|banned'
    },

    schema: function(dsl) {
        console.log('=== schema 函数内 this 分析 ===');
        console.log('this === modelDef:', this === modelDef);
        console.log('this.enums:', this.enums);

        try {
            const result = dsl({
                role: this.enums.role
            });
            console.log('✅ this.enums.role 访问成功');
            return result;
        } catch (e) {
            console.log('❌ this.enums.role 访问失败:', e.message);
        }
    }
};

console.log('测试场景1: 作为对象方法调用 modelDef.schema()');
modelDef.schema((data) => {
    console.log('dsl 接收到:', data);
    return data;
});

console.log('\n测试场景2: require() 后调用');
// 模拟 const model = require('./test'); model.schema(dsl);
const fn = modelDef.schema;
try {
    fn((data) => data);
} catch (e) {
    console.log('❌ 调用失败:', e.message);
}

