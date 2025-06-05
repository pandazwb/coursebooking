#!/usr/bin/env ts-node

import { userReconciliationService } from '../services/user-reconciliation-service';

async function main() {
    try {
        console.log('课程预约系统 - 用户核账工具');
        console.log('=====================================');
        
        const args = process.argv.slice(2);
        const command = args[0];

        // 检查是否有 --start-date 参数
        let startDate = '2025-05-28'; // 默认值
        const startDateIndex = args.findIndex(arg => arg === '--start-date');
        if (startDateIndex !== -1 && args[startDateIndex + 1]) {
            startDate = args[startDateIndex + 1];
            console.log(`📅 使用自定义开始时间: ${startDate}`);
        } else {
            console.log(`📅 使用默认开始时间: ${startDate} (5月28日后为正式数据)`);
        }

        if (command === 'user' && args[1]) {
            // 单个用户核账
            const userId = args[1];
            const userName = args[2];
            
            console.log(`正在对用户 ${userId} 进行核账...`);
            const result = await userReconciliationService.reconcileUser(userId, userName, startDate);
            
            if (result) {
                console.log('\n✅ 单用户核账完成！');
            } else {
                console.log('\n❌ 用户核账失败');
            }
        } else {
            // 所有用户核账
            console.log('开始所有用户核账...');
            const result = await userReconciliationService.exportUserReconciliation(startDate);
            console.log(`\n✅ ${result}`);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ 核账失败:', error);
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
  npm run user-reconciliation                    # 所有用户核账（5月28日起）
  npm run user-reconciliation user <ID>          # 单个用户核账（5月28日起）
  npm run user-reconciliation user <ID> <Name>   # 指定用户名的单个用户核账
  npm run user-reconciliation --start-date <date> # 指定开始时间（YYYY-MM-DD格式）

示例:
  npm run user-reconciliation
  npm run user-reconciliation user 478926
  npm run user-reconciliation user 478926 "张三"
  npm run user-reconciliation --start-date 2025-06-01
  npm run user-reconciliation user 459625 --start-date 2025-05-28
`);
    process.exit(0);
}

// 执行主函数
main(); 