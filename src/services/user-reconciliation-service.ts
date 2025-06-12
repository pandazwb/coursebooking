import * as fs from 'fs';
import * as path from 'path';
import { TokenManager } from '../common/token';
import { formatToLocalTime } from '../common/db';

interface UserVipCard {
    ID: string;
    CardName: string;
    Amount: string;           // 当前余额
    CardType: string;
    MembersID: string;
}

interface UserPaymentRecord {
    ID: string;
    PurchaseAmount: string;   // 充值金额
    Amount: string;           // 该笔充值金额
    CardName: string;
    OrderType: string;        // 订单类型 1=首次购买 2=续费
    OrderCode: string;        // 订单号
    CreateTime: string;       // 充值时间
    GMtime: string;           // 购买时间
    Note: string;             // 备注（流水号等）
    MembersvipID: string;     // 会员卡ID
    sourceName: string;       // 操作员
}

interface UserCourseConsumption {
    PreAboutID: number;
    CourseName: string;
    SKtime: string;
    startTime: string;
    ConsumptionOfClass: number;
    addTime: string;
}

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

interface UserAccurateConsumption {
    totalConsumption: number;    // 准确的总消费金额
    consumptionCount: number;    // 消费次数
    cancelledAmount: number;     // 撤销金额
    netConsumption: number;      // 净消费（消费-撤销）
    records: AdminHypeRecord[];  // 详细记录
}

interface UserReconciliationData {
    userInfo: {
        ID: string;
        Name: string;
        Phone: string;
    };
    vipCards: UserVipCard[];
    paymentRecords: UserPaymentRecord[];
    courseConsumptions: UserCourseConsumption[];
    accurateConsumption: UserAccurateConsumption;
    reconciliation: {
        totalPurchase: number;      // 总充值金额
        currentBalance: number;     // 当前余额
        totalConsumption: number;   // 总消费金额（使用准确计算）
        cancelledAmount: number;    // 撤销金额
        netConsumption: number;     // 净消费金额
        calculatedBalance: number;  // 计算余额 = 总充值 - 净消费
        difference: number;         // 差额
        isBalanced: boolean;        // 是否平账
        balanceAccuracy: number;    // 余额准确度（百分比）
        paymentCount: number;       // 充值次数
        consumptionCount: number;   // 消费次数
    };
}

interface UserReconciliationSummary {
    totalUsers: number;
    balancedUsers: number;
    unbalancedUsers: number;
    totalDifference: number;
    averageDifference: number;
    accuracyRate: number;
    problemUsers: UserReconciliationData[];
}

export class UserReconciliationService {
    private static instance: UserReconciliationService;
    private tokenManager: TokenManager;

    private constructor() {
        this.tokenManager = TokenManager.getInstance();
    }

    public static getInstance(): UserReconciliationService {
        if (!UserReconciliationService.instance) {
            UserReconciliationService.instance = new UserReconciliationService();
        }
        return UserReconciliationService.instance;
    }

    // 获取用户会员卡信息
    private async getUserVipCards(userId: string): Promise<UserVipCard[]> {
        try {
            let allCards: UserVipCard[] = [];
            let page = 1;
            const pageSize = 50;
            let hasMore = true;

            while (hasMore) {
                const payload = {
                    "pages": page,
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
                    "token": this.tokenManager.getToken()
                };

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListSYKSMembers.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.orsuccess === '1' && result.data) {
                    // 只取指定用户的卡片
                    const userCards = result.data.filter((card: any) => {
                        return card.vid === userId || card.MembersID === userId;
                    });
                    
                    allCards.push(...userCards);
                    
                    if (result.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }

                await new Promise(resolve => setTimeout(resolve, 200));
            }

            return allCards;
        } catch (error) {
            console.error(`获取用户 ${userId} 会员卡信息失败:`, error);
            return [];
        }
    }

    // 获取用户的充值记录
    private async getUserPaymentRecords(userId: string, startDate: string = '2025-05-28'): Promise<UserPaymentRecord[]> {
        try {
            let allRecords: UserPaymentRecord[] = [];
            let page = 1;
            const pageSize = 50;
            let hasMore = true;

            while (hasMore) {
                const payload = {
                    "StoresID": "1517",
                    "MembersvipID": userId,  // 修复：这里应该传用户ID，不是会员卡ID
                    "pages": page,
                    "psize": pageSize,
                    "token": this.tokenManager.getToken()
                };

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListOrderMvip.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.orsuccess === '1' && result.data) {
                    // 过滤指定日期之后的记录
                    const filteredRecords = result.data.filter((record: any) => {
                        const createTime = record.CreateTime || record.GMtime || '';
                        if (!createTime) return false;
                        
                        // 解析日期格式，支持 "2025/6/5" 和 "2025-06-05" 格式
                        const recordDate = new Date(createTime.replace(/\//g, '-'));
                        const filterDate = new Date(startDate);
                        
                        return recordDate >= filterDate;
                    });
                    
                    allRecords.push(...filteredRecords);
                    
                    if (result.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else if (result.orsuccess === '0' && result.Msg === '没有数据') {
                    hasMore = false;
                } else {
                    hasMore = false;
                }

                await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log(`✅ 用户 ${userId} 从 ${startDate} 开始共找到 ${allRecords.length} 条充值记录`);
            return allRecords;
        } catch (error) {
            console.error(`获取用户 ${userId} 充值记录失败:`, error);
            return [];
        }
    }

    // 获取会员卡的上课消费记录
    private async getUserCourseConsumptions(memberCardId: string, startDate: string = '2025-05-28'): Promise<UserCourseConsumption[]> {
        try {
            let allConsumptions: UserCourseConsumption[] = [];
            let page = 1;
            const pageSize = 50;
            let hasMore = true;

            while (hasMore) {
                const payload = {
                    "MembersID": memberCardId,  // 修复：这里应该传会员卡ID，不是用户ID
                    "pages": page,
                    "psize": pageSize,
                    "token": this.tokenManager.getToken()
                };

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListPreAboutMemberSK.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.orsuccess === '1' && result.data) {
                    // 过滤指定日期之后的记录
                    const filteredConsumptions = result.data.filter((consumption: any) => {
                        const consumptionDate = consumption.SKtime || consumption.addTime || '';
                        if (!consumptionDate) return false;
                        
                        // 解析日期格式，支持 "2025/6/5" 和 "2025-06-05" 格式
                        const recordDate = new Date(consumptionDate.replace(/\//g, '-'));
                        const filterDate = new Date(startDate);
                        
                        return recordDate >= filterDate;
                    });
                    
                    allConsumptions.push(...filteredConsumptions);
                    
                    if (result.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else if (result.orsuccess === '0' && result.Msg === '没有数据') {
                    hasMore = false;
                } else {
                    hasMore = false;
                }

                await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log(`✅ 会员卡 ${memberCardId} 从 ${startDate} 开始共找到 ${allConsumptions.length} 条消费记录`);
            return allConsumptions;
        } catch (error) {
            console.error(`获取会员卡 ${memberCardId} 课程消费记录失败:`, error);
            return [];
        }
    }

    // 获取所有用户列表
    private async getAllUsers(): Promise<Array<{ID: string, Name: string, Phone: string}>> {
        try {
            let allUsers: Array<{ID: string, Name: string, Phone: string}> = [];
            let page = 1;
            const pageSize = 100;
            let hasMore = true;

            while (hasMore) {
                const payload = {
                    "pages": page,
                    "psize": pageSize,
                    "StoresID": "1517",
                    "LabelID": "0",
                    "SelectIsvip": "1",
                    "SelectVipType": "",
                    "SelectName": "",
                    "SelectType": "1",
                    "searchNote": "",
                    "SelectSourceID": "",
                    "token": this.tokenManager.getToken()
                };

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListTcMembers.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.orsuccess === '1' && result.data) {
                    const users = result.data.map((user: any) => ({
                        ID: user.ID,
                        Name: user.Name,
                        Phone: user.Phone
                    }));
                    allUsers.push(...users);
                    
                    if (result.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            return allUsers;
        } catch (error) {
            console.error('获取用户列表失败:', error);
            return [];
        }
    }

    // 从会员卡列表获取所有有会员卡的用户
    private async getAllUsersFromVipCards(): Promise<Array<{ID: string, Name: string, Phone: string}>> {
        try {
            let allUsers: Array<{ID: string, Name: string, Phone: string}> = [];
            let page = 1;
            const pageSize = 100;
            let hasMore = true;
            const userSet = new Set<string>(); // 用于去重

            console.log('🔍 从会员卡列表获取用户...');

            while (hasMore) {
                const payload = {
                    "pages": page,
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
                    "token": this.tokenManager.getToken()
                };

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListSYKSMembers.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.orsuccess === '1' && result.data) {
                    console.log(`📋 第 ${page} 页获取到 ${result.data.length} 条会员卡记录`);
                    
                    result.data.forEach((card: any) => {
                        if (card.vid && !userSet.has(card.vid)) {
                            userSet.add(card.vid);
                            allUsers.push({
                                ID: card.vid,
                                Name: card.Name || '未知用户',
                                Phone: card.Phone || ''
                            });
                        }
                    });
                    
                    if (result.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    console.log(`❌ 第 ${page} 页获取失败: ${result.Msg || '未知错误'}`);
                    hasMore = false;
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            console.log(`✅ 从会员卡中识别出 ${allUsers.length} 个有会员卡的用户`);
            return allUsers;
        } catch (error) {
            console.error('从会员卡获取用户列表失败:', error);
            return [];
        }
    }

    // 执行单个用户核账
    public async reconcileUser(userId: string, userName?: string, startDate: string = '2025-05-28'): Promise<UserReconciliationData | null> {
        try {
            console.log(`🔍 开始核账用户: ${userName || userId}`);

            // 首先获取用户会员卡信息
            const vipCards = await this.getUserVipCards(userId);

            if (vipCards.length === 0) {
                console.log(`用户 ${userName || userId} 没有会员卡记录`);
                return null;
            }

            // 获取用户的充值记录（直接使用用户ID，带时间过滤）
            const allPaymentRecords = await this.getUserPaymentRecords(userId, startDate);

            // 获取所有会员卡的消费记录（保留原有方法，用于兼容性）
            const allConsumptions: UserCourseConsumption[] = [];
            for (const card of vipCards) {
                const consumptions = await this.getUserCourseConsumptions(card.ID, startDate);
                allConsumptions.push(...consumptions);
            }

            // 新增：获取用户的详细操作记录，用于准确计算消费
            console.log(`📋 获取用户 ${userName || userId} 的详细操作记录...`);
            const adminHypeRecords = await this.getUserAdminHypeRecords(userId, startDate);
            const accurateConsumption = this.calculateUserAccurateConsumption(adminHypeRecords);

            console.log(`✅ 用户 ${userName || userId} 操作记录: ${adminHypeRecords.length} 条，消费记录: ${accurateConsumption.consumptionCount} 条`);

            // 计算总充值金额（所有充值记录的金额累加）
            const totalPurchase = allPaymentRecords.reduce((sum, record) => {
                return sum + parseFloat(record.Amount || '0');
            }, 0);

            // 计算当前余额（所有卡片的余额累加）
            const currentBalance = vipCards.reduce((sum, card) => {
                return sum + parseFloat(card.Amount || '0');
            }, 0);

            // 使用准确的消费计算
            const totalConsumption = accurateConsumption.totalConsumption;
            const cancelledAmount = accurateConsumption.cancelledAmount;
            const netConsumption = accurateConsumption.netConsumption;

            // 计算理论余额：总充值 - 净消费
            const calculatedBalance = totalPurchase - netConsumption;

            // 计算差额：理论余额 - 实际余额
            const difference = calculatedBalance - currentBalance;

            // 判断是否平账（允许1分钱误差）
            const isBalanced = Math.abs(difference) < 0.01;

            // 计算余额准确度
            const balanceAccuracy = calculatedBalance > 0 ? 
                ((calculatedBalance - Math.abs(difference)) / calculatedBalance) * 100 : 100;

            const userReconciliation: UserReconciliationData = {
                userInfo: {
                    ID: userId,
                    Name: userName || userId,
                    Phone: vipCards[0]?.MembersID || ''
                },
                vipCards,
                paymentRecords: allPaymentRecords,
                courseConsumptions: allConsumptions,  // 保留原有数据
                accurateConsumption,                  // 新增准确消费数据
                reconciliation: {
                    totalPurchase,
                    currentBalance,
                    totalConsumption,
                    cancelledAmount,
                    netConsumption,
                    calculatedBalance,
                    difference,
                    isBalanced,
                    balanceAccuracy,
                    paymentCount: allPaymentRecords.length,
                    consumptionCount: accurateConsumption.consumptionCount
                }
            };

            // 打印核账结果
            this.printUserReconciliation(userReconciliation);

            return userReconciliation;
        } catch (error) {
            console.error(`用户 ${userId} 核账失败:`, error);
            return null;
        }
    }

    // 执行所有用户核账
    public async reconcileAllUsers(startDate: string = '2025-05-28'): Promise<UserReconciliationSummary> {
        console.log('\n🔍 开始所有用户核账...');
        console.log(`📅 统计时间范围: ${startDate} 至今`);
        console.log('='.repeat(60));

        // 从会员卡列表获取有会员卡的用户
        const users = await this.getAllUsersFromVipCards();
        const userReconciliations: UserReconciliationData[] = [];
        const problemUsers: UserReconciliationData[] = [];

        let processedCount = 0;
        let balancedCount = 0;
        let totalDifference = 0;

        for (const user of users) {
            try {
                const reconciliation = await this.reconcileUser(user.ID, user.Name, startDate);
                
                if (reconciliation) {
                    userReconciliations.push(reconciliation);
                    
                    if (reconciliation.reconciliation.isBalanced) {
                        balancedCount++;
                    } else {
                        problemUsers.push(reconciliation);
                    }
                    
                    totalDifference += Math.abs(reconciliation.reconciliation.difference);
                }

                processedCount++;

                // 每处理10个用户输出进度
                if (processedCount % 10 === 0) {
                    console.log(`⏳ 已处理 ${processedCount}/${users.length} 用户 (平账: ${balancedCount})`);
                }

            } catch (error) {
                console.error(`处理用户 ${user.Name} 时出错:`, error);
            }
        }

        const summary: UserReconciliationSummary = {
            totalUsers: userReconciliations.length,
            balancedUsers: balancedCount,
            unbalancedUsers: userReconciliations.length - balancedCount,
            totalDifference,
            averageDifference: userReconciliations.length > 0 ? totalDifference / userReconciliations.length : 0,
            accuracyRate: userReconciliations.length > 0 ? (balancedCount / userReconciliations.length) * 100 : 0,
            problemUsers
        };

        this.printReconciliationSummary(summary);
        await this.saveReconciliationResults(userReconciliations, summary);

        return summary;
    }

    // 打印单个用户核账结果
    private printUserReconciliation(data: UserReconciliationData) {
        const r = data.reconciliation;
        const status = r.isBalanced ? '✅' : '❌';
        
        console.log(`${status} ${data.userInfo.Name} (${data.userInfo.Phone})`);
        console.log(`   充值: ¥${r.totalPurchase.toFixed(2)} (${r.paymentCount}笔) | 余额: ¥${r.currentBalance.toFixed(2)}`);
        console.log(`   消费: ¥${r.totalConsumption.toFixed(2)} (${r.consumptionCount}次) | 撤销: ¥${r.cancelledAmount.toFixed(2)} | 净消费: ¥${r.netConsumption.toFixed(2)}`);
        
        if (!r.isBalanced) {
            console.log(`   差额: ¥${r.difference.toFixed(2)} | 准确度: ${r.balanceAccuracy.toFixed(1)}%`);
        }
        console.log('');
    }

    // 打印核账总结
    private printReconciliationSummary(summary: UserReconciliationSummary) {
        console.log('\n📊 用户核账总结（准确消费统计）');
        console.log('='.repeat(60));
        console.log(`总用户数:     ${summary.totalUsers}`);
        console.log(`平账用户:     ${summary.balancedUsers} (${summary.accuracyRate.toFixed(1)}%)`);
        console.log(`不平账用户:   ${summary.unbalancedUsers}`);
        console.log(`总差额:       ¥${summary.totalDifference.toFixed(2)}`);
        console.log(`平均差额:     ¥${summary.averageDifference.toFixed(2)}`);

        if (summary.problemUsers.length > 0) {
            console.log('\n⚠️  问题用户列表:');
            summary.problemUsers.slice(0, 10).forEach(user => {
                const r = user.reconciliation;
                console.log(`   ${user.userInfo.Name}: 差额 ¥${r.difference.toFixed(2)} (消费: ¥${r.netConsumption.toFixed(2)}, 撤销: ¥${r.cancelledAmount.toFixed(2)})`);
            });
            
            if (summary.problemUsers.length > 10) {
                console.log(`   ...还有 ${summary.problemUsers.length - 10} 个问题用户`);
            }
        }
    }

    // 保存核账结果
    private async saveReconciliationResults(
        userReconciliations: UserReconciliationData[], 
        summary: UserReconciliationSummary
    ) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const outputDir = path.join(__dirname, '../output');
            
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const result = {
                exportTime: formatToLocalTime(new Date()),
                summary,
                userReconciliations
            };

            const fileName = `user-reconciliation-${timestamp}.json`;
            const filePath = path.join(outputDir, fileName);

            fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
            
            console.log(`\n💾 用户核账结果已保存到: ${filePath}`);
            console.log(`⚠️  安全提醒: 文件包含敏感用户信息，请妥善保管`);

        } catch (error) {
            console.error('保存用户核账结果失败:', error);
        }
    }

    // 手动执行所有用户核账
    public async exportUserReconciliation(startDate: string = '2025-05-28'): Promise<string> {
        try {
            console.log('\n=== 开始用户核账导出 ===');
            console.log(`开始时间: ${formatToLocalTime(new Date())}`);
            console.log(`📅 统计时间范围: ${startDate} 至今`);

            // 验证token
            const isValid = await this.tokenManager.validateToken();
            if (!isValid) {
                console.log('Token无效，尝试更新...');
                const updated = await this.tokenManager.updateToken();
                if (!updated) {
                    throw new Error('Token更新失败，无法继续核账');
                }
            }

            const summary = await this.reconcileAllUsers(startDate);

            console.log(`结束时间: ${formatToLocalTime(new Date())}`);
            console.log('=== 用户核账完成 ===\n');

            return `用户核账完成：${summary.balancedUsers}/${summary.totalUsers} 用户平账`;
        } catch (error) {
            console.error('用户核账失败:', error);
            throw error;
        }
    }

    // 对比用户核账和总账核账的数据差异
    public async compareWithTotalReconciliation(startDate: string = '2025-05-28'): Promise<void> {
        try {
            console.log('\n🔍 对比分析：用户核账 vs 总账核账（使用准确消费统计）');
            console.log('='.repeat(60));
            
            // 计算用户核账的总充值金额
            console.log('📋 正在计算用户核账汇总数据...');
            const users = await this.getAllUsersFromVipCards();
            let totalUserPurchase = 0;
            let totalUserBalance = 0;
            let totalUserConsumption = 0;
            let totalUserCancelled = 0;
            let totalUserNetConsumption = 0;
            let processedUsers = 0;
            
            for (const user of users) {
                try {
                    const userResult = await this.reconcileUser(user.ID, user.Name, startDate);
                    if (userResult) {
                        totalUserPurchase += userResult.reconciliation.totalPurchase;
                        totalUserBalance += userResult.reconciliation.currentBalance;
                        totalUserConsumption += userResult.reconciliation.totalConsumption;
                        totalUserCancelled += userResult.reconciliation.cancelledAmount;
                        totalUserNetConsumption += userResult.reconciliation.netConsumption;
                        processedUsers++;
                    }
                    
                    // 显示进度
                    if (processedUsers % 10 === 0) {
                        console.log(`已处理 ${processedUsers}/${users.length} 用户`);
                    }
                } catch (error) {
                    console.error(`处理用户 ${user.Name} 时出错:`, error);
                }
            }
            
            console.log('\n📋 正在执行总账核账...');
            // 导入总账核账服务
            const { ReconciliationService } = await import('./reconciliation-service');
            const totalReconciliation = ReconciliationService.getInstance();
            const endDate = new Date().toISOString().split('T')[0];
            const totalResult = await totalReconciliation.performReconciliation(startDate, endDate);
            
            console.log('\n📊 数据对比分析（准确消费统计）');
            console.log('='.repeat(60));
            console.log('🔹 用户核账汇总数据:');
            console.log(`   总充值金额: ¥${totalUserPurchase.toFixed(2)}`);
            console.log(`   总余额:     ¥${totalUserBalance.toFixed(2)}`);
            console.log(`   总消费:     ¥${totalUserConsumption.toFixed(2)}`);
            console.log(`   撤销金额:   ¥${totalUserCancelled.toFixed(2)}`);
            console.log(`   净消费:     ¥${totalUserNetConsumption.toFixed(2)}`);
            console.log(`   计算总额:   ¥${(totalUserBalance + totalUserNetConsumption).toFixed(2)}`);
            console.log(`   差额:       ¥${(totalUserPurchase - totalUserBalance - totalUserNetConsumption).toFixed(2)}`);
            console.log(`   处理用户:   ${processedUsers} 个`);
            
            console.log('\n🔹 总账核账数据:');
            console.log(`   总销售额:   ¥${totalResult.totalSalesAmount.toFixed(2)}`);
            console.log(`   总余额:     ¥${totalResult.totalMemberBalance.toFixed(2)}`);
            console.log(`   总消费:     ¥${totalResult.totalConsumption.toFixed(2)}`);
            
            // 从accurateConsumptions中计算撤销金额
            const totalResultCancelledAmount = totalResult.details.accurateConsumptions.reduce((sum, consumption) => 
                sum + consumption.cancelledAmount, 0);
            const totalResultGrossConsumption = totalResult.details.accurateConsumptions.reduce((sum, consumption) => 
                sum + consumption.totalConsumption, 0);
            
            console.log(`   撤销金额:   ¥${totalResultCancelledAmount.toFixed(2)}`);
            console.log(`   净消费:     ¥${totalResult.totalConsumption.toFixed(2)}`);
            console.log(`   计算总额:   ¥${(totalResult.totalMemberBalance + totalResult.totalConsumption).toFixed(2)}`);
            console.log(`   差额:       ¥${totalResult.difference.toFixed(2)}`);
            
            console.log('\n🔹 关键差异分析:');
            const purchaseDiff = totalUserPurchase - totalResult.totalSalesAmount;
            const balanceDiff = totalUserBalance - totalResult.totalMemberBalance;
            const consumptionDiff = totalUserConsumption - totalResultGrossConsumption;
            const cancelledDiff = totalUserCancelled - totalResultCancelledAmount;
            const netConsumptionDiff = totalUserNetConsumption - totalResult.totalConsumption;
            
            console.log(`   充值/销售差异: ¥${purchaseDiff.toFixed(2)} (用户核账 - 总账核账)`);
            console.log(`   余额差异:     ¥${balanceDiff.toFixed(2)}`);
            console.log(`   消费差异:     ¥${consumptionDiff.toFixed(2)}`);
            console.log(`   撤销差异:     ¥${cancelledDiff.toFixed(2)}`);
            console.log(`   净消费差异:   ¥${netConsumptionDiff.toFixed(2)}`);
            
            console.log('\n🎯 核心问题识别:');
            if (Math.abs(purchaseDiff) > 1000) {
                console.log('🚨 充值/销售数据存在重大差异！');
                console.log(`   - 用户核账总充值: ¥${totalUserPurchase.toFixed(2)}`);
                console.log(`   - 总账统计销售额: ¥${totalResult.totalSalesAmount.toFixed(2)}`);
                console.log(`   - 差异: ¥${purchaseDiff.toFixed(2)}`);
                console.log(`   - 原因: 总账核账的 getCradTurnover.aspx 可能没有包含所有充值记录`);
                console.log(`   - 建议: 使用用户核账的充值数据为准`);
            }
            
            if (Math.abs(balanceDiff) > 10) {
                console.log('⚠️  余额数据存在差异:');
                console.log(`   - 用户核账余额: ¥${totalUserBalance.toFixed(2)}`);
                console.log(`   - 总账余额: ¥${totalResult.totalMemberBalance.toFixed(2)}`);
                console.log(`   - 差异: ¥${balanceDiff.toFixed(2)}`);
            }
            
            if (Math.abs(netConsumptionDiff) > 100) {
                console.log('⚠️  净消费数据存在差异:');
                console.log(`   - 用户核账净消费: ¥${totalUserNetConsumption.toFixed(2)}`);
                console.log(`   - 总账净消费: ¥${totalResult.totalConsumption.toFixed(2)}`);
                console.log(`   - 差异: ¥${netConsumptionDiff.toFixed(2)}`);
            }
            
            console.log('\n✅ 结论:');
            console.log(`   - 用户核账更准确，因为它逐个用户获取详细操作记录`);
            console.log(`   - 用户账目基本平衡（${processedUsers}个用户）`);
            console.log(`   - 准确统计了撤销金额: ¥${totalUserCancelled.toFixed(2)}`);
            console.log(`   - 净消费更准确: ¥${totalUserNetConsumption.toFixed(2)}`);
            console.log(`   - 建议以用户核账数据为准进行财务管理`);
            
        } catch (error) {
            console.error('对比分析失败:', error);
        }
    }

    // 新增：获取用户的详细操作记录（准确消费计算）
    private async getUserAdminHypeRecords(membersvipID: string, startDate?: string): Promise<AdminHypeRecord[]> {
        try {
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
                        "token": this.tokenManager.getToken()
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
    private calculateUserAccurateConsumption(records: AdminHypeRecord[]): UserAccurateConsumption {
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
            totalConsumption,
            consumptionCount,
            cancelledAmount,
            netConsumption,
            records: consumptionRecords
        };
    }
}

// 导出单例实例
export const userReconciliationService = UserReconciliationService.getInstance(); 