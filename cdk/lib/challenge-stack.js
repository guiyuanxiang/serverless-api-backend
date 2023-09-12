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
        // 创建默认 VPC
        const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', {
            isDefault: true,
        });
        const securityGroupName = "code-challenge-group-new";
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
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT, s3.HttpMethods.HEAD, s3.HttpMethods.DELETE],
                    allowedOrigins: ['*'], // 允许的来源
                    // exposedHeaders: ['*'], // 公开的头部字段
                }],
        });
        const tableId = 'Table';
        const tableName = 'myTable';
        const partitionKeyName = 'id';
        const table = new dynamodb.Table(this, tableId, {
            partitionKey: { name: partitionKeyName, type: dynamodb.AttributeType.STRING },
            readCapacity: 2,
            writeCapacity: 2,
            tableName: tableName,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
        });
        const functionName = "myFunction";
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
                GROUP_NAME: securityGroupName,
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
        const apiGatewayName = 'myApiName';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbGxlbmdlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2hhbGxlbmdlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZDQUFpRTtBQUNqRSx5REFBeUQ7QUFDekQscURBQXFEO0FBQ3JELHlDQUF5QztBQUN6QyxpREFBaUQ7QUFDakQsK0RBQWdGO0FBQ2hGLG1GQUF1RTtBQUN2RSw2QkFBNkI7QUFDN0IsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywyQ0FBMEM7QUFFMUMsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBR25DLE1BQWEsY0FBZSxTQUFRLG1CQUFLO0lBQ3JDLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFpQjtRQUNqRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixJQUFJLDBCQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sV0FBVyxHQUFHLElBQUksMEJBQVksQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDMUQsTUFBTSxlQUFlLEdBQUcsSUFBSSwwQkFBWSxDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBR2xFLGNBQWM7UUFDZCxNQUFNLFFBQVEsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLGlCQUFpQjtRQUV6RCxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUN0QyxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7WUFDeEQsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPO1NBQzlCLENBQUMsQ0FBQztRQUVILGVBQWU7UUFDZiw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsb0JB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QixVQUFVLEVBQUUsS0FBSztvQkFDakIsa0JBQWtCLEVBQUU7d0JBQ2hCLHFEQUFxRCxFQUFFLHlGQUF5Rjt3QkFDaEosb0RBQW9ELEVBQUUsS0FBSzt3QkFDM0QseURBQXlELEVBQUUsU0FBUzt3QkFDcEUscURBQXFELEVBQUUsK0JBQStCO3FCQUN6RjtpQkFDSixDQUFDO1lBQ0YsNkVBQTZFO1lBQzdFLG1CQUFtQixFQUFFLG9DQUFtQixDQUFDLEtBQUs7WUFDOUMsZ0JBQWdCLEVBQUU7Z0JBQ2Qsa0JBQWtCLEVBQUUsdUJBQXVCO2FBQzlDO1NBQ0osQ0FBQyxFQUFFO1lBQ0EsZUFBZSxFQUFFLENBQUM7b0JBQ2QsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLGtCQUFrQixFQUFFO3dCQUNoQixxREFBcUQsRUFBRSxJQUFJO3dCQUMzRCxxREFBcUQsRUFBRSxJQUFJO3dCQUMzRCx5REFBeUQsRUFBRSxJQUFJO3dCQUMvRCxvREFBb0QsRUFBRSxJQUFJO3FCQUM3RDtpQkFDSixDQUFDO1NBQ0wsQ0FBQyxDQUFBO0lBQ04sQ0FBQztDQUdKO0FBeEtELHdDQXdLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7QXBwLCBDZm5QYXJhbWV0ZXIsIFN0YWNrLCBTdGFja1Byb3BzfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0IHtNb2NrSW50ZWdyYXRpb24sIFBhc3N0aHJvdWdoQmVoYXZpb3J9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCB7RHluYW1vRXZlbnRTb3VyY2V9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQge0R1cmF0aW9ufSBmcm9tICdhd3MtY2RrLWxpYi9jb3JlJztcblxuY29uc3QgY2RrID0gcmVxdWlyZSgnYXdzLWNkay1saWInKTtcblxuXG5leHBvcnQgY2xhc3MgQ2hhbGxlbmdlU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IEFwcCwgaWQ6IHN0cmluZywgcHJvcHM6IFN0YWNrUHJvcHMpIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAgICAgbmV3IENmblBhcmFtZXRlcih0aGlzLCAnQXBwSWQnKTtcbiAgICAgICAgY29uc3QgYWNjZXNza2V5SWQgPSBuZXcgQ2ZuUGFyYW1ldGVyKHRoaXMsICdhY2Nlc3NrZXlJZCcpO1xuICAgICAgICBjb25zdCBzZWNyZXRBY2Nlc3NLZXkgPSBuZXcgQ2ZuUGFyYW1ldGVyKHRoaXMsICdzZWNyZXRBY2Nlc3NLZXknKTtcblxuXG4gICAgICAgIC8vIOWumuS5iSBJQU0g6KeS6Imy5ZCN56ewXG4gICAgICAgIGNvbnN0IHJvbGVOYW1lID0gJ2NvZGUtY2hhbGxlbmdlLXJvbGUnOyAvLyDmm7/mjaLkuLrmgqjnmoQgSUFNIOinkuiJsuWQjeensFxuXG4gICAgICAgIGNvbnN0IHJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgcm9sZU5hbWUsIHtcbiAgICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlYzIuYW1hem9uYXdzLmNvbScpLCAvLyDlhYHorrggRUMyIOaJrua8lOinkuiJslxuICAgICAgICAgICAgcm9sZU5hbWU6IHJvbGVOYW1lLCAvLyDop5LoibLlkI3np7BcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8g5re75Yqg5omA6ZyA55qEIElBTSDnrZbnlaVcbiAgICAgICAgLy8g5L6L5aaC77yM5aaC5p6c5oKo6ZyA6KaBIFMzIOiuv+mXruadg+mZkO+8jOWPr+S7pea3u+WKoOS7peS4i+etlueVpVxuICAgICAgICByb2xlLmFkZE1hbmFnZWRQb2xpY3koaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TM0Z1bGxBY2Nlc3MnKSk7XG4gICAgICAgIC8vYXJuOmF3czppYW06OmF3czpwb2xpY3kvQW1hem9uRHluYW1vREJGdWxsQWNjZXNzXG4gICAgICAgIHJvbGUuYWRkTWFuYWdlZFBvbGljeShpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvbkR5bmFtb0RCRnVsbEFjY2VzcycpKTtcbiAgICAgICAgLy8gYXJuOmF3czppYW06OmF3czpwb2xpY3kvc2VydmljZS1yb2xlL0FtYXpvbkVDMlJvbGVmb3JTU01cbiAgICAgICAgcm9sZS5hZGRNYW5hZ2VkUG9saWN5KGlhbS5NYW5hZ2VkUG9saWN5LmZyb21NYW5hZ2VkUG9saWN5QXJuKHRoaXMsICdBbWF6b25FQzJSb2xlZm9yU1NNUG9saWN5JywgJ2Fybjphd3M6aWFtOjphd3M6cG9saWN5L3NlcnZpY2Utcm9sZS9BbWF6b25FQzJSb2xlZm9yU1NNJykpO1xuXG5cbiAgICAgICAgLy8g5Yib5bu65a6e5L6L6YWN572u5paH5Lu25bm25bCG6KeS6Imy5LiO5a6e5L6L6YWN572u5paH5Lu25YWz6IGUXG4gICAgICAgIGNvbnN0IHJvbGVJbnN0YW5jZSA9ICdjb2RlLWNoYWxsZW5nZS1yb2xlLWluc3RhbmNlJzsgLy8g5pu/5o2i5Li65oKo55qEIElBTSDop5LoibLlkI3np7BcbiAgICAgICAgY29uc3QgaW5zdGFuY2VQcm9maWxlID0gbmV3IGlhbS5DZm5JbnN0YW5jZVByb2ZpbGUodGhpcywgcm9sZUluc3RhbmNlLCB7XG4gICAgICAgICAgICByb2xlczogW3JvbGUucm9sZU5hbWVdLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgYXR0cm4gPSBpbnN0YW5jZVByb2ZpbGUuYXR0ckFybjtcblxuICAgICAgICAvLyDliJvlu7rkuIDkuKogVlBD77yIVmlydHVhbCBQcml2YXRlIENsb3Vk77yJXG4gICAgICAgIC8vIOWIm+W7uum7mOiupCBWUENcbiAgICAgICAgY29uc3QgdnBjID0gZWMyLlZwYy5mcm9tTG9va3VwKHRoaXMsICdEZWZhdWx0VnBjJywge1xuICAgICAgICAgICAgaXNEZWZhdWx0OiB0cnVlLFxuICAgICAgICB9KTtcblxuXG4gICAgICAgIGNvbnN0IHNlY3VyaXR5R3JvdXBOYW1lID0gXCJjb2RlLWNoYWxsZW5nZS1ncm91cC1uZXdcIjtcbiAgICAgICAgLy8g5Yib5bu65LiA5LiqIEVDMiDlronlhajnu4RcbiAgICAgICAgY29uc3Qgc2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnTXlTZWN1cml0eUdyb3VwJywge1xuICAgICAgICAgICAgdnBjLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cE5hbWU6IHNlY3VyaXR5R3JvdXBOYW1lLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdBIHNlY3VyaXR5IGdyb3VwIGZvciB0aGUgQW1hem9uIEVDMiBleGFtcGxlLicsXG4gICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyDmt7vliqAgU1NIIOWFpeermeinhOWIme+8jOWFgeiuuOaJgOaciSBJUCDlnLDlnYBcbiAgICAgICAgc2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShlYzIuUGVlci5hbnlJcHY0KCksIGVjMi5Qb3J0LnRjcCgyMiksICdBbGxvdyBTU0ggYWNjZXNzIGZyb20gYWxsIElQIGFkZHJlc3NlcycpO1xuXG5cbiAgICAgICAgY29uc3QgYnVja2V0SWQgPSAnTXlTM0J1Y2tldCc7XG4gICAgICAgIGNvbnN0IGJ1Y2tldE5hbWUgPSAnY29kZWNoYWxsZW5nZWdhbmJkYWRlaSc7XG4gICAgICAgIGNvbnN0IGJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgYnVja2V0SWQsIHtcbiAgICAgICAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICAgICAgICBidWNrZXROYW1lOiBidWNrZXROYW1lLFxuICAgICAgICAgICAgY29yczogW3tcbiAgICAgICAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sIC8vIOWFgeiuuOaJgOacieWktOmDqOWtl+autVxuICAgICAgICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbczMuSHR0cE1ldGhvZHMuR0VULCBzMy5IdHRwTWV0aG9kcy5QT1NULCBzMy5IdHRwTWV0aG9kcy5QVVQsIHMzLkh0dHBNZXRob2RzLkhFQUQsIHMzLkh0dHBNZXRob2RzLkRFTEVURV0sIC8vIOWFgeiuuOeahCBIVFRQIOaWueazlVxuICAgICAgICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSwgLy8g5YWB6K6455qE5p2l5rqQXG4gICAgICAgICAgICAgICAgLy8gZXhwb3NlZEhlYWRlcnM6IFsnKiddLCAvLyDlhazlvIDnmoTlpLTpg6jlrZfmrrVcbiAgICAgICAgICAgIH1dLFxuICAgICAgICB9KTtcblxuXG4gICAgICAgIGNvbnN0IHRhYmxlSWQgPSAnVGFibGUnO1xuICAgICAgICBjb25zdCB0YWJsZU5hbWUgPSAnbXlUYWJsZSc7XG4gICAgICAgIGNvbnN0IHBhcnRpdGlvbktleU5hbWUgPSAnaWQnO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIHRhYmxlSWQsIHtcbiAgICAgICAgICAgIHBhcnRpdGlvbktleToge25hbWU6IHBhcnRpdGlvbktleU5hbWUsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HfSxcbiAgICAgICAgICAgIHJlYWRDYXBhY2l0eTogMixcbiAgICAgICAgICAgIHdyaXRlQ2FwYWNpdHk6IDIsXG4gICAgICAgICAgICB0YWJsZU5hbWU6IHRhYmxlTmFtZSxcbiAgICAgICAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSBcIm15RnVuY3Rpb25cIjtcbiAgICAgICAgY29uc29sZS5sb2coX19kaXJuYW1lKTtcblxuICAgICAgICBjb25zdCBjcmVhdGVGdW5jdGlvbklkID0gJ2NyZWF0ZUl0ZW1GdW5jdGlvbic7XG4gICAgICAgIGNvbnN0IGNvZGVQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYXNfY3JlYXRlJyk7XG4gICAgICAgIGNvbnN0IGNyZWF0ZUhhbmRsZXIgPSAnY3JlYXRlLmhhbmRsZXInO1xuICAgICAgICBjb25zb2xlLmxvZyhjb2RlUGF0aCk7XG4gICAgICAgIGNvbnN0IGNyZWF0ZU9uZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgY3JlYXRlRnVuY3Rpb25JZCwge1xuICAgICAgICAgICAgZnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgICAgICAgIGhhbmRsZXI6IGNyZWF0ZUhhbmRsZXIsXG4gICAgICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoY29kZVBhdGgpLFxuICAgICAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgICAgICBTQU1QTEVfVEFCTEU6IHRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEdpdmUgQ3JlYXRlL1JlYWQvVXBkYXRlL0RlbGV0ZSBwZXJtaXNzaW9ucyB0byB0aGUgU2FtcGxlVGFibGVcbiAgICAgICAgdGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGNyZWF0ZU9uZUxhbWJkYSk7XG5cblxuICAgICAgICBjb25zdCBkYkV2ZW50RnVuY3Rpb25JZCA9ICdkYkV2ZW50RnVuY3Rpb25JZCc7XG4gICAgICAgIGNvbnN0IGRiRXZlbnRGdW5jdGlvbk5hbWUgPSBcImRiRXZlbnRGdW5jdGlvblwiO1xuICAgICAgICBjb25zdCBkYkV2ZW50Q29kZVBhdGggPSAnLi4vbGFtYmRhc19kYmV2ZW50JztcbiAgICAgICAgY29uc3QgZGJFdmVudEhhbmRsZXIgPSAnZGJldmVudC5oYW5kbGVyJztcbiAgICAgICAgY29uc3QgZGJFdmVudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgZGJFdmVudEZ1bmN0aW9uSWQsIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uTmFtZTogZGJFdmVudEZ1bmN0aW9uTmFtZSxcbiAgICAgICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgICAgICAgaGFuZGxlcjogZGJFdmVudEhhbmRsZXIsXG4gICAgICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgZGJFdmVudENvZGVQYXRoKSksXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIFNBTVBMRV9UQUJMRTogdGFibGUudGFibGVOYW1lLFxuICAgICAgICAgICAgICAgIFJFQUNUX0FQUF9BQ0NFU1NLRVlJRDogYWNjZXNza2V5SWQudmFsdWVBc1N0cmluZyxcbiAgICAgICAgICAgICAgICBSRUFDVF9BUFBfU0VDUkVUQUNDRVNTS0VZOiBzZWNyZXRBY2Nlc3NLZXkudmFsdWVBc1N0cmluZyxcbiAgICAgICAgICAgICAgICBCVUNLRVRfTkFNRTogYnVja2V0TmFtZSxcbiAgICAgICAgICAgICAgICBHUk9VUF9OQU1FOiBzZWN1cml0eUdyb3VwTmFtZSxcbiAgICAgICAgICAgICAgICBBVFRSTjogYXR0cm5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDYwMClcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8g5Yib5bu6IER5bmFtb0V2ZW50U291cmNlIOW5tua3u+WKoOWIsCBMYW1iZGEg5Ye95pWwXG4gICAgICAgIGNvbnN0IGR5bmFtb0V2ZW50U291cmNlID0gbmV3IER5bmFtb0V2ZW50U291cmNlKHRhYmxlLCB7XG4gICAgICAgICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5UUklNX0hPUklaT04sXG4gICAgICAgICAgICBiYXRjaFNpemU6IDEsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRiRXZlbnRMYW1iZGEuYWRkRXZlbnRTb3VyY2UoZHluYW1vRXZlbnRTb3VyY2UpO1xuXG5cbiAgICAgICAgY29uc3QgYXBpR2F0ZXdheUlkID0gJ1NlcnZlcmxlc3NSZXN0QXBpJztcbiAgICAgICAgY29uc3QgYXBpR2F0ZXdheU5hbWUgPSAnbXlBcGlOYW1lJztcbiAgICAgICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBhcGlHYXRld2F5SWQsIHtcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hSb2xlOiBmYWxzZSxcbiAgICAgICAgICAgIHJlc3RBcGlOYW1lOiBhcGlHYXRld2F5TmFtZVxuICAgICAgICB9KTtcbiAgICAgICAgYXBpLnJvb3QuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oY3JlYXRlT25lTGFtYmRhKSk7XG4gICAgICAgIGFwaS5yb290LmFkZE1ldGhvZCgnT1BUSU9OUycsIG5ldyBNb2NrSW50ZWdyYXRpb24oe1xuICAgICAgICAgICAgLy8gSW4gY2FzZSB5b3Ugd2FudCB0byB1c2UgYmluYXJ5IG1lZGlhIHR5cGVzLCB1bmNvbW1lbnQgdGhlIGZvbGxvd2luZyBsaW5lXG4gICAgICAgICAgICAvLyBjb250ZW50SGFuZGxpbmc6IENvbnRlbnRIYW5kbGluZy5DT05WRVJUX1RPX1RFWFQsXG4gICAgICAgICAgICBpbnRlZ3JhdGlvblJlc3BvbnNlczogW3tcbiAgICAgICAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJ0NvbnRlbnQtVHlwZSxYLUFtei1EYXRlLEF1dGhvcml6YXRpb24sWC1BcGktS2V5LFgtQW16LVNlY3VyaXR5LVRva2VuLFgtQW16LVVzZXItQWdlbnQnXCIsXG4gICAgICAgICAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXG4gICAgICAgICAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogXCInZmFsc2UnXCIsXG4gICAgICAgICAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiBcIidPUFRJT05TLEdFVCxQVVQsUE9TVCxERUxFVEUnXCIsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1dLFxuICAgICAgICAgICAgLy8gSW4gY2FzZSB5b3Ugd2FudCB0byB1c2UgYmluYXJ5IG1lZGlhIHR5cGVzLCBjb21tZW50IG91dCB0aGUgZm9sbG93aW5nIGxpbmVcbiAgICAgICAgICAgIHBhc3N0aHJvdWdoQmVoYXZpb3I6IFBhc3N0aHJvdWdoQmVoYXZpb3IuTkVWRVIsXG4gICAgICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IFwie1xcXCJzdGF0dXNDb2RlXFxcIjogMjAwfVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KSwge1xuICAgICAgICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbe1xuICAgICAgICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgICAgICAnbWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgJ21ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfV1cbiAgICAgICAgfSlcbiAgICB9XG5cblxufVxuXG5cbiJdfQ==