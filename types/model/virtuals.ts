/**
 * Model 虚拟字段相关类型
 * @module types/model/virtuals
 * @since v1.0.6
 */

/**
 * 虚拟字段配置
 * @since v1.0.6
 */
export interface VirtualConfig {
    /**
     * getter 函数（必需）
     * @example
     * get: function() {
     *     return `${this.firstName} ${this.lastName}`;
     * }
     */
    get: (this: any) => any;

    /**
     * setter 函数（可选）
     * @example
     * set: function(value) {
     *     const parts = value.split(' ');
     *     this.firstName = parts[0];
     *     this.lastName = parts[1];
     * }
     */
    set?: (this: any, value: any) => void;
}

