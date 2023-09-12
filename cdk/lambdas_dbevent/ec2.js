import {
    DescribeAddressesCommand,
    DescribeInstancesCommand,
    DescribeSecurityGroupsCommand,
    EC2Client,
    paginateDescribeImages,
    paginateDescribeInstanceTypes,
    ReleaseAddressCommand,
    RunInstancesCommand,
    TerminateInstancesCommand,
    waitUntilInstanceStatusOk,
    waitUntilInstanceTerminated
} from "@aws-sdk/client-ec2";
import {
    paginateGetParametersByPath,
    SendCommandCommand,
    SSMClient, waitForCommandExecuted,
    waitUntilCommandExecuted
} from "@aws-sdk/client-ssm";

const react_app_accesskeyid = process.env.REACT_APP_ACCESSKEYID;
const react_app_secretaccesskey = process.env.REACT_APP_SECRETACCESSKEY;
const region = 'us-east-1';
const ec2Client = new EC2Client({
    region: region, credentials: {
        accessKeyId: react_app_accesskeyid, secretAccessKey: react_app_secretaccesskey,
    }
    // ...config,
});
const ssmClient = new SSMClient({
    region: region, credentials: {
        accessKeyId: react_app_accesskeyid, secretAccessKey: react_app_secretaccesskey,
    }
    // ...config,
});


export const describeSecurityGroup = async (securityGroupName) => {
    const command = new DescribeSecurityGroupsCommand({
        GroupNames: [securityGroupName],
    });
    const {SecurityGroups} = await ec2Client.send(command);

    return SecurityGroups[0];
};


export const getAmznLinux2AMIs = async () => {
    const AMIs = [];
    for await (const page of paginateGetParametersByPath({
        client: ssmClient,
    }, {Path: "/aws/service/ami-amazon-linux-latest"})) {
        page.Parameters.forEach((param) => {
            if (param.Name.includes("amzn2")) {
                AMIs.push(param.Value);
            }
        });
    }

    const imageDetails = [];

    for await (const page of paginateDescribeImages({client: ec2Client}, {ImageIds: AMIs})) {
        imageDetails.push(...page.Images);
    }

    // const options = imageDetails.map(
    //     (image) => `${image.ImageId} - ${image.Description}`
    // );
    // const [selectedIndex] = await promptToSelect(options);
    // console.log(imageDetails);
    const returnImageDetails = [];
    for (const image of imageDetails) {
        if (image['Architecture'] === 'x86_64') {
            returnImageDetails.push(image);
        }
    }
    return returnImageDetails[0];
};

export const getCompatibleInstanceTypes = async (imageDetails) => {
    const paginator = paginateDescribeInstanceTypes({client: ec2Client, pageSize: 25}, {
        Filters: [{
            Name: "processor-info.supported-architecture", Values: [imageDetails.Architecture],
        }, {Name: "instance-type", Values: ["t2.micro"]},],
    });

    const instanceTypes = [];

    for await (const page of paginator) {
        if (page.InstanceTypes.length) {
            instanceTypes.push(...page.InstanceTypes);
        }
    }

    return instanceTypes[0];
};

export const runInstance = async ({
                                      securityGroupId, imageId, instanceType, userData, iamInstanceProfile
                                  }) => {
    const command = new RunInstancesCommand({
        SecurityGroupIds: [securityGroupId],
        ImageId: imageId,
        InstanceType: instanceType,
        MinCount: 1,
        MaxCount: 1,
        IamInstanceProfile: iamInstanceProfile,
        UserData: userData,
    });

    const {Instances} = await ec2Client.send(command);
    await waitUntilInstanceStatusOk({client: ec2Client}, {InstanceIds: [Instances[0].InstanceId]});
    return Instances[0].InstanceId;
};

export const describeInstance = async (instanceId) => {
    const command = new DescribeInstancesCommand({
        InstanceIds: [instanceId],
    });

    const {Reservations} = await ec2Client.send(command);
    return Reservations[0].Instances[0];
};


export const disassociateAddress = async (associationId) => {
    // 使用 DescribeAddressesCommand 获取所有弹性 IP 地址
    const describeParams = {};

    ec2Client
        .send(new DescribeAddressesCommand(describeParams))
        .then((data) => {
            const addresses = data.Addresses;

            // 循环遍历并释放每个弹性 IP 地址
            addresses.forEach((address) => {
                const releaseParams = {
                    AllocationId: address.AllocationId, // 弹性 IP 地址的分配 ID
                };

                ec2Client
                    .send(new ReleaseAddressCommand(releaseParams))
                    .then(() => {
                        console.log(`Released Elastic IP: ${address.PublicIp}`);
                    })
                    .catch((error) => {
                        console.error(`Error releasing Elastic IP: ${error.message}`);
                    });
            });
        })
        .catch((error) => {
            console.error("Error describing Elastic IPs:", error.message);
        });


}


export const terminateInstance = async (instanceId) => {
    const command = new TerminateInstancesCommand({
        InstanceIds: [instanceId],
    });

    try {
        await ec2Client.send(command);
        await waitUntilInstanceTerminated({client: ec2Client}, {InstanceIds: [instanceId]});

        console.log(`🧹 Instance with ID ${instanceId} terminated.\n`);
    } catch (err) {
        console.error(err);
    }
};


export const sendSSmCommand = async (params) => {
    try {
        const command = new SendCommandCommand(params);
        const response = await ssmClient.send(command);
        await waitUntilCommandExecuted({client: ssmClient, maxWaitTime: 300}, {CommandId: response.Command.CommandId});
        console.log(`🧹 response ${response} .\n`);
        return response;
    } catch (err) {
        console.error(err);
    }
};




