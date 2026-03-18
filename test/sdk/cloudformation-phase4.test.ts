import { describe, test, expect } from 'vitest';
import {
  CreateStackCommand,
  DescribeStacksCommand,
  DescribeStackResourcesCommand,
  DeleteStackCommand,
} from '@aws-sdk/client-cloudformation';
import {
  ListBucketsCommand,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
} from '@aws-sdk/client-lambda';
import JSZip from 'jszip';
import {
  createCloudFormationClient,
  createS3Client,
  createLambdaClient,
} from './client-factory.js';

const YAML_TEMPLATE = `
AWSTemplateFormatVersion: '2010-09-09'
Description: Phase 4 YAML test
Parameters:
  Env:
    Type: String
    Default: dev
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'p4-yaml-\${Env}-bucket'
  MyParam:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub '/p4/\${Env}/bucket'
      Type: String
      Value: !Ref MyBucket
Outputs:
  BucketName:
    Value: !Ref MyBucket
  ParamName:
    Value: !Sub '/p4/\${Env}/bucket'
`;

describe('CloudFormation Phase 4', () => {
  test('YAML template with shorthand tags', async () => {
    const cf = createCloudFormationClient();
    const s3 = createS3Client();
    const yamlStackName = `cf-phase4-yaml-${Date.now()}`;

    console.log('Phase 4 Test 1: YAML template with shorthand tags...');
    await cf.send(new CreateStackCommand({
      StackName: yamlStackName,
      TemplateBody: YAML_TEMPLATE,
    }));

    const yamlDesc = await cf.send(new DescribeStacksCommand({ StackName: yamlStackName }));
    const yamlStack = yamlDesc.Stacks?.[0];
    expect(yamlStack?.StackStatus).toBe('CREATE_COMPLETE');
    console.log('  Status:', yamlStack?.StackStatus);

    const yamlOutputs = yamlStack!.Outputs!;
    const bucketNameOut = yamlOutputs.find(o => o.OutputKey === 'BucketName');
    const paramNameOut = yamlOutputs.find(o => o.OutputKey === 'ParamName');
    expect(bucketNameOut).toBeTruthy();
    expect(bucketNameOut!.OutputValue).toBe('p4-yaml-dev-bucket');
    console.log('  BucketName:', bucketNameOut!.OutputValue);
    expect(paramNameOut).toBeTruthy();
    expect(paramNameOut!.OutputValue).toBe('/p4/dev/bucket');
    console.log('  ParamName:', paramNameOut!.OutputValue);

    const bucketsResult = await s3.send(new ListBucketsCommand({}));
    const yamlBucket = bucketsResult.Buckets?.find(b => b.Name === 'p4-yaml-dev-bucket');
    expect(yamlBucket).toBeTruthy();
    console.log('  S3 bucket verified:', yamlBucket!.Name);

    console.log('Phase 4 Test 1: PASSED');

    await cf.send(new DeleteStackCommand({ StackName: yamlStackName }));
    console.log('  Deleted', yamlStackName);
  });

  test('Nested stack resources are unsupported', async () => {
    const cf = createCloudFormationClient();
    const nestedStackName = `cf-phase4-nested-${Date.now()}`;
    const nestedTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        NestedStack: {
          Type: 'AWS::CloudFormation::Stack',
          Properties: {
            TemplateBody: JSON.stringify({
              AWSTemplateFormatVersion: '2010-09-09',
              Resources: {
                NestedBucket: {
                  Type: 'AWS::S3::Bucket',
                  Properties: {
                    BucketName: `p4-nested-inner-${Date.now()}`,
                  },
                },
              },
            }),
            Parameters: {},
          },
        },
      },
    });

    console.log('Phase 4 Test 2: Nested stack resources are unsupported...');
    await expect(cf.send(new CreateStackCommand({
      StackName: nestedStackName,
      TemplateBody: nestedTemplate,
    }))).rejects.toMatchObject({
      name: 'ValidationError',
    });

    await expect(cf.send(new DescribeStacksCommand({ StackName: nestedStackName }))).rejects.toMatchObject({
      name: 'ValidationError',
    });

    console.log('  ValidationError returned for unsupported nested stack resources');
  });

  test('Custom resources (Custom::* and AWS::CloudFormation::CustomResource)', async () => {
    const cf = createCloudFormationClient();
    const customStackName = `cf-phase4-custom-${Date.now()}`;
    const lambda = createLambdaClient();
    const s3 = createS3Client();
    const codeBucket = `cf-phase4-custom-code-${Date.now()}`;
    const firstFunctionName = `my-custom-handler-${Date.now()}`;
    const secondFunctionName = `another-handler-${Date.now()}`;
    const firstObjectKey = 'custom/first.zip';
    const secondObjectKey = 'custom/second.zip';

    const firstArchive = new JSZip();
    firstArchive.file('index.js', `
exports.handler = async (event) => ({
  Status: 'SUCCESS',
  PhysicalResourceId: 'custom-resource-1',
  Data: { Param1: String(event.ResourceProperties.Param1 ?? '') },
});
`);
    const secondArchive = new JSZip();
    secondArchive.file('index.js', `
exports.handler = async () => ({
  Status: 'SUCCESS',
  PhysicalResourceId: 'custom-resource-2',
});
`);

    const firstZipBody = await firstArchive.generateAsync({ type: 'nodebuffer' });
    const secondZipBody = await secondArchive.generateAsync({ type: 'nodebuffer' });

    const customTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        MyCustom: {
          Type: 'Custom::MyThing',
          Properties: {
            ServiceToken: `arn:aws:lambda:us-east-1:000000000000:function:${firstFunctionName}`,
            Param1: 'value1',
          },
        },
        MyCustom2: {
          Type: 'AWS::CloudFormation::CustomResource',
          Properties: {
            ServiceToken: `arn:aws:lambda:us-east-1:000000000000:function:${secondFunctionName}`,
          },
        },
      },
    });

    console.log('Phase 4 Test 3: Custom resources (Custom::* and AWS::CloudFormation::CustomResource)...');
    await s3.send(new CreateBucketCommand({ Bucket: codeBucket }));
    await s3.send(new PutObjectCommand({
      Bucket: codeBucket,
      Key: firstObjectKey,
      Body: firstZipBody,
      ContentType: 'application/zip',
    }));
    await s3.send(new PutObjectCommand({
      Bucket: codeBucket,
      Key: secondObjectKey,
      Body: secondZipBody,
      ContentType: 'application/zip',
    }));

    try {
      await lambda.send(new CreateFunctionCommand({
        FunctionName: firstFunctionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::000000000000:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: codeBucket,
          S3Key: firstObjectKey,
        },
      }));
      await lambda.send(new CreateFunctionCommand({
        FunctionName: secondFunctionName,
        Runtime: 'nodejs20.x',
        Role: 'arn:aws:iam::000000000000:role/lambda-role',
        Handler: 'index.handler',
        Code: {
          S3Bucket: codeBucket,
          S3Key: secondObjectKey,
        },
      }));

      await cf.send(new CreateStackCommand({
        StackName: customStackName,
        TemplateBody: customTemplate,
      }));

      const customDesc = await cf.send(new DescribeStacksCommand({ StackName: customStackName }));
      const customStack = customDesc.Stacks?.[0];
      expect(customStack?.StackStatus).toBe('CREATE_COMPLETE');
      console.log('  Status:', customStack?.StackStatus);

      const customResources = await cf.send(new DescribeStackResourcesCommand({ StackName: customStackName }));
      const resourceIds = customResources.StackResources!.map(r => r.LogicalResourceId).sort();
      expect(resourceIds).toEqual(['MyCustom', 'MyCustom2']);
      console.log('  Resources:', resourceIds.join(', '));

      for (const r of customResources.StackResources!) {
        expect(r.ResourceStatus).toBe('CREATE_COMPLETE');
      }
      console.log('  All custom resources have CREATE_COMPLETE status');

      console.log('Phase 4 Test 3: PASSED');
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: customStackName })).catch(() => undefined);
      console.log('  Deleted', customStackName);
      await lambda.send(new DeleteFunctionCommand({ FunctionName: firstFunctionName })).catch(() => undefined);
      await lambda.send(new DeleteFunctionCommand({ FunctionName: secondFunctionName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: codeBucket, Key: firstObjectKey })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: codeBucket, Key: secondObjectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: codeBucket })).catch(() => undefined);
    }
  });

});
