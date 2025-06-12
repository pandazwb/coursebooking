import { ReconciliationService } from './src/services/reconciliation-service';

const runAccurateReconciliationTest = async () => {
    console.log('🎯 开始测试准确核账功能...');
    console.log('此测试将使用详细操作记录API来计算准确的消费金额');
    console.log('='.repeat(60));
    
    try {
        const reconciliationService = ReconciliationService.getInstance();
        
        // 设置测试日期范围
        const startDate = '2025-05-28';
        const endDate = new Date().toISOString().split('T')[0];
        
        console.log(`📅 测试日期范围: ${startDate} 至 ${endDate}`);
        console.log('⚠️  注意: 此过程可能需要较长时间，因为需要获取每个用户的详细操作记录');
        
        const result = await reconciliationService.performReconciliation(startDate, endDate);
        
        console.log('\n🎉 准确核账测试完成!');
        console.log('='.repeat(60));
        
        // 显示对比信息
        if (result.details.accurateConsumptions.length > 0) {
            console.log('\n📊 消费统计对比:');
            
            // 计算一些统计信息
            const totalUsers = result.details.accurateConsumptions.length;
            const usersWithConsumption = result.details.accurateConsumptions.filter(c => c.netConsumption > 0).length;
            const totalCancelledAmount = result.details.accurateConsumptions.reduce((sum, c) => sum + c.cancelledAmount, 0);
            
            console.log(`👥 总用户数: ${totalUsers}`);
            console.log(`🛒 有消费用户: ${usersWithConsumption}`);
            console.log(`↩️  总撤销金额: ¥${totalCancelledAmount.toFixed(2)}`);
            
            // 显示前5个有消费的用户
            const topConsumers = result.details.accurateConsumptions
                .filter(c => c.netConsumption > 0)
                .sort((a, b) => b.netConsumption - a.netConsumption)
                .slice(0, 5);
                
            if (topConsumers.length > 0) {
                console.log('\n🏆 消费前5名用户:');
                topConsumers.forEach((consumer, index) => {
                    const maskedPhone = consumer.Phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
                    console.log(`  ${index + 1}. ${consumer.Name} (${maskedPhone}): ¥${consumer.netConsumption.toFixed(2)}`);
                    if (consumer.cancelledAmount > 0) {
                        console.log(`     (包含撤销金额: ¥${consumer.cancelledAmount.toFixed(2)})`);
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('❌ 准确核账测试失败:', error);
    }
    
    process.exit(0);
};

runAccurateReconciliationTest().catch(console.error); 