import schedule from 'node-schedule';
import { formatToLocalTime, getDb } from './db';

const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ3ODExNjc3LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNS8yMCAxNToxNDozNyIsImRhdGEiOnsiTmFtZSI6IumSn-WFiOeUnyIsIklzZGlzYWJsZSI6MCwiUm9sZSI6IjAiLCJMaW1pdHMiOiIxLDIsMywzMSwzMiw0LDQxLDQyLDQzLDQ0LDUsNTEsNTIsNTMsNiw2MSw2Miw2Myw2NCw2NSw2Niw2Nyw2OCw2OSw2MDEsNjAyLDYwMyw3LDcxLDcyLDczLDc0LDc1LDgsODEsOSw5MSw5Miw5Myw5NCwxMCwxMDEsMTAyLDEwMywxMDQsMTEsMTExLDExMiwxMTMsMTE0LDExNSwyMSwyMiwyMywyNCwyNSwyNiwyNywxMDUsMjgsMTIsMTIxLDEyMiwxMjMsMTMsMTQsMTQxLDE0MiwxNSw2MDQsMzMsNjA1LDYwNiw2MDcsNjA4LDYwOSw2MTAsNjExLDYxMiw2MTMsNjE0LDYxNSw2MTYsNjE3LDYxOCw2MTksNjIwLDYyMSw2MDQxLDYwNDIsNjA0Myw2MDQ0LDYwNDUsMjksMjExLDIxMiwyMTMsMjE0LDE2LDE2MSwxNjIsMTYzLDE2NiwxNjcsMTY0LDYwNDYsNjA0Nyw2MDQ4LDYwNDksMjE1LDIxNiwxNjUsMjE3LDc4LDYwNTAsMjE4LDIxOSwyMTkwLDIxOTEsMjE5MiIsInVzZXJpZCI6IjE0OTA5IiwiU3RvcmVzSUQiOiIxNTE3IiwiSXNIZWFkT2ZmaWNlIjowLCJJc3RlciI6MX19.iQqqq5dBq2loy0QfgGKJXi_Rr4QgisQsUOdS0TdisZA'
// 定义一个定时任务，每分钟执行一次
schedule.scheduleJob('*/5 * * * * * * * *', () => {
    console.log(`[${new Date().toISOString()}] 定时任务执行：每 5 分钟运行一次`);
    getRowClassList();
});

const getRowClassList = async () => {
    try {

        //StoresID会变
        const body = {
            "StoresID": "1517",
            "isweek": "0",
            "dateTime": "",
            "RowClassType": "0",
            "ClassTeacher": "",
            "CourseID": "",
            "SelectClass": "1",
            "ClassID": "",
            "RowType": 0,
            token
        }
        const res = await fetch("https://test.xingxingzhihuo.com.cn/WebApi/getListRowClassNew.aspx", {
            "headers": {
                "accept": "application/json",
                "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8",
                "access-control-allow-origin": "*",
                "cache-control": "no-cache",
                "content-type": "application/x-www-form-urlencoded",
                "pragma": "no-cache",
                "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "cross-site",
                "Referer": "https://s.zhihuoyueke.com/",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": JSON.stringify(body),
            "method": "POST"
        });
        const json = await res.json();
        // 数组长度是3，代表上下午和晚上
        // 1.找到今天的课表
        const courseList: any[] = [];
        (json.data as any[]).filter((obj) => {
            Object.keys(obj).forEach((key) => {
                if (obj[key].TitleDay == '今') {
                    courseList.push(...obj[key].listRowClass);
                }
            }
            )
        })
        console.log('courseList', courseList);
        // 2.找到今天约课情况,PreAboutCount 代表预约人数
        for (let index = 0; index < courseList.length; index++) {
            const item = courseList[index];
            console.log('课程日期', item.SKtime);
            console.log('课程时间', item.startTime);
            console.log('课程人数', item.PreAboutCount);
            const SKtimeArray = (item.SKtime as string).split('/');
            const startTimeArray = (item.startTime as string).split(':');
            const ts = new Date(Number(SKtimeArray[0]), Number(SKtimeArray[1]) - 1, Number(SKtimeArray[2]), Number(startTimeArray[0]), Number(startTimeArray[1])).valueOf();
            const now = Date.now();
            console.log('课程时间戳', ts);
            console.log('当前时间戳', now);
            // 计算时间差单位是分钟
            const diff = (ts - now) / 1000 / 60;
            if (diff > -0 && diff < 60) {
                //判断1小时以内就修改价格，需要一个修改价格的策略
                const afterPrice = await calPrice(item);
                modifyPrice(item, afterPrice)
            }
        }
    } catch (error) {
        console.log('getRowClassList error', error);

    }

}

const calPrice = async (course: any) => {
    const db = await getDb();
    // TODO: 这里需要一个策略来计算价格
    // 1.获取当前课程的价格
    const sql = `SELECT * FROM price_range`;
    // res  [ { discount: '1', amount: 3, price: 0 } ]
    const res = await db.all(sql);
    console.log('res', res);
    return course.singlePrice
}


const getPreAboutList = async () => {

    // const body = new FormData()
    // body.append('StoresID', '1517')
    // body.append('isweek', '0')
    // body.append('dateTime', '')
    // body.append('LoginID', '14909')
    // body.append('RowClassType', '0')
    // body.append('ClassTeacher', '')
    // body.append('CourseID', '')
    // body.append('SelectClass', '1')
    // body.append('ClassID', '')
    // body.append('RowType', '0')
    // body.append('token', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ3ODExNjc3LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNS8yMCAxNToxNDozNyIsImRhdGEiOnsiTmFtZSI6IumSn-WFiOeUnyIsIklzZGlzYWJsZSI6MCwiUm9sZSI6IjAiLCJMaW1pdHMiOiIxLDIsMywzMSwzMiw0LDQxLDQyLDQzLDQ0LDUsNTEsNTIsNTMsNiw2MSw2Miw2Myw2NCw2NSw2Niw2Nyw2OCw2OSw2MDEsNjAyLDYwMyw3LDcxLDcyLDczLDc0LDc1LDgsODEsOSw5MSw5Miw5Myw5NCwxMCwxMDEsMTAyLDEwMywxMDQsMTEsMTExLDExMiwxMTMsMTE0LDExNSwyMSwyMiwyMywyNCwyNSwyNiwyNywxMDUsMjgsMTIsMTIxLDEyMiwxMjMsMTMsMTQsMTQxLDE0MiwxNSw2MDQsMzMsNjA1LDYwNiw2MDcsNjA4LDYwOSw2MTAsNjExLDYxMiw2MTMsNjE0LDYxNSw2MTYsNjE3LDYxOCw2MTksNjIwLDYyMSw2MDQxLDYwNDIsNjA0Myw2MDQ0LDYwNDUsMjksMjExLDIxMiwyMTMsMjE0LDE2LDE2MSwxNjIsMTYzLDE2NiwxNjcsMTY0LDYwNDYsNjA0Nyw2MDQ4LDYwNDksMjE1LDIxNiwxNjUsMjE3LDc4LDYwNTAsMjE4LDIxOSwyMTkwLDIxOTEsMjE5MiIsInVzZXJpZCI6IjE0OTA5IiwiU3RvcmVzSUQiOiIxNTE3IiwiSXNIZWFkT2ZmaWNlIjowLCJJc3RlciI6MX19.iQqqq5dBq2loy0QfgGKJXi_Rr4QgisQsUOdS0TdisZA')

    const body = {
        "StoresID": "1517",
        "isweek": "0",
        "dateTime": "",
        "LoginID": "14909",
        "RowClassType": "0",
        "ClassTeacher": "",
        "CourseID": "",
        "SelectClass": "1",
        "ClassID": "",
        "RowType": "0",
        token
    }

    const res = await fetch("https://test.xingxingzhihuo.com.cn/WebApi/getListPreAbout.aspx", {
        "headers": {
            "accept": "application/json",
            "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8",
            "access-control-allow-origin": "*",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "Referer": "https://s.zhihuoyueke.com/",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        "body": JSON.stringify(body),
        "method": "POST"
    });
    const json = await res.json();
    // 数组长度是3，代表上下午和晚上
    const preAboutList: any[] = [];
    (json.data as any[]).filter((obj) => {
        Object.keys(obj).forEach((key) => {
            if (obj[key].TitleDay == '今') {
                preAboutList.push(...obj[key].listRowClass);
            }
        }
        )
    })
    // PreAboutCount 代表预约人数
    // console.log('preAboutList', preAboutList);

}

const modifyPrice = async (body: any, curPrice = '500') => {
    const prePrice = body.singlePrice;
    const newBody = {
        ...body,
        singlePrice: curPrice,
        IsPay: Number(body.IsPay),
        payPrice: Number(body.payPrice),
        "ListRowClassTime": "[]",
        "RowClassID": body.ID,
        token
    }

    const testCourse = {
        "Timelength": "90",
        "Isshow": "1",
        "startTime": "00:30",
        "sminute": "30",
        "shour": "00",
        "LoginID": "14910",
        "SiteName": "未安排教室",
        "Site": "0",
        "SKtime": "2025/5/20",
        "Isjp": "0",
        "color": "#9c4b4b",
        "preAboutType": "2",
        "firstPrice": "0.00",
        "singlePrice": "200",
        // 课程id
        // 课程名称
        "ID": "2782943",
        "RowClassTypeqt": "2",
        "IsPay": 0,
        "Isdel": "0",
        "snapUpPrice": "0.00",
        "snapUpCount": "0",
        "iszdqx": "0",
        "RowClassInfo": "",
        "PeriodOfTime": "1",
        "Cycle": "2",
        "Name": "li老师",
        "payPrice": 0,
        "SiteID": "0",
        "PreAboutCount": "1",
        "limitCount": "8",
        "integral": "0",
        "startTimes": "2025/5/20",
        "LevelID": "1",
        "RowType": "1",
        "StoresID": "1517",
        "endTimes": "2025/5/20",
        "CourseID": "27444",
        "AmemberCard": "23503,23504",
        "RowClassType": "0",
        "UpdTime": "2025/5/20 15:20:44",
        "MinCount": "0",
        "difficulty": "2",
        "CourseName": "芭蕾基训",
        "ClassName": "",
        "ConsumptionOfClass": "1.5",
        "firsPreAboutCount": "0",
        "addTime": "2025/5/20 0:22:33",
        "ListRowClassTime": "[]",
        "RowClassID": "2782943",
        token
    }
    console.log('newBody', newBody);

    const res = await fetch("https://test.xingxingzhihuo.com.cn/WebApi/editRowClass.aspx", {
        "headers": {
            "accept": "application/json",
            "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8",
            "access-control-allow-origin": "*",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Google Chrome\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "Referer": "https://s.zhihuoyueke.com/",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        body: JSON.stringify(newBody),
        // "body": "{\"Timelength\":\"90\",\"Isshow\":\"1\",\"startTime\":\"00:30\",\"sminute\":\"30\",\"shour\":\"00\",\"LoginID\":\"14910\",\"SiteName\":\"未安排教室\",\"Site\":\"0\",\"SKtime\":\"2025/5/20\",\"Isjp\":\"0\",\"color\":\"#9c4b4b\",\"preAboutType\":\"2\",\"firstPrice\":\"0.00\",\"singlePrice\":\"200\",\"ID\":\"2782943\",\"RowClassTypeqt\":\"2\",\"IsPay\":0,\"Isdel\":\"0\",\"snapUpPrice\":\"0.00\",\"snapUpCount\":\"0\",\"iszdqx\":\"0\",\"RowClassInfo\":\"\",\"PeriodOfTime\":\"1\",\"Cycle\":\"2\",\"Name\":\"li老师\",\"payPrice\":0,\"SiteID\":\"0\",\"PreAboutCount\":\"1\",\"limitCount\":\"8\",\"integral\":\"0\",\"startTimes\":\"2025/5/20\",\"LevelID\":\"1\",\"RowType\":\"1\",\"StoresID\":\"1517\",\"endTimes\":\"2025/5/20\",\"CourseID\":\"27444\",\"AmemberCard\":\"23503,23504\",\"RowClassType\":\"0\",\"UpdTime\":\"2025/5/20 15:20:44\",\"MinCount\":\"0\",\"difficulty\":\"2\",\"CourseName\":\"芭蕾基训\",\"ClassName\":\"\",\"ConsumptionOfClass\":\"1.5\",\"firsPreAboutCount\":\"0\",\"addTime\":\"2025/5/20 0:22:33\",\"ListRowClassTime\":\"[]\",\"RowClassID\":\"2782943\",\"token\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJaSFlLIiwiZXhwIjoxNzQ3ODExNjc3LCJzdWIiOiJKV1QiLCJhdWQiOiIxNDkwOSIsImlhdCI6IjIwMjUvNS8yMCAxNToxNDozNyIsImRhdGEiOnsiTmFtZSI6IumSn-WFiOeUnyIsIklzZGlzYWJsZSI6MCwiUm9sZSI6IjAiLCJMaW1pdHMiOiIxLDIsMywzMSwzMiw0LDQxLDQyLDQzLDQ0LDUsNTEsNTIsNTMsNiw2MSw2Miw2Myw2NCw2NSw2Niw2Nyw2OCw2OSw2MDEsNjAyLDYwMyw3LDcxLDcyLDczLDc0LDc1LDgsODEsOSw5MSw5Miw5Myw5NCwxMCwxMDEsMTAyLDEwMywxMDQsMTEsMTExLDExMiwxMTMsMTE0LDExNSwyMSwyMiwyMywyNCwyNSwyNiwyNywxMDUsMjgsMTIsMTIxLDEyMiwxMjMsMTMsMTQsMTQxLDE0MiwxNSw2MDQsMzMsNjA1LDYwNiw2MDcsNjA4LDYwOSw2MTAsNjExLDYxMiw2MTMsNjE0LDYxNSw2MTYsNjE3LDYxOCw2MTksNjIwLDYyMSw2MDQxLDYwNDIsNjA0Myw2MDQ0LDYwNDUsMjksMjExLDIxMiwyMTMsMjE0LDE2LDE2MSwxNjIsMTYzLDE2NiwxNjcsMTY0LDYwNDYsNjA0Nyw2MDQ4LDYwNDksMjE1LDIxNiwxNjUsMjE3LDc4LDYwNTAsMjE4LDIxOSwyMTkwLDIxOTEsMjE5MiIsInVzZXJpZCI6IjE0OTA5IiwiU3RvcmVzSUQiOiIxNTE3IiwiSXNIZWFkT2ZmaWNlIjowLCJJc3RlciI6MX19.iQqqq5dBq2loy0QfgGKJXi_Rr4QgisQsUOdS0TdisZA\"}",
        "method": "POST"
    });
    const json = await res.json();
    console.log('json', json);

    if (json.orsuccess && json.orsuccess == 1) {
        const db = await getDb();

        await db.run(`INSERT INTO update_history (updateTime,prePrice,curPrice,courseName,courseID) VALUES (?,?,?,?,?)`, [
            formatToLocalTime(Date.now()),
            prePrice,
            curPrice,
            body.CourseName,
            body.CourseID,
        ])
    }
}

// 1.找到今天的课表,
// 2.找到今天约课情况
// // 3.修改价格
getRowClassList()