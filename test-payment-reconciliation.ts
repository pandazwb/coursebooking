import { PaymentReconciliationService } from './src/services/payment-reconciliation-service';

const runPaymentReconciliationTest = async () => {
    console.log('💳 开始支付核账测试...');
    
    try {
        const paymentReconciliationService = PaymentReconciliationService.getInstance();
        await paymentReconciliationService.testPaymentReconciliation();
        console.log('✅ 支付核账测试完成');
    } catch (error) {
        console.error('❌ 支付核账测试失败:', error);
    }
    
    process.exit(0);
};

runPaymentReconciliationTest().catch(console.error); 