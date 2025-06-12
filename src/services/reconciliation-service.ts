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

// 新增：详细操作记录接口
interface AdminHypeRecord {
    HypeID: string;
    Note: string;
    Hypetype: string;      // "0"=充值/续卡, "2"=消课
    MembersID: string;     // 会员卡ID
    MembersvipID: string;  // 用户ID
    Hypeinfo: string;      // 操作信息，包含金额："【本次金额】 为 480"、"【撤回金额】 为 94.00"
    PayAmount: string;     // 支付金额
    ID: string;
    addTime: string;       // 操作时间
    HypeName: string;      // 操作员名称
}

// 新增：用户准确消费数据
interface MemberAccurateConsumption {
    Name: string;
    Phone: string;
    MembersvipID: string;
    totalConsumption: number;    // 准确的总消费金额
    consumptionCount: number;    // 消费次数
    cancelledAmount: number;     // 撤销金额
    netConsumption: number;      // 净消费（消费-撤销）
}

interface ReconciliationResult {
    startDate: string;
    endDate: string;
    totalSalesAmount: number;
    totalMemberBalance: number;
    totalConsumption: number;
    difference: number;
    isBalanced: boolean;
    details: {
        cardSales: CardTurnoverData[];
        memberBalances: MemberBalanceData[];
        memberConsumptions: MemberConsumptionData[]; // 保留兼容性
        accurateConsumptions: MemberAccurateConsumption[];
    };
    salesBreakdown?: {            // 销售额明细
        cardSalesAmount: number;   // 售卡金额
        renewalAmount: number;     // 续费金额
        totalSalesAmount: number;  // 总销售额
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

    // 新增：获取单个用户的详细操作记录
    private async getUserAdminHypeRecords(membersvipID: string, startDate?: string): Promise<AdminHypeRecord[]> {
        try {
            const token = this.tokenManager.getToken();
            let allRecords: AdminHypeRecord[] = [];
            let currentPage = 1;
            const pageSize = 100;
            let hasMoreData = true;

            while (hasMoreData) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListAdminHype.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        "MembersvipID": membersvipID,
                        "pages": currentPage,
                        "psize": pageSize,
                        "token": token
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                const data = await response.json();

                if (data.orsuccess === '1' && data.data) {
                    let records = data.data;
                    
                    // 如果指定了开始日期，则过滤记录
                    if (startDate) {
                        records = records.filter((record: AdminHypeRecord) => {
                            if (!record.addTime) return false;
                            
                            // 解析日期格式，支持 "2025/6/11 11:08:50" 格式
                            const recordDate = new Date(record.addTime.replace(/\//g, '-'));
                            const filterDate = new Date(startDate);
                            
                            return recordDate >= filterDate;
                        });
                    }
                    
                    allRecords.push(...records);
                    
                    // 如果返回的数据少于页面大小，说明已经是最后一页
                    if (data.data.length < pageSize) {
                        hasMoreData = false;
                    } else {
                        currentPage++;
                    }
                } else {
                    console.error(`获取用户 ${membersvipID} 操作记录第${currentPage}页失败:`, data.Msg || '未知错误');
                    hasMoreData = false;
                }

                // 添加延迟避免请求过快
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            return allRecords;
        } catch (error) {
            console.error(`获取用户 ${membersvipID} 操作记录出错:`, error);
            return [];
        }
    }

    // 新增：计算用户准确的消费金额
    private calculateAccurateConsumption(records: AdminHypeRecord[], userName: string, userPhone: string, membersvipID: string): MemberAccurateConsumption {
        let totalConsumption = 0;
        let consumptionCount = 0;
        let cancelledAmount = 0;

        // 只处理消课类型的记录（Hypetype = "2"）
        const consumptionRecords = records.filter(record => record.Hypetype === "2");

        for (const record of consumptionRecords) {
            // 从 Hypeinfo 中提取金额
            const hypeinfo = record.Hypeinfo || '';
            
            // 匹配正常消课：【本次金额】 为 480
            const consumptionMatch = hypeinfo.match(/【本次金额】\s*为\s*([\d.]+)/);
            if (consumptionMatch) {
                const amount = parseFloat(consumptionMatch[1]);
                totalConsumption += amount;
                consumptionCount++;
                continue;
            }

            // 匹配撤销消课：【撤回金额】 为 94.00
            const cancelMatch = hypeinfo.match(/【撤回金额】\s*为\s*([\d.]+)/);
            if (cancelMatch) {
                const amount = parseFloat(cancelMatch[1]);
                cancelledAmount += amount;
                continue;
            }

            // 备用方案：如果Hypeinfo解析失败，使用PayAmount
            if (!consumptionMatch && !cancelMatch && record.PayAmount) {
                const payAmount = parseFloat(record.PayAmount);
                if (payAmount > 0) {
                    totalConsumption += payAmount;
                    consumptionCount++;
                }
            }
        }

        const netConsumption = totalConsumption - cancelledAmount;

        return {
            Name: userName,
            Phone: userPhone,
            MembersvipID: membersvipID,
            totalConsumption,
            consumptionCount,
            cancelledAmount,
            netConsumption
        };
    }

    // 新增：获取所有用户的准确消费数据
    private async getAllMemberAccurateConsumptions(memberBalances: MemberBalanceData[], startDate: string): Promise<MemberAccurateConsumption[]> {
        console.log('🔍 开始获取所有用户的准确消费记录...');
        
        const accurateConsumptions: MemberAccurateConsumption[] = [];
        let processedCount = 0;

        for (const member of memberBalances) {
            try {
                // 获取用户的详细操作记录
                const records = await this.getUserAdminHypeRecords(member.vid, startDate);
                
                // 计算准确的消费金额
                const consumption = this.calculateAccurateConsumption(
                    records, 
                    member.Name, 
                    member.Phone, 
                    member.vid
                );
                
                accurateConsumptions.push(consumption);
                
                processedCount++;
                if (processedCount % 10 === 0) {
                    console.log(`⏳ 已处理 ${processedCount}/${memberBalances.length} 个用户的消费记录`);
                }

            } catch (error) {
                console.error(`处理用户 ${member.Name} (${member.Phone}) 的消费记录时出错:`, error);
                
                // 出错时创建一个空的消费记录
                accurateConsumptions.push({
                    Name: member.Name,
                    Phone: member.Phone,
                    MembersvipID: member.vid,
                    totalConsumption: 0,
                    consumptionCount: 0,
                    cancelledAmount: 0,
                    netConsumption: 0
                });
                processedCount++;
            }
        }

        console.log(`✅ 完成所有用户消费记录处理，共 ${accurateConsumptions.length} 个用户`);
        return accurateConsumptions;
    }

    // 执行核账
    public async performReconciliation(startDate: string, endDate: string): Promise<ReconciliationResult> {
        try {
            console.log(`🔄 开始执行核账: ${startDate} 至 ${endDate}`);

            // 获取售卡数据
            console.log('📊 获取售卡数据...');
            const cardSales = await this.getCardTurnover(startDate, endDate);

            // 获取会员余额数据
            console.log('👥 获取会员余额数据...');
            const memberBalances = await this.getAllMemberBalances();

            // 获取准确的会员消费数据（替代原有的聚合统计方法）
            console.log('💰 获取准确的会员消费数据...');
            const accurateConsumptions = await this.getAllMemberAccurateConsumptions(memberBalances, startDate);

            // 计算总额
            const totalSalesAmount = cardSales.reduce((sum, card) => sum + card.allAmountsk + card.allAmountxf, 0);
            const totalMemberBalance = memberBalances.reduce((sum, member) => sum + parseFloat(member.Amount), 0);
            const totalAccurateConsumption = accurateConsumptions.reduce((sum, consumption) => sum + consumption.netConsumption, 0);

            // 核账计算：销售额 = 会员余额 + 消费金额
            const difference = totalSalesAmount - (totalMemberBalance + totalAccurateConsumption);
            const isBalanced = Math.abs(difference) < 0.01;

            console.log('📋 核账汇总:');
            console.log(`  总销售额: ¥${totalSalesAmount.toFixed(2)}`);
            console.log(`  会员余额: ¥${totalMemberBalance.toFixed(2)}`);
            console.log(`  准确消费: ¥${totalAccurateConsumption.toFixed(2)}`);
            console.log(`  差额: ¥${difference.toFixed(2)} ${isBalanced ? '✅' : '❌'}`);

            const result: ReconciliationResult = {
                startDate,
                endDate,
                totalSalesAmount,
                totalMemberBalance,
                totalConsumption: totalAccurateConsumption,
                difference,
                isBalanced,
                details: {
                    cardSales,
                    memberBalances,
                    memberConsumptions: [], // 保留兼容性
                    accurateConsumptions   // 新增准确的消费数据
                }
            };

            // 保存核账结果
            await this.saveReconciliationResult(result);
            
            console.log(`${isBalanced ? '✅' : '❌'} 核账完成`);
            return result;

        } catch (error) {
            console.error('❌ 核账执行失败:', error);
            throw error;
        }
    }

    // 打印核账结果
    private printReconciliationResult(result: ReconciliationResult) {
        console.log(`\n📊 核账结果 (${result.endDate})`);
        console.log('='.repeat(50));
        
        // 显示销售额明细
        if (result.salesBreakdown) {
            console.log(`💰 售卡金额:     ¥${result.salesBreakdown.cardSalesAmount.toFixed(2)} (${result.details.cardSales.length}笔)`);
            console.log(`💰 续费金额:     ¥${result.salesBreakdown.renewalAmount.toFixed(2)} (${result.details.memberConsumptions.length}笔)`);
            console.log(`💰 总销售额:     ¥${result.totalSalesAmount.toFixed(2)}`);
        } else {
            console.log(`💰 总销售额:     ¥${result.totalSalesAmount.toFixed(2)}`);
        }
        
        console.log(`💳 会员卡余额:   ¥${result.totalMemberBalance.toFixed(2)}`);
        console.log(`🛒 已消费金额:   ¥${result.totalConsumption.toFixed(2)}`);
        console.log(`🧮 计算总额:     ¥${result.totalMemberBalance.toFixed(2) + result.totalConsumption.toFixed(2)}`);
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

            const fileName = `reconciliation_${result.endDate.replace(/-/g, '')}.json`;
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
            const result = await this.performReconciliation('2025-05-28', new Date().toISOString().split('T')[0]);
            console.log('\n✅ 核账测试完成');
            return result;
        } catch (error) {
            console.error('❌ 核账测试失败:', error);
            throw error;
        }
    }
} 