#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { ReconciliationService } from '../services/reconciliation-service';
import { UserReconciliationService } from '../services/user-reconciliation-service';

interface UserRecord {
    name: string;
    phone: string;
    maskedPhone: string;
    purchaseAmount: number;     // 充值总额（包含首次充值和续费）
    consumptionAmount: number;  // 消费总额
    remainingBalance: number;   // 剩余余额
    cardName: string;
    paymentCount: number;       // 充值次数
    createTime: string;
    lastUpdateTime: string;
}

class UserRecordsExporter {
    private reconciliationService: ReconciliationService;
    private userReconciliationService: UserReconciliationService;
    private readonly START_DATE = '2025-05-28';

    constructor() {
        this.reconciliationService = ReconciliationService.getInstance();
        this.userReconciliationService = UserReconciliationService.getInstance();
    }

    // 隐藏手机号中间四位
    private maskPhoneNumber(phone: string): string {
        if (!phone || phone.length < 7) return phone;
        
        // 保留前3位和后4位，中间用*号替代
        if (phone.length === 11) {
            return phone.substring(0, 3) + '****' + phone.substring(7);
        } else {
            // 其他长度的处理
            const start = Math.floor(phone.length * 0.3);
            const end = Math.floor(phone.length * 0.7);
            return phone.substring(0, start) + '*'.repeat(end - start) + phone.substring(end);
        }
    }

    // 获取所有用户记录
    public async getAllUserRecords(): Promise<UserRecord[]> {
        console.log('📊 开始获取用户数据...');
        
        try {
            const currentDate = new Date().toISOString().split('T')[0];
            
            // 首先获取所有用户的基本信息
            const reconciliationResult = await this.reconciliationService.performReconciliation(this.START_DATE, currentDate);
            
            console.log(`📋 获取到 ${reconciliationResult.details.memberBalances.length} 个用户的基本信息`);
            console.log('🔍 开始获取每个用户的详细充值记录...');

            const userRecords: UserRecord[] = [];
            let processedCount = 0;

            // 为每个用户获取详细的充值和消费记录
            for (const member of reconciliationResult.details.memberBalances) {
                try {
                    // 使用用户核账服务获取完整的充值记录
                    const userReconciliation = await this.userReconciliationService.reconcileUser(
                        member.vid, 
                        member.Name, 
                        this.START_DATE
                    );

                    if (userReconciliation) {
                        const userRecord: UserRecord = {
                            name: userReconciliation.userInfo.Name || '未知',
                            phone: member.Phone || '',
                            maskedPhone: this.maskPhoneNumber(member.Phone || ''),
                            purchaseAmount: userReconciliation.reconciliation.totalPurchase,
                            consumptionAmount: userReconciliation.reconciliation.totalConsumption,
                            remainingBalance: userReconciliation.reconciliation.currentBalance,
                            cardName: member.CardName || '',
                            paymentCount: userReconciliation.reconciliation.paymentCount,
                            createTime: '', // 暂时为空，API不提供此信息
                            lastUpdateTime: '' // 暂时为空，API不提供此信息
                        };

                        userRecords.push(userRecord);
                    } else {
                        // 如果用户核账失败，使用基本信息作为后备
                        const consumption = reconciliationResult.details.memberConsumptions.find(c => c.Phone === member.Phone);
                        
                        const userRecord: UserRecord = {
                            name: member.Name || '未知',
                            phone: member.Phone || '',
                            maskedPhone: this.maskPhoneNumber(member.Phone || ''),
                            purchaseAmount: parseFloat(member.PurchaseAmount || '0'), // 注意：这只是最后一次充值金额
                            consumptionAmount: consumption ? parseFloat(consumption.sumAmount || '0') : 0,
                            remainingBalance: parseFloat(member.Amount || '0'),
                            cardName: member.CardName || '',
                            paymentCount: 1, // 估算值
                            createTime: '',
                            lastUpdateTime: ''
                        };

                        userRecords.push(userRecord);
                    }

                    processedCount++;
                    if (processedCount % 10 === 0) {
                        console.log(`⏳ 已处理 ${processedCount}/${reconciliationResult.details.memberBalances.length} 个用户`);
                    }

                    // 添加延迟避免API请求过频繁
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`处理用户 ${member.Name} (${member.Phone}) 时出错:`, error);
                    
                    // 使用基本信息作为后备
                    const consumption = reconciliationResult.details.memberConsumptions.find(c => c.Phone === member.Phone);
                    
                    const userRecord: UserRecord = {
                        name: member.Name || '未知',
                        phone: member.Phone || '',
                        maskedPhone: this.maskPhoneNumber(member.Phone || ''),
                        purchaseAmount: parseFloat(member.PurchaseAmount || '0'),
                        consumptionAmount: consumption ? parseFloat(consumption.sumAmount || '0') : 0,
                        remainingBalance: parseFloat(member.Amount || '0'),
                        cardName: member.CardName || '',
                        paymentCount: 1,
                        createTime: '',
                        lastUpdateTime: ''
                    };

                    userRecords.push(userRecord);
                    processedCount++;
                }
            }

            // 按充值金额降序排序
            userRecords.sort((a, b) => b.purchaseAmount - a.purchaseAmount);

            console.log(`✅ 处理完成，共 ${userRecords.length} 条用户记录`);
            return userRecords;

        } catch (error) {
            console.error('❌ 获取用户记录失败:', error);
            throw error;
        }
    }

    // 导出为CSV格式
    public async exportToCSV(userRecords: UserRecord[], filename?: string): Promise<string> {
        try {
            const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const defaultFilename = `user_records_complete_${this.START_DATE.replace(/-/g, '')}_to_${currentDate}.csv`;
            const csvFilename = filename || defaultFilename;

            // CSV头部
            const headers = [
                '姓名',
                '手机号',
                '充值总额(元)',
                '消费总额(元)',
                '剩余余额(元)',
                '充值次数',
                '卡片类型',
                '注册时间',
                '最后更新时间'
            ];

            // 构建CSV内容
            let csvContent = headers.join(',') + '\n';

            userRecords.forEach(record => {
                const row = [
                    `"${record.name}"`,
                    `"${record.maskedPhone}"`,
                    record.purchaseAmount.toFixed(2),
                    record.consumptionAmount.toFixed(2),
                    record.remainingBalance.toFixed(2),
                    record.paymentCount,
                    `"${record.cardName}"`,
                    `"${record.createTime}"`,
                    `"${record.lastUpdateTime}"`
                ];
                csvContent += row.join(',') + '\n';
            });

            // 确保logs目录存在
            const logDir = path.join(__dirname, '../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const filePath = path.join(logDir, csvFilename);
            
            // 写入文件（使用UTF-8 BOM以确保Excel正确显示中文）
            const bom = '\uFEFF';
            fs.writeFileSync(filePath, bom + csvContent, 'utf8');

            console.log(`\n💾 CSV文件已保存到: ${filePath}`);
            return filePath;

        } catch (error) {
            console.error('❌ 导出CSV失败:', error);
            throw error;
        }
    }

    // 生成汇总统计
    public generateSummary(userRecords: UserRecord[]): void {
        const totalUsers = userRecords.length;
        const totalPurchase = userRecords.reduce((sum, record) => sum + record.purchaseAmount, 0);
        const totalConsumption = userRecords.reduce((sum, record) => sum + record.consumptionAmount, 0);
        const totalBalance = userRecords.reduce((sum, record) => sum + record.remainingBalance, 0);
        const totalPaymentCount = userRecords.reduce((sum, record) => sum + record.paymentCount, 0);

        // 统计各种情况的用户数量
        const usersWithBalance = userRecords.filter(r => r.remainingBalance > 0).length;
        const usersWithZeroBalance = userRecords.filter(r => r.remainingBalance === 0).length;
        const usersWithConsumption = userRecords.filter(r => r.consumptionAmount > 0).length;
        const multiplePaymentUsers = userRecords.filter(r => r.paymentCount > 1).length;

        console.log('\n📊 数据汇总统计（完整充值数据）');
        console.log('='.repeat(50));
        console.log(`👥 总用户数:           ${totalUsers}`);
        console.log(`💰 总充值金额:         ¥${totalPurchase.toFixed(2)}`);
        console.log(`🛒 总消费金额:         ¥${totalConsumption.toFixed(2)}`);
        console.log(`💳 总剩余余额:         ¥${totalBalance.toFixed(2)}`);
        console.log(`📈 平均充值金额:       ¥${(totalPurchase / totalUsers).toFixed(2)}`);
        console.log(`📊 平均消费金额:       ¥${(totalConsumption / totalUsers).toFixed(2)}`);
        console.log(`💵 平均剩余余额:       ¥${(totalBalance / totalUsers).toFixed(2)}`);
        console.log(`💳 总充值次数:         ${totalPaymentCount} 次`);
        console.log(`📈 平均充值次数:       ${(totalPaymentCount / totalUsers).toFixed(1)} 次`);
        
        console.log('\n👥 用户分布:');
        console.log(`   有余额用户:         ${usersWithBalance} 人`);
        console.log(`   零余额用户:         ${usersWithZeroBalance} 人`);
        console.log(`   有消费记录用户:      ${usersWithConsumption} 人`);
        console.log(`   多次充值用户:        ${multiplePaymentUsers} 人`);
        
        // 充值金额区间统计
        const ranges = [
            { min: 0, max: 100, label: '0-100元' },
            { min: 100, max: 300, label: '100-300元' },
            { min: 300, max: 500, label: '300-500元' },
            { min: 500, max: 1000, label: '500-1000元' },
            { min: 1000, max: 3000, label: '1000-3000元' },
            { min: 3000, max: Infinity, label: '3000元以上' }
        ];

        console.log('\n💰 充值金额分布:');
        ranges.forEach(range => {
            const count = userRecords.filter(r => 
                r.purchaseAmount >= range.min && r.purchaseAmount < range.max
            ).length;
            console.log(`   ${range.label.padEnd(15)}: ${count} 人`);
        });

        // 核账验证
        const calculatedDifference = totalPurchase - totalConsumption - totalBalance;
        console.log('\n🔍 数据完整性验证:');
        console.log(`   充值总额 - 消费总额 - 余额 = ¥${calculatedDifference.toFixed(2)}`);
        if (Math.abs(calculatedDifference) < 1) {
            console.log(`   ✅ 数据基本平衡`);
        } else {
            console.log(`   ⚠️  数据存在差异，建议进一步核查`);
        }
    }

    // 主要导出函数
    public async exportUserRecords(): Promise<void> {
        try {
            console.log('🚀 开始导出用户记录...');
            console.log(`📅 时间范围: ${this.START_DATE} 至今`);
            
            // 获取用户记录
            const userRecords = await this.getAllUserRecords();
            
            // 生成汇总统计
            this.generateSummary(userRecords);
            
            // 导出CSV
            const filePath = await this.exportToCSV(userRecords);
            
            console.log('\n✅ 用户记录导出完成！');
            console.log(`📄 CSV文件路径: ${filePath}`);
            
        } catch (error) {
            console.error('❌ 导出用户记录失败:', error);
            throw error;
        }
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const exporter = new UserRecordsExporter();
    exporter.exportUserRecords()
        .then(() => {
            console.log('🎉 导出任务完成！');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 导出任务失败:', error);
            process.exit(1);
        });
}

export { UserRecordsExporter, UserRecord }; 