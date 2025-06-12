#!/usr/bin/env ts-node

import { UserReconciliationService } from '../services/user-reconciliation-service';

async function testUserReconciliationAccurate() {
    console.log('🧪 开始测试用户核账（准确消费统计）...');
    console.log('='.repeat(60));
    
    try {
        const userReconciliationService = UserReconciliationService.getInstance();
        
        // 测试单个用户核账
        console.log('\n📋 测试单个用户核账...');
        const testUserId = '1'; // 使用一个测试用户ID
        const singleUserResult = await userReconciliationService.reconcileUser(testUserId, '测试用户');
        
        if (singleUserResult) {
            console.log('✅ 单个用户核账测试成功');
            console.log(`用户: ${singleUserResult.userInfo.Name}`);
            console.log(`充值: ¥${singleUserResult.reconciliation.totalPurchase.toFixed(2)}`);
            console.log(`消费: ¥${singleUserResult.reconciliation.totalConsumption.toFixed(2)}`);
            console.log(`撤销: ¥${singleUserResult.reconciliation.cancelledAmount.toFixed(2)}`);
            console.log(`净消费: ¥${singleUserResult.reconciliation.netConsumption.toFixed(2)}`);
            console.log(`余额: ¥${singleUserResult.reconciliation.currentBalance.toFixed(2)}`);
            console.log(`平账: ${singleUserResult.reconciliation.isBalanced ? '是' : '否'}`);
        } else {
            console.log('❌ 单个用户核账测试失败');
        }
        
        // 测试少量用户核账（前5个用户）
        console.log('\n📋 测试少量用户核账（前5个用户）...');
        const summary = await userReconciliationService.reconcileAllUsers('2025-05-28');
        
        console.log('\n✅ 用户核账测试完成');
        console.log(`总用户数: ${summary.totalUsers}`);
        console.log(`平账用户: ${summary.balancedUsers}`);
        console.log(`准确率: ${summary.accuracyRate.toFixed(1)}%`);
        
    } catch (error) {
        console.error('❌ 用户核账测试失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    testUserReconciliationAccurate()
        .then(() => {
            console.log('🎉 测试完成！');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 测试失败:', error);
            process.exit(1);
        });
}

export { testUserReconciliationAccurate }; 