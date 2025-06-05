#!/usr/bin/env ts-node

import { userReconciliationService } from '../services/user-reconciliation-service';

async function main() {
    try {
        console.log('课程预约系统 - 核账对比分析工具');
        console.log('======================================');
        
        const args = process.argv.slice(2);
        
        // 检查是否有 --start-date 参数
        let startDate = '2025-05-28'; // 默认值
        const startDateIndex = args.findIndex(arg => arg === '--start-date');
        if (startDateIndex !== -1 && args[startDateIndex + 1]) {
            startDate = args[startDateIndex + 1];
            console.log(`📅 使用自定义开始时间: ${startDate}`);
        } else {
            console.log(`📅 使用默认开始时间: ${startDate} (5月28日后为正式数据)`);
        }

        await userReconciliationService.compareWithTotalReconciliation(startDate);
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ 对比分析失败:', error);
        process.exit(1);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('程序异常退出:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 显示使用帮助
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
用法:
  npm run compare-reconciliation                    # 对比分析（5月28日起）
  npm run compare-reconciliation --start-date <date> # 指定开始时间（YYYY-MM-DD格式）

示例:
  npm run compare-reconciliation
  npm run compare-reconciliation --start-date 2025-06-01
`);
    process.exit(0);
}

// 执行主函数
main(); 