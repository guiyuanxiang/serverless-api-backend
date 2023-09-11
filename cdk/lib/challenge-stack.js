"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChallengeStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const s3 = require("aws-cdk-lib/aws-s3");
const lambda = require("aws-cdk-lib/aws-lambda");
const aws_apigateway_1 = require("aws-cdk-lib/aws-apigateway");
const aws_lambda_event_sources_1 = require("aws-cdk-lib/aws-lambda-event-sources");
const path = require("path");
const iam = require("aws-cdk-lib/aws-iam");
const ec2 = require("aws-cdk-lib/aws-ec2");
const core_1 = require("aws-cdk-lib/core");
const cdk = require('aws-cdk-lib');
class ChallengeStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        new aws_cdk_lib_1.CfnParameter(this, 'AppId');
        const accesskeyId = new aws_cdk_lib_1.CfnParameter(this, 'accesskeyId');
        const secretAccessKey = new aws_cdk_lib_1.CfnParameter(this, 'secretAccessKey');
        // 定义 IAM 角色名称
        const roleName = 'code-challenge-role'; // 替换为您的 IAM 角色名称
        const role = new iam.Role(this, roleName, {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            roleName: roleName, // 角色名称
        });
        // 添加所需的 IAM 策略
        // 例如，如果您需要 S3 访问权限，可以添加以下策略
        role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
        //arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
        role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
        // arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM
        role.addManagedPolicy(iam.ManagedPolicy.fromManagedPolicyArn(this, 'AmazonEC2RoleforSSMPolicy', 'arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM'));
        // 创建实例配置文件并将角色与实例配置文件关联
        const roleInstance = 'code-challenge-role-instance'; // 替换为您的 IAM 角色名称
        const instanceProfile = new iam.CfnInstanceProfile(this, roleInstance, {
            roles: [role.roleName],
        });
        const attrn = instanceProfile.attrArn;
        // 创建一个 VPC（Virtual Private Cloud）
        const vpc = new ec2.Vpc(this, 'MyVpc', {
            maxAzs: 2, // 设置最大可用区数
        });
        const securityGroupName = "code-challenge-group";
        // 创建一个 EC2 安全组
        const securityGroup = new ec2.SecurityGroup(this, 'MySecurityGroup', {
            vpc,
            securityGroupName: securityGroupName,
            description: 'A security group for the Amazon EC2 example.',
            allowAllOutbound: true,
        });
        // 添加 SSH 入站规则，允许所有 IP 地址
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access from all IP addresses');
        const bucketId = 'MyS3Bucket';
        const bucketName = 'codechallengeganbdadei';
        const bucket = new s3.Bucket(this, bucketId, {
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            bucketName: bucketName,
            cors: [{
                    allowedHeaders: ['*'],
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
                    allowedOrigins: ['*'], // 允许的来源
                    // exposedHeaders: ['*'], // 公开的头部字段
                }],
        });
        const tableId = 'Table';
        const tableName = 'mytable';
        const partitionKeyName = 'id';
        const table = new dynamodb.Table(this, tableId, {
            partitionKey: { name: partitionKeyName, type: dynamodb.AttributeType.STRING },
            readCapacity: 2,
            writeCapacity: 2,
            tableName: tableName,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
        });
        const functionName = "myfunction";
        console.log(__dirname);
        const createFunctionId = 'createItemFunction';
        const codePath = path.join(__dirname, '../lambdas_create');
        const createHandler = 'create.handler';
        console.log(codePath);
        const createOneLambda = new lambda.Function(this, createFunctionId, {
            functionName: functionName,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: createHandler,
            code: lambda.Code.fromAsset(codePath),
            environment: {
                SAMPLE_TABLE: table.tableName,
            },
        });
        // Give Create/Read/Update/Delete permissions to the SampleTable
        table.grantReadWriteData(createOneLambda);
        const dbEventFunctionId = 'dbEventFunctionId';
        const dbEventFunctionName = "dbEventFunction";
        const dbEventCodePath = '../lambdas_dbevent';
        const dbEventHandler = 'dbevent.handler';
        const dbEventLambda = new lambda.Function(this, dbEventFunctionId, {
            functionName: dbEventFunctionName,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: dbEventHandler,
            code: lambda.Code.fromAsset(path.join(__dirname, dbEventCodePath)),
            environment: {
                SAMPLE_TABLE: table.tableName,
                REACT_APP_ACCESSKEYID: accesskeyId.valueAsString,
                REACT_APP_SECRETACCESSKEY: secretAccessKey.valueAsString,
                BUCKET_NAME: bucketName,
                ATTRN: attrn
            },
            timeout: core_1.Duration.seconds(600)
        });
        // 创建 DynamoEventSource 并添加到 Lambda 函数
        const dynamoEventSource = new aws_lambda_event_sources_1.DynamoEventSource(table, {
            startingPosition: lambda.StartingPosition.TRIM_HORIZON,
            batchSize: 1,
        });
        dbEventLambda.addEventSource(dynamoEventSource);
        const apiGatewayId = 'ServerlessRestApi';
        const apiGatewayName = 'myapiname';
        const api = new apigateway.RestApi(this, apiGatewayId, {
            cloudWatchRole: false,
            restApiName: apiGatewayName
        });
        api.root.addMethod('POST', new apigateway.LambdaIntegration(createOneLambda));
        api.root.addMethod('OPTIONS', new aws_apigateway_1.MockIntegration({
            // In case you want to use binary media types, uncomment the following line
            // contentHandling: ContentHandling.CONVERT_TO_TEXT,
            integrationResponses: [{
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
                        'method.response.header.Access-Control-Allow-Origin': "'*'",
                        'method.response.header.Access-Control-Allow-Credentials': "'false'",
                        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
                    },
                }],
            // In case you want to use binary media types, comment out the following line
            passthroughBehavior: aws_apigateway_1.PassthroughBehavior.NEVER,
            requestTemplates: {
                "application/json": "{\"statusCode\": 200}"
            },
        }), {
            methodResponses: [{
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Headers': true,
                        'method.response.header.Access-Control-Allow-Methods': true,
                        'method.response.header.Access-Control-Allow-Credentials': true,
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                }]
        });
    }
}
exports.ChallengeStack = ChallengeStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbGxlbmdlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2hhbGxlbmdlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZDQUFpRTtBQUNqRSx5REFBeUQ7QUFDekQscURBQXFEO0FBQ3JELHlDQUF5QztBQUN6QyxpREFBaUQ7QUFDakQsK0RBQWdGO0FBQ2hGLG1GQUF1RTtBQUN2RSw2QkFBNkI7QUFDN0IsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywyQ0FBMEM7QUFFMUMsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBR25DLE1BQWEsY0FBZSxTQUFRLG1CQUFLO0lBQ3JDLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFpQjtRQUNqRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixJQUFJLDBCQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sV0FBVyxHQUFHLElBQUksMEJBQVksQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDMUQsTUFBTSxlQUFlLEdBQUcsSUFBSSwwQkFBWSxDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBR2xFLGNBQWM7UUFDZCxNQUFNLFFBQVEsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLGlCQUFpQjtRQUV6RCxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUN0QyxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7WUFDeEQsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPO1NBQzlCLENBQUMsQ0FBQztRQUVILGVBQWU7UUFDZiw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsb0JB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QzNELHlEQUF5RCxFQUFFLFNBQVM7d0JBQ3BFLHFEQUFxRCxFQUFFLCtCQUErQjtxQkFDekY7aUJBQ0osQ0FBQztZQUNGLDZFQUE2RTtZQUM3RSxtQkFBbUIsRUFBRSxvQ0FBbUIsQ0FBQyxLQUFLO1lBQzlDLGdCQUFnQixFQUFFO2dCQUNkLGtCQUFrQixFQUFFLHVCQUF1QjthQUM5QztTQUNKLENBQUMsRUFBRTtZQUNBLGVBQWUsRUFBRSxDQUFDO29CQUNkLFVBQVUsRUFBRSxLQUFLO29CQUNqQixrQkFBa0IsRUFBRTt3QkFDaEIscURBQXFELEVBQUUsSUFBSTt3QkFDM0QscURBQXFELEVBQUUsSUFBSTt3QkFDM0QseURBQXlELEVBQUUsSUFBSTt3QkFDL0Qsb0RBQW9ELEVBQUUsSUFBSTtxQkFDN0Q7aUJBQ0osQ0FBQztTQUNMLENBQUMsQ0FBQTtJQUNOLENBQUM7Q0FHSjtBQXJLRCx3Q0FxS0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0FwcCwgQ2ZuUGFyYW1ldGVyLCBTdGFjaywgU3RhY2tQcm9wc30gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCB7TW9ja0ludGVncmF0aW9uLCBQYXNzdGhyb3VnaEJlaGF2aW9yfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQge0R5bmFtb0V2ZW50U291cmNlfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0IHtEdXJhdGlvbn0gZnJvbSAnYXdzLWNkay1saWIvY29yZSc7XG5cbmNvbnN0IGNkayA9IHJlcXVpcmUoJ2F3cy1jZGstbGliJyk7XG5cblxuZXhwb3J0IGNsYXNzIENoYWxsZW5nZVN0YWNrIGV4dGVuZHMgU3RhY2sge1xuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBBcHAsIGlkOiBzdHJpbmcsIHByb3BzOiBTdGFja1Byb3BzKSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgICAgIG5ldyBDZm5QYXJhbWV0ZXIodGhpcywgJ0FwcElkJyk7XG4gICAgICAgIGNvbnN0IGFjY2Vzc2tleUlkID0gbmV3IENmblBhcmFtZXRlcih0aGlzLCAnYWNjZXNza2V5SWQnKTtcbiAgICAgICAgY29uc3Qgc2VjcmV0QWNjZXNzS2V5ID0gbmV3IENmblBhcmFtZXRlcih0aGlzLCAnc2VjcmV0QWNjZXNzS2V5Jyk7XG5cblxuICAgICAgICAvLyDlrprkuYkgSUFNIOinkuiJsuWQjeensFxuICAgICAgICBjb25zdCByb2xlTmFtZSA9ICdjb2RlLWNoYWxsZW5nZS1yb2xlJzsgLy8g5pu/5o2i5Li65oKo55qEIElBTSDop5LoibLlkI3np7BcblxuICAgICAgICBjb25zdCByb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIHJvbGVOYW1lLCB7XG4gICAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWMyLmFtYXpvbmF3cy5jb20nKSwgLy8g5YWB6K64IEVDMiDmia7mvJTop5LoibJcbiAgICAgICAgICAgIHJvbGVOYW1lOiByb2xlTmFtZSwgLy8g6KeS6Imy5ZCN56ewXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIOa3u+WKoOaJgOmcgOeahCBJQU0g562W55WlXG4gICAgICAgIC8vIOS+i+Wmgu+8jOWmguaenOaCqOmcgOimgSBTMyDorr/pl67mnYPpmZDvvIzlj6/ku6Xmt7vliqDku6XkuIvnrZbnlaVcbiAgICAgICAgcm9sZS5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uUzNGdWxsQWNjZXNzJykpO1xuICAgICAgICAvL2Fybjphd3M6aWFtOjphd3M6cG9saWN5L0FtYXpvbkR5bmFtb0RCRnVsbEFjY2Vzc1xuICAgICAgICByb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25EeW5hbW9EQkZ1bGxBY2Nlc3MnKSk7XG4gICAgICAgIC8vIGFybjphd3M6aWFtOjphd3M6cG9saWN5L3NlcnZpY2Utcm9sZS9BbWF6b25FQzJSb2xlZm9yU1NNXG4gICAgICAgIHJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tTWFuYWdlZFBvbGljeUFybih0aGlzLCdBbWF6b25FQzJSb2xlZm9yU1NNUG9saWN5JywnYXJuOmF3czppYW06OmF3czpwb2xpY3kvc2VydmljZS1yb2xlL0FtYXpvbkVDMlJvbGVmb3JTU00nKSk7XG5cblxuICAgICAgICAvLyDliJvlu7rlrp7kvovphY3nva7mlofku7blubblsIbop5LoibLkuI7lrp7kvovphY3nva7mlofku7blhbPogZRcbiAgICAgICAgY29uc3Qgcm9sZUluc3RhbmNlID0gJ2NvZGUtY2hhbGxlbmdlLXJvbGUtaW5zdGFuY2UnOyAvLyDmm7/mjaLkuLrmgqjnmoQgSUFNIOinkuiJsuWQjeensFxuICAgICAgICBjb25zdCBpbnN0YW5jZVByb2ZpbGUgPSBuZXcgaWFtLkNmbkluc3RhbmNlUHJvZmlsZSh0aGlzLCByb2xlSW5zdGFuY2UsIHtcbiAgICAgICAgICAgIHJvbGVzOiBbcm9sZS5yb2xlTmFtZV0sXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBhdHRybiA9IGluc3RhbmNlUHJvZmlsZS5hdHRyQXJuO1xuXG4gICAgICAgIC8vIOWIm+W7uuS4gOS4qiBWUEPvvIhWaXJ0dWFsIFByaXZhdGUgQ2xvdWTvvIlcbiAgICAgICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ015VnBjJywge1xuICAgICAgICAgICAgbWF4QXpzOiAyLCAvLyDorr7nva7mnIDlpKflj6/nlKjljLrmlbBcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2VjdXJpdHlHcm91cE5hbWUgPSBcImNvZGUtY2hhbGxlbmdlLWdyb3VwXCI7XG4gICAgICAgIC8vIOWIm+W7uuS4gOS4qiBFQzIg5a6J5YWo57uEXG4gICAgICAgIGNvbnN0IHNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ015U2VjdXJpdHlHcm91cCcsIHtcbiAgICAgICAgICAgIHZwYyxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXBOYW1lOiBzZWN1cml0eUdyb3VwTmFtZSxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQSBzZWN1cml0eSBncm91cCBmb3IgdGhlIEFtYXpvbiBFQzIgZXhhbXBsZS4nLFxuICAgICAgICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8g5re75YqgIFNTSCDlhaXnq5nop4TliJnvvIzlhYHorrjmiYDmnIkgSVAg5Zyw5Z2AXG4gICAgICAgIHNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoZWMyLlBlZXIuYW55SXB2NCgpLCBlYzIuUG9ydC50Y3AoMjIpLCAnQWxsb3cgU1NIIGFjY2VzcyBmcm9tIGFsbCBJUCBhZGRyZXNzZXMnKTtcblxuXG4gICAgICAgIGNvbnN0IGJ1Y2tldElkID0gJ015UzNCdWNrZXQnO1xuICAgICAgICBjb25zdCBidWNrZXROYW1lID0gJ2NvZGVjaGFsbGVuZ2VnYW5iZGFkZWknO1xuICAgICAgICBjb25zdCBidWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIGJ1Y2tldElkLCB7XG4gICAgICAgICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgICAgYnVja2V0TmFtZTogYnVja2V0TmFtZSxcbiAgICAgICAgICAgIGNvcnM6IFt7XG4gICAgICAgICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFsnKiddLCAvLyDlhYHorrjmiYDmnInlpLTpg6jlrZfmrrVcbiAgICAgICAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW3MzLkh0dHBNZXRob2RzLkdFVCwgczMuSHR0cE1ldGhvZHMuUE9TVCwgczMuSHR0cE1ldGhvZHMuUFVUXSwgLy8g5YWB6K6455qEIEhUVFAg5pa55rOVXG4gICAgICAgICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLCAvLyDlhYHorrjnmoTmnaXmupBcbiAgICAgICAgICAgICAgICAvLyBleHBvc2VkSGVhZGVyczogWycqJ10sIC8vIOWFrOW8gOeahOWktOmDqOWtl+autVxuICAgICAgICAgICAgfV0sXG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgY29uc3QgdGFibGVJZCA9ICdUYWJsZSc7XG4gICAgICAgIGNvbnN0IHRhYmxlTmFtZSA9ICdteXRhYmxlJztcbiAgICAgICAgY29uc3QgcGFydGl0aW9uS2V5TmFtZSA9ICdpZCc7XG5cbiAgICAgICAgY29uc3QgdGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgdGFibGVJZCwge1xuICAgICAgICAgICAgcGFydGl0aW9uS2V5OiB7bmFtZTogcGFydGl0aW9uS2V5TmFtZSwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkd9LFxuICAgICAgICAgICAgcmVhZENhcGFjaXR5OiAyLFxuICAgICAgICAgICAgd3JpdGVDYXBhY2l0eTogMixcbiAgICAgICAgICAgIHRhYmxlTmFtZTogdGFibGVOYW1lLFxuICAgICAgICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVMsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9IFwibXlmdW5jdGlvblwiO1xuICAgICAgICBjb25zb2xlLmxvZyhfX2Rpcm5hbWUpO1xuXG4gICAgICAgIGNvbnN0IGNyZWF0ZUZ1bmN0aW9uSWQgPSAnY3JlYXRlSXRlbUZ1bmN0aW9uJztcbiAgICAgICAgY29uc3QgY29kZVBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhc19jcmVhdGUnKTtcbiAgICAgICAgY29uc3QgY3JlYXRlSGFuZGxlciA9ICdjcmVhdGUuaGFuZGxlcic7XG4gICAgICAgIGNvbnNvbGUubG9nKGNvZGVQYXRoKTtcbiAgICAgICAgY29uc3QgY3JlYXRlT25lTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBjcmVhdGVGdW5jdGlvbklkLCB7XG4gICAgICAgICAgICBmdW5jdGlvbk5hbWU6IGZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgICAgICAgaGFuZGxlcjogY3JlYXRlSGFuZGxlcixcbiAgICAgICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChjb2RlUGF0aCksXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIFNBTVBMRV9UQUJMRTogdGFibGUudGFibGVOYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gR2l2ZSBDcmVhdGUvUmVhZC9VcGRhdGUvRGVsZXRlIHBlcm1pc3Npb25zIHRvIHRoZSBTYW1wbGVUYWJsZVxuICAgICAgICB0YWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY3JlYXRlT25lTGFtYmRhKTtcblxuXG4gICAgICAgIGNvbnN0IGRiRXZlbnRGdW5jdGlvbklkID0gJ2RiRXZlbnRGdW5jdGlvbklkJztcbiAgICAgICAgY29uc3QgZGJFdmVudEZ1bmN0aW9uTmFtZSA9IFwiZGJFdmVudEZ1bmN0aW9uXCI7XG4gICAgICAgIGNvbnN0IGRiRXZlbnRDb2RlUGF0aCA9ICcuLi9sYW1iZGFzX2RiZXZlbnQnO1xuICAgICAgICBjb25zdCBkYkV2ZW50SGFuZGxlciA9ICdkYmV2ZW50LmhhbmRsZXInO1xuICAgICAgICBjb25zdCBkYkV2ZW50TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBkYkV2ZW50RnVuY3Rpb25JZCwge1xuICAgICAgICAgICAgZnVuY3Rpb25OYW1lOiBkYkV2ZW50RnVuY3Rpb25OYW1lLFxuICAgICAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICAgICAgICBoYW5kbGVyOiBkYkV2ZW50SGFuZGxlcixcbiAgICAgICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBkYkV2ZW50Q29kZVBhdGgpKSxcbiAgICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgU0FNUExFX1RBQkxFOiB0YWJsZS50YWJsZU5hbWUsXG4gICAgICAgICAgICAgICAgUkVBQ1RfQVBQX0FDQ0VTU0tFWUlEOiBhY2Nlc3NrZXlJZC52YWx1ZUFzU3RyaW5nLFxuICAgICAgICAgICAgICAgIFJFQUNUX0FQUF9TRUNSRVRBQ0NFU1NLRVk6IHNlY3JldEFjY2Vzc0tleS52YWx1ZUFzU3RyaW5nLFxuICAgICAgICAgICAgICAgIEJVQ0tFVF9OQU1FOiBidWNrZXROYW1lLFxuICAgICAgICAgICAgICAgIEFUVFJOOiBhdHRyblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNjAwKVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyDliJvlu7ogRHluYW1vRXZlbnRTb3VyY2Ug5bm25re75Yqg5YiwIExhbWJkYSDlh73mlbBcbiAgICAgICAgY29uc3QgZHluYW1vRXZlbnRTb3VyY2UgPSBuZXcgRHluYW1vRXZlbnRTb3VyY2UodGFibGUsIHtcbiAgICAgICAgICAgIHN0YXJ0aW5nUG9zaXRpb246IGxhbWJkYS5TdGFydGluZ1Bvc2l0aW9uLlRSSU1fSE9SSVpPTixcbiAgICAgICAgICAgIGJhdGNoU2l6ZTogMSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGJFdmVudExhbWJkYS5hZGRFdmVudFNvdXJjZShkeW5hbW9FdmVudFNvdXJjZSk7XG5cblxuICAgICAgICBjb25zdCBhcGlHYXRld2F5SWQgPSAnU2VydmVybGVzc1Jlc3RBcGknO1xuICAgICAgICBjb25zdCBhcGlHYXRld2F5TmFtZSA9ICdteWFwaW5hbWUnO1xuICAgICAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIGFwaUdhdGV3YXlJZCwge1xuICAgICAgICAgICAgY2xvdWRXYXRjaFJvbGU6IGZhbHNlLFxuICAgICAgICAgICAgcmVzdEFwaU5hbWU6IGFwaUdhdGV3YXlOYW1lXG4gICAgICAgIH0pO1xuICAgICAgICBhcGkucm9vdC5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihjcmVhdGVPbmVMYW1iZGEpKTtcbiAgICAgICAgYXBpLnJvb3QuYWRkTWV0aG9kKCdPUFRJT05TJywgbmV3IE1vY2tJbnRlZ3JhdGlvbih7XG4gICAgICAgICAgICAvLyBJbiBjYXNlIHlvdSB3YW50IHRvIHVzZSBiaW5hcnkgbWVkaWEgdHlwZXMsIHVuY29tbWVudCB0aGUgZm9sbG93aW5nIGxpbmVcbiAgICAgICAgICAgIC8vIGNvbnRlbnRIYW5kbGluZzogQ29udGVudEhhbmRsaW5nLkNPTlZFUlRfVE9fVEVYVCxcbiAgICAgICAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbe1xuICAgICAgICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInQ29udGVudC1UeXBlLFgtQW16LURhdGUsQXV0aG9yaXphdGlvbixYLUFwaS1LZXksWC1BbXotU2VjdXJpdHktVG9rZW4sWC1BbXotVXNlci1BZ2VudCdcIixcbiAgICAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiBcIidmYWxzZSdcIixcbiAgICAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ09QVElPTlMsR0VULFBVVCxQT1NULERFTEVURSdcIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfV0sXG4gICAgICAgICAgICAvLyBJbiBjYXNlIHlvdSB3YW50IHRvIHVzZSBiaW5hcnkgbWVkaWEgdHlwZXMsIGNvbW1lbnQgb3V0IHRoZSBmb2xsb3dpbmcgbGluZVxuICAgICAgICAgICAgcGFzc3Rocm91Z2hCZWhhdmlvcjogUGFzc3Rocm91Z2hCZWhhdmlvci5ORVZFUixcbiAgICAgICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogXCJ7XFxcInN0YXR1c0NvZGVcXFwiOiAyMDB9XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pLCB7XG4gICAgICAgICAgICBtZXRob2RSZXNwb25zZXM6IFt7XG4gICAgICAgICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiB0cnVlLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XVxuICAgICAgICB9KVxuICAgIH1cblxuXG59XG5cblxuIl19