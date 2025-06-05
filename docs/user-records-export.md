# 用户上课记录导出功能

## 功能概述

这个功能可以导出所有用户的上课记录，包括用户信息、上课历史、消费统计等数据，并保存为JSON格式文件。

## 使用方法

### 1. 通过npm脚本运行（推荐）

```bash
# 默认文件名导出
npm run export:user-records

# 指定自定义文件名导出
npm run export:user-records my-custom-filename.json
```

### 2. 直接运行TypeScript脚本

```bash
# 默认文件名
npx ts-node src/scripts/export-user-records.ts

# 自定义文件名
npx ts-node src/scripts/export-user-records.ts my-export.json
```

### 3. 在代码中调用

```typescript
import { userCourseRecordsService } from './src/services/user-course-records';

// 使用默认文件名
const filePath = await userCourseRecordsService.exportAllUserCourseRecords();

// 使用自定义文件名
const filePath = await userCourseRecordsService.exportAllUserCourseRecords('my-export.json');
```

## 输出文件格式

导出的JSON文件包含以下结构：

```json
{
  "statistics": {
    "exportTime": "2025-06-05 15:30:25",
    "totalUsers": 150,
    "totalCourseRecords": 1200,
    "totalConsumption": 85600.50,
    "usersWithRecords": 98
  },
  "userData": [
    {
      "userInfo": {
        "ID": "478926",
        "Name": "张三",
        "Phone": "13812345678",
        "WxHeadUrl": "https://...",
        "listVip": [...]
      },
      "courseRecords": [
        {
          "PreAboutID": 6443196,
          "CourseName": "民间舞 藏族剧目",
          "SKtime": "2025/6/4",
          "startTime": "19:30",
          "Timelength": "60",
          "LoginName": "上官老师",
          "singlePrice": "73.00",
          "ConsumptionOfClass": 73.00,
          "state": 2,
          "addTime": "2025/6/1 2:37:38"
        }
      ],
      "totalRecords": 5,
      "totalConsumption": 365.00
    }
  ]
}
```

## 文件保存位置

导出的文件默认保存在 `src/output/` 目录下，文件名格式为：
- 默认：`user-course-records-YYYY-MM-DDTHH-mm-ss.json`
- 自定义：用户指定的文件名

## 数据字段说明

### 统计信息 (statistics)
- `exportTime`: 导出时间
- `totalUsers`: 总用户数
- `totalCourseRecords`: 总上课记录数
- `totalConsumption`: 总消费金额
- `usersWithRecords`: 有上课记录的用户数

### 用户信息 (userInfo)
- `ID`: 用户ID
- `Name`: 用户姓名
- `Phone`: 手机号
- `WxHeadUrl`: 微信头像
- `listVip`: 会员卡信息数组

### 上课记录 (courseRecords)
- `PreAboutID`: 预约ID
- `CourseName`: 课程名称
- `SKtime`: 上课日期
- `startTime`: 上课时间
- `Timelength`: 课程时长(分钟)
- `LoginName`: 教师姓名
- `singlePrice`: 课程单价
- `ConsumptionOfClass`: 实际消费金额
- `state`: 课程状态(2=已完成)
- `addTime`: 预约时间

## 注意事项

1. **数据安全**：⚠️ **导出文件包含敏感用户信息，已自动添加到.gitignore中，请勿手动提交到版本控制**
2. **权限要求**：需要有效的token才能访问API
3. **网络要求**：需要稳定的网络连接访问服务器API
4. **时间消耗**：导出时间取决于用户数量，可能需要几分钟到几十分钟
5. **存储空间**：确保有足够的磁盘空间存储导出文件
6. **API限制**：为避免对服务器造成压力，请求间有适当延迟
7. **文件处理**：使用完导出文件后，建议及时删除或安全存储

## 错误处理

- Token无效时会自动尝试更新
- 网络错误会有重试机制
- 详细的错误日志会显示在控制台

## 性能优化

- 批量获取用户列表(每次100个)
- 分页获取用户课程记录(每次50条)
- 请求间添加延迟避免过频
- 进度显示帮助了解执行状态 