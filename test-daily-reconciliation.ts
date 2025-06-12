#!/usr/bin/env ts-node

import { ReconciliationService } from './src/services/reconciliation-service';
import { UserReconciliationService } from './src/services/user-reconciliation-service';

async function testDailyReconciliation() {
    console.log(`\n=== 测试每日核账任务（准确核账） ===`);
    console.log('时间:', new Date().toLocaleString('zh-CN'));
    
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = '2025-05-28'; // 运营开始日期
    
    try {
        // 1. 执行总账核账（使用accurate方法）
        console.log('\n📊 开始执行总账核账...');
        const reconciliationService = ReconciliationService.getInstance();
        const totalResult = await reconciliationService.performReconciliation(startDate, endDate);
        
        console.log(`总账核账结果: ${totalResult.isBalanced ? '平账' : '不平账'}`);
        if (!totalResult.isBalanced) {
            console.log(`总账差额: ¥${totalResult.difference.toFixed(2)}`);
        }
        
        // 2. 执行用户核账（使用accurate方法）
        console.log('\n👥 开始执行用户核账...');
        const userReconciliationService = UserReconciliationService.getInstance();
        const userSummary = await userReconciliationService.reconcileAllUsers(startDate);
        
        console.log(`用户核账结果: ${userSummary.balancedUsers}/${userSummary.totalUsers} 用户平账 (${userSummary.accuracyRate.toFixed(1)}%)`);
        
        // 3. 汇总核账结果
        console.log('\n📋 核账汇总:');
        console.log(`总账: ${totalResult.isBalanced ? '✅ 平账' : '❌ 不平账'} (差额: ¥${totalResult.difference.toFixed(2)})`);
        console.log(`用户账: ${userSummary.accuracyRate > 90 ? '✅ 良好' : '⚠️ 需关注'} (准确率: ${userSummary.accuracyRate.toFixed(1)}%)`);
        
        // 4. 告警条件检查
        const needAlert = !totalResult.isBalanced || userSummary.accuracyRate < 90 || userSummary.unbalancedUsers > 10;
        
        if (needAlert) {
            console.log('\n⚠️  需要发送告警邮件:');
            console.log(`   总账不平账: ${!totalResult.isBalanced}`);
            console.log(`   用户准确率低: ${userSummary.accuracyRate < 90}`);
            console.log(`   不平账用户多: ${userSummary.unbalancedUsers > 10}`);
        } else {
            console.log('\n✅ 账目状况良好，无需告警');
        }
        
        console.log('\n✅ 每日核账任务测试完成');
        
        // 5. 返回汇总信息
        return {
            totalResult,
            userSummary,
            needAlert
        };
        
    } catch (error) {
        console.error('❌ 每日核账任务失败:', error);
        throw error;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    testDailyReconciliation()
        .then((result) => {
            console.log('\n🎉 测试完成！');
            console.log(`总账状态: ${result.totalResult.isBalanced ? '平账' : '不平账'}`);
            console.log(`用户核账准确率: ${result.userSummary.accuracyRate.toFixed(1)}%`);
            console.log(`需要告警: ${result.needAlert ? '是' : '否'}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 测试失败:', error);
            process.exit(1);
        });
}

export { testDailyReconciliation }; 