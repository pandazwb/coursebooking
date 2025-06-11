import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface ShouqianbaConfig {
    vendor_sn: string;
    vendor_key: string;
    terminal_sn: string;
    terminal_key: string;
    api_domain: string;
}

interface ShouqianbaTransaction {
    sn: string;                    // 收钱吧唯一订单号
    client_sn: string;             // 商户订单号
    status: string;                // 订单状态
    order_status: string;          // 订单状态
    total_amount: string;          // 交易总金额（分）
    net_amount: string;            // 剩余金额
    settlement_amount: string;     // 本次操作金额
    finish_time: string;           // 完成时间
    channel_finish_time: string;   // 支付平台完成时间
    subject: string;               // 商品概述
    payway: string;                // 支付方式
    payway_name: string;           // 支付方式名称
    trade_no: string;              // 支付平台订单号
}

interface PaymentReconciliationSummary {
    date: string;
    totalPayments: number;         // 总收款笔数
    totalAmount: number;           // 总收款金额
    successfulPayments: number;    // 成功支付笔数
    successfulAmount: number;      // 成功支付金额
    transactions: ShouqianbaTransaction[];
    paymentMethods: {
        [key: string]: {
            count: number;
            amount: number;
        }
    };
}

export class ShouqianbaService {
    private static instance: ShouqianbaService;
    private config!: ShouqianbaConfig;

    private constructor() {
        this.loadConfig();
    }

    public static getInstance(): ShouqianbaService {
        if (!ShouqianbaService.instance) {
            ShouqianbaService.instance = new ShouqianbaService();
        }
        return ShouqianbaService.instance;
    }

    private loadConfig() {
        try {
            // 检测当前运行环境，如果是编译后的代码则使用dist目录
            const isCompiledCode = __filename.includes('dist');
            const rootDir = isCompiledCode 
                ? path.resolve(__dirname, '../../')
                : path.resolve(__dirname, '../../');
            
            const configDir = isCompiledCode ? 'dist/config' : 'src/config';
            const configPath = path.join(rootDir, configDir, 'shouqianba.json');
            
            console.log('收钱吧配置文件路径:', configPath);
            
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch (error) {
            console.error('加载收钱吧配置失败:', error);
            throw error;
        }
    }

    // 生成签名
    private generateSignature(params: any, key: string): string {
        // 按key排序并拼接
        const sortedParams = Object.keys(params)
            .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');
        
        const signString = sortedParams + key;
        return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
    }

    // 查询单笔订单
    public async queryTransaction(clientSn?: string, sn?: string): Promise<ShouqianbaTransaction | null> {
        try {
            const params: any = {
                terminal_sn: this.config.terminal_sn
            };

            if (sn) {
                params.sn = sn;
            } else if (clientSn) {
                params.client_sn = clientSn;
            } else {
                throw new Error('必须提供 client_sn 或 sn 参数');
            }

            // 生成签名
            const sign = this.generateSignature(params, this.config.terminal_key);
            params.sign = sign;

            const url = `${this.config.api_domain}/upay/v2/query`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (data.result_code === 'SUCCESS' && data.biz_response?.result_code === 'SUCCESS') {
                return data.biz_response.data as ShouqianbaTransaction;
            } else {
                console.error('查询交易失败:', data.error_message || data.biz_response?.error_message);
                return null;
            }
        } catch (error) {
            console.error('查询交易出错:', error);
            return null;
        }
    }

    // 获取指定日期范围的收款汇总
    // 注意：收钱吧API不直接支持批量查询，这里需要根据商户的订单号规则来查询
    public async getPaymentSummary(startDate: string, endDate: string, orderPrefix?: string): Promise<PaymentReconciliationSummary> {
        console.log(`\n🔍 开始获取收钱吧收款数据: ${startDate} 至 ${endDate}`);
        
        const summary: PaymentReconciliationSummary = {
            date: endDate,
            totalPayments: 0,
            totalAmount: 0,
            successfulPayments: 0,
            successfulAmount: 0,
            transactions: [],
            paymentMethods: {}
        };

        try {
            // 由于收钱吧API限制，这里需要根据商户的订单编号规则来查询
            // 这是一个示例实现，实际使用时需要根据您的订单号规则调整
            console.log('⚠️  收钱吧API限制：需要提供具体的订单号进行查询');
            console.log('💡 建议：');
            console.log('   1. 如果您有完整的订单号列表，请提供给系统');
            console.log('   2. 或者使用收钱吧商户后台的对账单功能');
            console.log('   3. 或者接入收钱吧的商户系统推送功能');

            // 这里可以根据您的业务需求实现具体的查询逻辑
            // 例如：根据日期生成可能的订单号，然后逐一查询

        } catch (error) {
            console.error('获取收钱吧收款数据出错:', error);
        }

        return summary;
    }

    // 验证配置是否正确
    public async validateConfig(): Promise<boolean> {
        try {
            // 可以通过查询一个已知订单来验证配置
            console.log('验证收钱吧配置...');
            
            if (!this.config.terminal_sn || !this.config.terminal_key) {
                console.error('收钱吧配置不完整');
                return false;
            }

            console.log('✅ 收钱吧配置验证通过');
            return true;
        } catch (error) {
            console.error('收钱吧配置验证失败:', error);
            return false;
        }
    }

    // 格式化支付方式名称
    private getPaymentMethodName(payway: string): string {
        const paymentMethods: { [key: string]: string } = {
            '1': '支付宝',
            '2': '微信',
            '3': '银联',
            '4': '百度钱包',
            '5': 'QQ钱包',
            '6': '京东钱包'
        };
        return paymentMethods[payway] || `未知支付方式(${payway})`;
    }

    // 将收钱吧金额（分）转换为元
    private centToYuan(cents: string | number): number {
        return parseInt(cents.toString()) / 100;
    }
} 