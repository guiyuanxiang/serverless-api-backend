#!/usr/bin/env node
import {App, Aws, CfnParameter} from 'aws-cdk-lib';

import {ChallengeStack} from '../lib/challenge-stack';
// import { PermissionsBoundaryAspect } from '../lib/permissions-boundary-aspect';
const account = process.env.ACCOUNT;

const stack = new ChallengeStack(new App(), 'CdkStack', {

    description: 'Website & Mobile starter project',
    env: {
        region: 'us-east-1',
        account: account,
    }

});
const {ACCOUNT_ID, PARTITION, REGION, STACK_NAME} = Aws;
// const permissionBoundaryArn = `arn:${PARTITION}:iam::${ACCOUNT_ID}:policy/${STACK_NAME}-${REGION}-PermissionsBoundary`;

// Apply permissions boundary to the stack
// Aspects.of(stack).add(new PermissionsBoundaryAspect(permissionBoundaryArn));
