import {
    describeSecurityGroup, disassociateAddress,
    getAmznLinux2AMIs,
    getCompatibleInstanceTypes,
    runInstance,
    sendSSmCommand,
    terminateInstance,
} from './ec2.js'

const react_app_accesskeyid = process.env.REACT_APP_ACCESSKEYID;
const react_app_secretaccesskey = process.env.REACT_APP_SECRETACCESSKEY;

// snippet-start:[javascript.v3.utils.wrapText]
export const wrapText = (text, char = "=") => {
    const rule = char.repeat(80);
    return `${rule}\n    ${text}\n${rule}\n`;
};

// 创建 DynamoDB 客户端实例
export const handler = async (event) => {

    let instanceId, groupId;
    try {
        for (const record of event.Records) {
            // 检查记录的事件类型是否是 INSERT
            if (record.eventName === 'INSERT') {
                // 获取新插入的数据
                const newItem = record.dynamodb.NewImage;
                const id = newItem.id.S;
                // 在这里使用 newItem 进行操作，例如打印到日志
                console.log('New item:', JSON.stringify(newItem, null, 2));
                console.log(id);
                const bucketName = process.env.BUCKET_NAME;
                const attrn = process.env.ATTRN;
                const tableName = process.env.SAMPLE_TABLE;
                const securityGroupName = process.env.GROUP_NAME;

                const region = 'us-east-1';
                try {
                    // Prerequisites
                    const {GroupName, GroupId} = await describeSecurityGroup(securityGroupName);
                    groupId = GroupId;
                    console.log(`✅ created the security group ${GroupName}`, `GroupId ${GroupId}.\n`);
                    // Creating the instance
                    console.log(wrapText("Create the instance."));
                    const imageDetails = await getAmznLinux2AMIs();
                    const instanceTypeDetails = await getCompatibleInstanceTypes(imageDetails);
                    console.log("Creating your instance. This can take a few seconds.");

                    const userDataScript = `#!/bin/bash
                        sudo yum install pip
                        sudo python3 -m pip install --upgrade pip
                        sudo pip3 install boto3
                        `;
                    const base64UserData = Buffer.from(userDataScript).toString('base64');
                    console.log(`attrn:${attrn}`)
                    instanceId = await runInstance({
                        securityGroupId: groupId,
                        imageId: imageDetails.ImageId,
                        instanceType: instanceTypeDetails.InstanceType,
                        iamInstanceProfile: {
                            Arn: attrn
                        },
                        userData: base64UserData
                    });
                    console.log(`created instance ${instanceId}.\n`);
                    console.log(`======sendSSmCommand======`);
                    //需要传递 主键
                    const s3Key = `awsScript.py`;
                    // 执行脚本的命令
                    const commandLine = `sudo python3 ${s3Key} ${bucketName} ${id} ${tableName} ${react_app_accesskeyid} ${react_app_secretaccesskey}`;


                    const params = {
                        InstanceIds: [instanceId], // 替换为您的 EC2 实例 ID
                        DocumentName: 'AWS-RunRemoteScript', Parameters: {
                            sourceType: ["S3"],
                            sourceInfo: [JSON.stringify({
                                path: `https://${bucketName}.s3.amazonaws.com/${s3Key}`, // 正确配置 S3 存储桶和键
                            })],
                            commandLine: [commandLine],
                            workingDirectory: ["/tmp"],
                        },
                        OutputS3Region: region,
                        OutputS3BucketName: bucketName,
                        TimeoutSeconds: 60,
                    };

                    await sendSSmCommand(params);
                    console.log(`✅ instance ${instanceId}.\n`);
                } catch (error) {
                    console.error('Error:', error);
                    throw error;
                } finally {
                    // Clean up.
                    console.log(wrapText("Clean up."));
                    await terminateInstance(instanceId);
                    await disassociateAddress();
                    console.log("Done cleaning up. Thanks for staying until the end!", "If you have any feedback please use the feedback button in the docs", "or create an issue on GitHub.");
                }
            }
        }

        return 'Success';
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};
