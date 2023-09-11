# Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

需要环境 nodejs 18

serverless-api-backend 项目用于通过 cdk 创建 aws 资源

* npm install -g aws-cdk
* npx cdk init
* npm run build
* aws configure
* 填写 key 和 secret
* serverless-api-backend$ cd cdk
* cdk$ npm install
* cdk$ cd lambdas_dbevent
* lambdas_dbevent npm install
* lambdas_dbevent cd ..
* cdk$ cd lambdas_create
* lambdas_create npm install
* lambdas_create cd ..
* cdk$ npm run build
* cdk$ cdk synth --no-staging > ../template.yaml
* cdk$ cdk bootstrap
* cdk$ cdk deploy CdkStack --parameters AppId=code-challenge --parameters accesskeyId=你的ACCESSKEYID --parameters
  secretAccessKey=你的SECRETACCESSKEY





