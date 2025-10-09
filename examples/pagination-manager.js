// 跳页实现的核心组件示例

class PaginationManager {
    constructor(options) {
        this.step = options.step || 10;        // 书签密度
        this.maxHops = options.maxHops || 20;  // 最大跳转次数
        this.ttlMs = options.ttlMs || 6 * 3600_000; // 书签TTL
        this.cache = options.cache;
    }

    /**
     * 书签键生成策略
     */
    generateBookmarkKey(ns, keyDims, pageNumber) {
        const hash = this.hashKeyDims(keyDims);
        return `${ns}:bm:${hash}:${pageNumber}`;
    }

    /**
     * 计算跳页策略
     * @param {number} targetPage - 目标页码
     * @returns {Object} 跳页执行计划
     */
    calculateJumpPlan(targetPage) {
        const pageIndex = targetPage - 1;
        const anchorPage = Math.floor(pageIndex / this.step) * this.step;
        const remaining = pageIndex - anchorPage;

        return {
            anchorPage,           // 最近的书签页
            remaining,            // 从书签页到目标页的距离
            needsBookmark: anchorPage > 0,
            estimatedHops: remaining + (anchorPage > 0 ? 0 : anchorPage)
        };
    }

    /**
     * 检查是否应该使用 offset 策略
     */
    shouldUseOffset(targetPage, limit, maxSkip = 50000) {
        const skip = (targetPage - 1) * limit;
        return skip <= maxSkip;
    }

    /**
     * 执行书签跳转
     */
    async executeBookmarkJump(options) {
        const { targetPage, collection, queryOptions } = options;
        const plan = this.calculateJumpPlan(targetPage);

        if (plan.estimatedHops > this.maxHops) {
            throw this.createJumpTooFarError(plan.estimatedHops);
        }

        let current = null;
        let hopsUsed = 0;

        // 1. 寻找最近的书签
        if (plan.needsBookmark) {
            const bookmarkCursor = await this.getBookmark(plan.anchorPage);
            if (bookmarkCursor) {
                current = { pageInfo: { endCursor: bookmarkCursor } };
            }
        }

        // 2. 如果没有书签，从第一页开始
        if (!current) {
            current = await this.fetchPage(null, queryOptions);
            await this.saveBookmark(1, current.pageInfo?.endCursor);

            // 逐页推进到锚点页
            for (let i = 1; i < plan.anchorPage; i++) {
                hopsUsed++;
                if (hopsUsed > this.maxHops) {
                    throw this.createJumpTooFarError(hopsUsed);
                }

                current = await this.fetchPage(current.pageInfo.endCursor, queryOptions);

                // 保存书签
                const pageNum = i + 1;
                if (pageNum % this.step === 0) {
                    await this.saveBookmark(pageNum, current.pageInfo?.endCursor);
                }
            }
        }

        // 3. 从锚点页推进到目标页
        for (let i = 0; i < plan.remaining; i++) {
            hopsUsed++;
            if (hopsUsed > this.maxHops) {
                throw this.createJumpTooFarError(hopsUsed);
            }

            current = await this.fetchPage(current.pageInfo.endCursor, queryOptions);

            const pageNum = plan.anchorPage + 1 + i;
            if (pageNum % this.step === 0) {
                await this.saveBookmark(pageNum, current.pageInfo?.endCursor);
            }
        }

        // 标记当前页码
        if (current?.pageInfo) {
            current.pageInfo.currentPage = targetPage;
        }

        return current;
    }

    createJumpTooFarError(hopsUsed) {
        const error = new Error(`跳页跨度过大，已使用 ${hopsUsed} hops，超过限制 ${this.maxHops}`);
        error.code = 'JUMP_TOO_FAR';
        error.details = [{
            path: ['page'],
            message: `hopsUsed=${hopsUsed}, maxHops=${this.maxHops}`
        }];
        return error;
    }
}

module.exports = PaginationManager;
