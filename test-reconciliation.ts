import { ReconciliationService } from './src/services/reconciliation-service';

const runReconciliationTest = async () => {
    console.log('🧪 开始核账测试...');
    
    try {
        const reconciliationService = ReconciliationService.getInstance();
        await reconciliationService.testReconciliation();
        console.log('✅ 核账测试完成');
    } catch (error) {
        console.error('❌ 核账测试失败:', error);
    }
    
    process.exit(0);
};

runReconciliationTest().catch(console.error); 