import {DynamoDBClient, PutItemCommand} from '@aws-sdk/client-dynamodb';
import {nanoid} from 'nanoid';
// https://github.com/ai/nanoid/issues/422

const tableName = process.env.SAMPLE_TABLE || '';

// 创建 DynamoDB 客户端实例
const dynamoDBClient = new DynamoDBClient({});
export const handler = async (event: any = {}): Promise<any> => {

    if (!event.body) {
        return {statusCode: 400, body: 'invalid request, you are missing the parameter body'};
    }
    const item = typeof event.body == 'object' ? event.body : JSON.parse(event.body);
    const id = nanoid();
    console.log(id);
    item['id'] = id;
    console.log(item);
    console.log(tableName);
    const params = {
        TableName: tableName,
        Item: {
            id: { S: item['id'] }, // 替换为唯一的主键值
            input_text: { S: item['input_text'] }, // 插入 input 字段数据
            input_file_path: { S: item['input_file_path'] },
        }
    };
    const command = new PutItemCommand(params);
    await dynamoDBClient.send(command);
    return {statusCode: 201, body: ''};
};