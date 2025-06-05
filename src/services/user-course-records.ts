import * as fs from 'fs';
import * as path from 'path';
import { TokenManager } from '../common/token';
import { formatToLocalTime } from '../common/db';

interface UserInfo {
    ID: string;
    Name: string;
    Phone: string;
    WxHeadUrl?: string;
    listVip: VipCard[];
}

interface VipCard {
    ID: string;
    CardName: string;
    Amount: string;
    CardType: string;
    PurchaseAmount: string;
    CreateTime: string;
    OverdueTime: string;
}

interface CourseRecord {
    PreAboutID: number;
    CourseName: string;
    SKtime: string;
    startTime: string;
    Timelength: string;
    LoginName: string;
    singlePrice: string;
    ConsumptionOfClass: number;
    state: number;
    addTime: string;
}

interface UserCourseData {
    userInfo: UserInfo;
    courseRecords: CourseRecord[];
    totalRecords: number;
    totalConsumption: number;
}

export class UserCourseRecordsService {
    private static instance: UserCourseRecordsService;
    private tokenManager: TokenManager;

    private constructor() {
        this.tokenManager = TokenManager.getInstance();
    }

    public static getInstance(): UserCourseRecordsService {
        if (!UserCourseRecordsService.instance) {
            UserCourseRecordsService.instance = new UserCourseRecordsService();
        }
        return UserCourseRecordsService.instance;
    }

    // 获取所有用户列表
    private async getAllUsers(): Promise<UserInfo[]> {
        const users: UserInfo[] = [];
        let page = 1;
        const pageSize = 100;
        let hasMore = true;

        while (hasMore) {
            try {
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

                console.log(`正在获取用户列表第 ${page} 页...`);

                const response = await fetch('https://test.xingxingzhihuo.com.cn/WebApi/getListTcMembers.aspx', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.orsuccess === '1' && result.data) {
                    users.push(...result.data);
                    
                    // 检查是否还有更多数据
                    if (result.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    console.error('获取用户列表失败:', result.Msg);
                    hasMore = false;
                }

                // 添加延迟避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`获取用户列表第 ${page} 页时出错:`, error);
                hasMore = false;
            }
        }

        console.log(`总共获取到 ${users.length} 个用户`);
        return users;
    }

    // 获取单个用户的上课记录
    private async getUserCourseRecords(userId: string): Promise<CourseRecord[]> {
        const records: CourseRecord[] = [];
        let page = 1;
        const pageSize = 50;
        let hasMore = true;

        while (hasMore) {
            try {
                const payload = {
                    "MembersID": userId,
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
                    records.push(...result.data);
                    
                    // 检查是否还有更多数据
                    if (result.data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else if (result.orsuccess === '0' && result.Msg === '没有数据') {
                    // 没有数据是正常情况
                    hasMore = false;
                } else {
                    console.error(`获取用户 ${userId} 课程记录失败:`, result.Msg);
                    hasMore = false;
                }

                // 添加延迟避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`获取用户 ${userId} 课程记录时出错:`, error);
                hasMore = false;
            }
        }

        return records;
    }

    // 获取所有用户的上课记录
    public async getAllUserCourseRecords(): Promise<UserCourseData[]> {
        console.log('开始获取所有用户上课记录...');
        
        // 首先获取所有用户
        const users = await this.getAllUsers();
        const allUserCourseData: UserCourseData[] = [];

        let processedCount = 0;

        for (const user of users) {
            try {
                console.log(`正在处理用户 ${user.Name} (${user.Phone}) [${processedCount + 1}/${users.length}]`);
                
                // 获取用户的上课记录
                const courseRecords = await this.getUserCourseRecords(user.ID);
                
                // 计算总消费
                const totalConsumption = courseRecords.reduce((sum, record) => {
                    return sum + (record.ConsumptionOfClass || 0);
                }, 0);

                const userCourseData: UserCourseData = {
                    userInfo: user,
                    courseRecords,
                    totalRecords: courseRecords.length,
                    totalConsumption
                };

                allUserCourseData.push(userCourseData);
                processedCount++;

                // 每处理10个用户输出一次进度
                if (processedCount % 10 === 0) {
                    console.log(`已处理 ${processedCount}/${users.length} 个用户`);
                }

            } catch (error) {
                console.error(`处理用户 ${user.Name} 时出错:`, error);
            }
        }

        console.log(`完成！总共处理了 ${processedCount} 个用户`);
        return allUserCourseData;
    }

    // 保存数据到JSON文件
    public async saveToJsonFile(data: UserCourseData[], filename?: string): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const defaultFilename = `user-course-records-${timestamp}.json`;
        const fileName = filename || defaultFilename;
        
        const outputDir = path.join(__dirname, '../output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filePath = path.join(outputDir, fileName);

        // 生成统计信息
        const stats = {
            exportTime: formatToLocalTime(new Date()),
            totalUsers: data.length,
            totalCourseRecords: data.reduce((sum, user) => sum + user.totalRecords, 0),
            totalConsumption: data.reduce((sum, user) => sum + user.totalConsumption, 0),
            usersWithRecords: data.filter(user => user.totalRecords > 0).length
        };

        const output = {
            statistics: stats,
            userData: data
        };

        fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf-8');
        
        console.log(`\n=== 导出完成 ===`);
        console.log(`文件保存路径: ${filePath}`);
        console.log(`总用户数: ${stats.totalUsers}`);
        console.log(`有上课记录的用户数: ${stats.usersWithRecords}`);
        console.log(`总上课记录数: ${stats.totalCourseRecords}`);
        console.log(`总消费金额: ¥${stats.totalConsumption.toFixed(2)}`);
        console.log(`\n⚠️  安全提醒: 导出文件包含敏感用户信息，请妥善保管，使用后及时删除`);

        return filePath;
    }

    // 手动执行导出功能
    public async exportAllUserCourseRecords(filename?: string): Promise<string> {
        try {
            console.log(`\n=== 开始导出所有用户上课记录 ===`);
            console.log(`开始时间: ${formatToLocalTime(new Date())}`);

            // 验证token
            const isValid = await this.tokenManager.validateToken();
            if (!isValid) {
                console.log('Token无效，尝试更新...');
                const updated = await this.tokenManager.updateToken();
                if (!updated) {
                    throw new Error('Token更新失败，无法继续导出');
                }
            }

            const data = await this.getAllUserCourseRecords();
            const filePath = await this.saveToJsonFile(data, filename);

            console.log(`结束时间: ${formatToLocalTime(new Date())}`);
            console.log(`=== 导出完成 ===\n`);

            return filePath;
        } catch (error) {
            console.error('导出用户上课记录失败:', error);
            throw error;
        }
    }
}

// 导出单例实例，方便直接调用
export const userCourseRecordsService = UserCourseRecordsService.getInstance(); 