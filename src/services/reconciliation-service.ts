import * as fs from 'fs';
import * as path from 'path';
import { TokenManager } from '../common/token';

interface CardTurnoverData {
    CradName: string;
    allCountsk: number;    // 售卡数量
    allAmountsk: number;   // 售卡总金额
    allCountxf: number;    // 消费次数
    allAmountxf: number;   // 消费总金额
    CradID: number;
}

interface MemberBalanceData {
    Name: string;
    Phone: string;
    Amount: string;        // 卡内余额
    PurchaseAmount: string; // 购买金额
    CardName: string;
    vid: string;
}

interface MemberConsumptionData {
    Name: string;
    Phone: string;
    Amount: number;        // 购买金额
    sumAmount: string;     // 已消费金额
    allCount: string;      // 消费次数
    MembersID: string;
}

interface ReconciliationResult {
    date: string;
    totalSales: number;           // 总销售额（售卡+续费）
    totalBalance: number;         // 所有会员卡余额
    totalConsumption: number;     // 所有会员已消费金额
    calculatedTotal: number;      // 余额 + 已消费 = 应该等于总销售额
    difference: number;           // 差额
    isBalanced: boolean;          // 是否平账
    details: {
        cardSales: CardTurnoverData[];
        memberBalances: MemberBalanceData[];
        memberConsumptions: MemberConsumptionData[];
    };
    salesBreakdown?: {            // 销售额明细
        salesAmount: number;      // 售卡金额
        rechargeAmount: number;   // 续费金额
        salesCount: number;       // 售卡笔数
        rechargeCount: number;    // 续费笔数
    };
}

export class ReconciliationService {
    private static instance: ReconciliationService;
    private tokenManager: TokenManager;
    private readonly OPERATION_START_DATE = '2025-05-28';

    private constructor() {
        this.tokenManager = TokenManager.getInstance();
    }

    public static getInstance(): ReconciliationService {
        if (!ReconciliationService.instance) {
            ReconciliationService.instance = new ReconciliationService();
        }
        return ReconciliationService.instance;
    }

    // 获取售卡统计信息
    private async getCardTurnover(startDate: string, endDate: string): Promise<CardTurnoverData[]> {
        try {
            const token = this.tokenManager.getToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getCradTurnover.aspx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    "StoresID": "1517",
                    "Stime": startDate,
                    "Etime": endDate,
                    "stype": "4",
                    "SelectCardID": "",
                    "token": token
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (data.orsuccess === '1' && data.listall) {
                return data.listall;
            } else {
                console.error('获取售卡统计失败:', data.Msg || '未知错误');
                return [];
            }
        } catch (error) {
            console.error('获取售卡统计出错:', error);
            return [];
        }
    }

    // 获取会员卡余额信息（分页获取所有数据）
    private async getAllMemberBalances(): Promise<MemberBalanceData[]> {
        try {
            const token = this.tokenManager.getToken();
            let allMembers: MemberBalanceData[] = [];
            let currentPage = 1;
            const pageSize = 100;
            let hasMoreData = true;

            while (hasMoreData) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListSYKSMembers.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        "pages": currentPage,
                        "psize": pageSize,
                        "StoresID": "1517",
                        "SelectName": "",
                        "CardType": "4",
                        "OderType": "1",
                        "CardDays1": "0",
                        "CardDays2": "0",
                        "Amount1": "99999",
                        "Amount2": "0",
                        "CardNumber1": "30",
                        "CardNumber2": "0",
                        "selectCardID": "",
                        "token": token
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                const data = await response.json();

                if (data.orsuccess === '1' && data.data) {
                    allMembers.push(...data.data);
                    
                    // 如果返回的数据少于页面大小，说明已经是最后一页
                    if (data.data.length < pageSize) {
                        hasMoreData = false;
                    } else {
                        currentPage++;
                    }
                } else {
                    console.error(`获取会员余额第${currentPage}页失败:`, data.Msg || '未知错误');
                    hasMoreData = false;
                }

                // 添加延迟避免请求过快
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            console.log(`获取到 ${allMembers.length} 个会员的余额信息`);
            return allMembers;
        } catch (error) {
            console.error('获取会员余额出错:', error);
            return [];
        }
    }

    // 获取会员消费统计信息
    private async getMemberConsumptions(startDate: string, endDate: string): Promise<MemberConsumptionData[]> {
        try {
            const token = this.tokenManager.getToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListOrderRecordTJ.aspx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    "StoresID": "1517",
                    "sTime": startDate,
                    "eTime": endDate,
                    "stype": "4",
                    "SelectName": "",
                    "token": token
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (data.orsuccess === '1' && data.data) {
                return data.data;
            } else {
                console.error('获取会员消费统计失败:', data.Msg || '未知错误');
                return [];
            }
        } catch (error) {
            console.error('获取会员消费统计出错:', error);
            return [];
        }
    }

    // 执行核账
    public async performReconciliation(targetDate?: string): Promise<ReconciliationResult> {
        const endDate = targetDate || new Date().toISOString().split('T')[0];
        const startDate = this.OPERATION_START_DATE;

        console.log(`\n🔍 开始核账: ${startDate} 至 ${endDate}`);
        console.log('='.repeat(50));

        try {
            // 并行获取数据
            const [cardSales, memberBalances, memberConsumptions] = await Promise.all([
                this.getCardTurnover(startDate, endDate),
                this.getAllMemberBalances(),
                this.getMemberConsumptions(startDate, endDate)
            ]);

            // 计算总销售额（售卡金额 + 续费金额）
            const totalSales = cardSales.reduce((sum, card) => {
                return sum + card.allAmountsk + card.allAmountxf;
            }, 0);

            // 计算所有会员卡余额
            const totalBalance = memberBalances.reduce((sum, member) => {
                return sum + parseFloat(member.Amount || '0');
            }, 0);

            // 计算所有会员已消费金额
            const totalConsumption = memberConsumptions.reduce((sum, member) => {
                return sum + parseFloat(member.sumAmount || '0');
            }, 0);

            // 计算应该的总额（余额 + 已消费）
            const calculatedTotal = totalBalance + totalConsumption;

            // 计算差额
            const difference = totalSales - calculatedTotal;
            const isBalanced = Math.abs(difference) < 0.01; // 允许1分钱的误差

            const result: ReconciliationResult = {
                date: endDate,
                totalSales,
                totalBalance,
                totalConsumption,
                calculatedTotal,
                difference,
                isBalanced,
                details: {
                    cardSales,
                    memberBalances,
                    memberConsumptions
                }
            };

            // 输出核账结果
            this.printReconciliationResult(result);

            // 保存核账结果到文件
            await this.saveReconciliationResult(result);

            return result;
        } catch (error) {
            console.error('核账过程中出错:', error);
            throw error;
        }
    }

    // 打印核账结果
    private printReconciliationResult(result: ReconciliationResult) {
        console.log(`\n📊 核账结果 (${result.date})`);
        console.log('='.repeat(50));
        
        // 显示销售额明细
        if (result.salesBreakdown) {
            console.log(`💰 售卡金额:     ¥${result.salesBreakdown.salesAmount.toFixed(2)} (${result.salesBreakdown.salesCount}笔)`);
            console.log(`💰 续费金额:     ¥${result.salesBreakdown.rechargeAmount.toFixed(2)} (${result.salesBreakdown.rechargeCount}笔)`);
            console.log(`💰 总销售额:     ¥${result.totalSales.toFixed(2)}`);
        } else {
            console.log(`💰 总销售额:     ¥${result.totalSales.toFixed(2)}`);
        }
        
        console.log(`💳 会员卡余额:   ¥${result.totalBalance.toFixed(2)}`);
        console.log(`🛒 已消费金额:   ¥${result.totalConsumption.toFixed(2)}`);
        console.log(`🧮 计算总额:     ¥${result.calculatedTotal.toFixed(2)}`);
        console.log(`📈 差额:         ¥${result.difference.toFixed(2)}`);
        
        if (result.isBalanced) {
            console.log(`✅ 账目平衡`);
        } else {
            console.log(`❌ 账目不平衡！差额: ¥${result.difference.toFixed(2)}`);
            
            // 提供详细的不平衡分析
            console.log(`\n🔍 不平衡分析:`);
            if (result.difference > 0) {
                console.log(`   销售额大于余额+消费，可能原因:`);
                console.log(`   - 有退卡但未在系统中体现`);
                console.log(`   - 有消费记录丢失`);
                console.log(`   - 数据同步延迟`);
            } else {
                console.log(`   销售额小于余额+消费，可能原因:`);
                console.log(`   - 有重复的消费记录`);
                console.log(`   - 有未记录的售卡/续费`);
                console.log(`   - 系统数据异常`);
            }
        }

        console.log(`\n📋 数据统计:`);
        console.log(`   售卡+续费记录: ${result.details.cardSales.length} 条`);
        console.log(`   会员余额: ${result.details.memberBalances.length} 个会员`);
        console.log(`   消费记录: ${result.details.memberConsumptions.length} 个会员`);
    }

    // 保存核账结果到文件
    private async saveReconciliationResult(result: ReconciliationResult) {
        try {
            const logDir = path.join(__dirname, '../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const fileName = `reconciliation_${result.date.replace(/-/g, '')}.json`;
            const filePath = path.join(logDir, fileName);

            fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
            console.log(`\n💾 核账结果已保存到: ${filePath}`);
        } catch (error) {
            console.error('保存核账结果失败:', error);
        }
    }

    // 测试核账功能
    public async testReconciliation() {
        console.log('🧪 开始测试核账功能...');
        try {
            const result = await this.performReconciliation();
            console.log('\n✅ 核账测试完成');
            return result;
        } catch (error) {
            console.error('❌ 核账测试失败:', error);
            throw error;
        }
    }
} 