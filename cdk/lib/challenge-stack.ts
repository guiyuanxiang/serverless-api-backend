import {App, CfnParameter, Stack, StackProps} from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import {MockIntegration, PassthroughBehavior} from 'aws-cdk-lib/aws-apigateway';
import {DynamoEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import * as path from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {Duration} from 'aws-cdk-lib/core';

const cdk = require('aws-cdk-lib');


export class ChallengeStack extends Stack {
    constructor(scope: App, id: string, props: StackProps) {
        super(scope, id, props);

        new CfnParameter(this, 'AppId');
        const accesskeyId = new CfnParameter(this, 'accesskeyId');
        const secretAccessKey = new CfnParameter(this, 'secretAccessKey');


        // 定义 IAM 角色名称
        const roleName = 'code-challenge-role'; // 替换为您的 IAM 角色名称

        const role = new iam.Role(this, roleName, {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'), // 允许 EC2 扮演角色
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
                allowedHeaders: ['*'], // 允许所有头部字段
                allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT, s3.HttpMethods.HEAD, s3.HttpMethods.DELETE], // 允许的 HTTP 方法
                allowedOrigins: ['*'], // 允许的来源
                // exposedHeaders: ['*'], // 公开的头部字段
            }],
        });


        const tableId = 'Table';
        const tableName = 'myTable';
        const partitionKeyName = 'id';

        const table = new dynamodb.Table(this, tableId, {
            partitionKey: {name: partitionKeyName, type: dynamodb.AttributeType.STRING},
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
            timeout: Duration.seconds(600)
        });

        // 创建 DynamoEventSource 并添加到 Lambda 函数
        const dynamoEventSource = new DynamoEventSource(table, {
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
        api.root.addMethod('OPTIONS', new MockIntegration({
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
            passthroughBehavior: PassthroughBehavior.NEVER,
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
        })
    }


}


