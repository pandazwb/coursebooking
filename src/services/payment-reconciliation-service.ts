import * as fs from 'fs';
import * as path from 'path';
import { ShouqianbaService } from './shouqianba-service';
import { ReconciliationService } from './reconciliation-service';

interface PaymentReconciliationResult {
    date: string;
    systemSalesAmount: number;        // 系统记录的销售额
    paymentPlatformAmount: number;    // 支付平台实际收款
    difference: number;               // 差额
    isBalanced: boolean;              // 是否平账
    details: {
        systemSales: any[];           // 系统销售记录
        paymentTransactions: any[];   // 支付平台交易记录
    };
    analysis: {
        missingPayments: any[];       // 系统有记录但支付平台没有的
        extraPayments: any[];         // 支付平台有但系统没有记录的
        amountMismatches: any[];      // 金额不匹配的
    };
}

export class PaymentReconciliationService {
    private static instance: PaymentReconciliationService;
    private shouqianbaService: ShouqianbaService;
    private reconciliationService: ReconciliationService;

    private constructor() {
        this.shouqianbaService = ShouqianbaService.getInstance();
        this.reconciliationService = ReconciliationService.getInstance();
    }

    public static getInstance(): PaymentReconciliationService {
        if (!PaymentReconciliationService.instance) {
            PaymentReconciliationService.instance = new PaymentReconciliationService();
        }
        return PaymentReconciliationService.instance;
    }

    // 执行支付核账
    public async performPaymentReconciliation(targetDate?: string): Promise<PaymentReconciliationResult> {
        const endDate = targetDate || new Date().toISOString().split('T')[0];
        const startDate = '2025-05-28'; // 运营开始日期

        console.log(`\n💳 开始支付核账: ${startDate} 至 ${endDate}`);
        console.log('='.repeat(60));

        try {
            // 1. 获取系统销售数据
            console.log('📊 获取系统销售数据...');
            const systemReconciliation = await this.reconciliationService.performReconciliation(startDate, endDate);
            const systemSalesAmount = systemReconciliation.totalSalesAmount;

            // 2. 获取收钱吧收款数据
            console.log('💰 获取收钱吧收款数据...');
            const paymentSummary = await this.shouqianbaService.getPaymentSummary(startDate, endDate);
            const paymentPlatformAmount = paymentSummary.successfulAmount;

            // 3. 计算差额
            const difference = systemSalesAmount - paymentPlatformAmount;
            const isBalanced = Math.abs(difference) < 0.01;

            const result: PaymentReconciliationResult = {
                date: endDate,
                systemSalesAmount,
                paymentPlatformAmount,
                difference,
                isBalanced,
                details: {
                    systemSales: systemReconciliation.details.cardSales,
                    paymentTransactions: paymentSummary.transactions
                },
                analysis: {
                    missingPayments: [],
                    extraPayments: [],
                    amountMismatches: []
                }
            };

            // 4. 详细分析
            await this.analyzePaymentDiscrepancies(result);

            // 5. 输出结果
            this.printPaymentReconciliationResult(result);

            // 6. 保存结果
            await this.savePaymentReconciliationResult(result);

            return result;
        } catch (error) {
            console.error('支付核账过程中出错:', error);
            throw error;
        }
    }

    // 分析支付差异
    private async analyzePaymentDiscrepancies(result: PaymentReconciliationResult) {
        console.log('\n🔍 分析支付差异...');

        // 由于收钱吧API限制，这里主要做概念性分析
        // 实际使用时需要根据具体的订单号匹配规则来实现

        if (!result.isBalanced) {
            if (result.difference > 0) {
                console.log('⚠️  系统销售额大于支付平台收款，可能原因：');
                console.log('   - 有销售记录但支付失败的订单');
                console.log('   - 支付平台数据延迟');
                console.log('   - 现金收款未通过支付平台');
            } else {
                console.log('⚠️  支付平台收款大于系统销售额，可能原因：');
                console.log('   - 有支付成功但系统未记录的订单');
                console.log('   - 系统数据同步问题');
                console.log('   - 重复支付');
            }
        }
    }

    // 打印支付核账结果
    private printPaymentReconciliationResult(result: PaymentReconciliationResult) {
        console.log(`\n💳 支付核账结果 (${result.date})`);
        console.log('='.repeat(60));
        
        console.log(`🏪 系统销售额:     ¥${result.systemSalesAmount.toFixed(2)}`);
        console.log(`💰 支付平台收款:   ¥${result.paymentPlatformAmount.toFixed(2)}`);
        console.log(`📈 差额:          ¥${result.difference.toFixed(2)}`);
        
        if (result.isBalanced) {
            console.log(`✅ 支付账目平衡`);
        } else {
            console.log(`❌ 支付账目不平衡！差额: ¥${result.difference.toFixed(2)}`);
        }

        console.log(`\n📋 数据统计:`);
        console.log(`   系统销售记录: ${result.details.systemSales.length} 条`);
        console.log(`   支付平台交易: ${result.details.paymentTransactions.length} 笔`);

        // 显示分析结果
        if (result.analysis.missingPayments.length > 0) {
            console.log(`   缺失支付: ${result.analysis.missingPayments.length} 笔`);
        }
        if (result.analysis.extraPayments.length > 0) {
            console.log(`   多余支付: ${result.analysis.extraPayments.length} 笔`);
        }
        if (result.analysis.amountMismatches.length > 0) {
            console.log(`   金额不匹配: ${result.analysis.amountMismatches.length} 笔`);
        }
    }

    // 保存支付核账结果
    private async savePaymentReconciliationResult(result: PaymentReconciliationResult) {
        try {
            const logDir = path.join(__dirname, '../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const fileName = `payment_reconciliation_${result.date.replace(/-/g, '')}.json`;
            const filePath = path.join(logDir, fileName);

            fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
            console.log(`\n💾 支付核账结果已保存到: ${filePath}`);
        } catch (error) {
            console.error('保存支付核账结果失败:', error);
        }
    }

    // 测试支付核账功能
    public async testPaymentReconciliation() {
        console.log('🧪 开始测试支付核账功能...');
        try {
            // 首先验证收钱吧配置
            const isConfigValid = await this.shouqianbaService.validateConfig();
            if (!isConfigValid) {
                console.error('❌ 收钱吧配置验证失败，请检查配置文件');
                return;
            }

            const result = await this.performPaymentReconciliation();
            console.log('\n✅ 支付核账测试完成');
            return result;
        } catch (error) {
            console.error('❌ 支付核账测试失败:', error);
            throw error;
        }
    }

    // 生成支付核账报告
    public async generatePaymentReconciliationReport(targetDate?: string) {
        console.log('📋 生成支付核账报告...');
        try {
            const result = await this.performPaymentReconciliation(targetDate);
            
            // 生成详细报告
            const reportData = {
                ...result,
                generatedAt: new Date().toISOString(),
                recommendations: this.generateRecommendations(result)
            };
            
            const logDir = path.join(__dirname, '../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const fileName = `payment_reconciliation_report_${result.date.replace(/-/g, '')}.json`;
            const filePath = path.join(logDir, fileName);

            fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
            console.log(`\n📄 支付核账报告已保存到: ${filePath}`);
            
            return reportData;
        } catch (error) {
            console.error('❌ 生成支付核账报告失败:', error);
            throw error;
        }
    }

    // 生成建议
    private generateRecommendations(result: PaymentReconciliationResult): string[] {
        const recommendations: string[] = [];

        if (!result.isBalanced) {
            if (Math.abs(result.difference) > 100) {
                recommendations.push('差额较大，建议立即核查具体原因');
            }

            if (result.difference > 0) {
                recommendations.push('建议检查是否有支付失败但系统已记录销售的订单');
                recommendations.push('核实是否有现金收款未通过支付平台的情况');
            } else {
                recommendations.push('建议检查是否有支付成功但系统未记录的订单');
                recommendations.push('核查是否存在重复支付的情况');
            }
        }

        if (result.details.paymentTransactions.length === 0) {
            recommendations.push('收钱吧交易数据为空，请检查API配置或数据获取逻辑');
        }

        return recommendations;
    }
} 