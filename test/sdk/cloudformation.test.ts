import { describe, test, expect } from 'vitest';
import {
  CreateStackCommand,
  CreateChangeSetCommand,
  DescribeStacksCommand,
  DescribeChangeSetCommand,
  DescribeStackResourcesCommand,
  DeleteStackCommand,
  ExecuteChangeSetCommand,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import {
  GetRolePolicyCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import {
  GetFunctionEventInvokeConfigCommand,
  GetPolicyCommand,
  ListFunctionEventInvokeConfigsCommand,
  ListEventSourceMappingsCommand,
  ListVersionsByFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import JSZip from 'jszip';
import {
  createCloudFormationClient,
  createS3Client,
  createLambdaClient,
  createIAMClient,
} from './client-factory.js';

async function createLambdaZip(source: string): Promise<Buffer> {
  const archive = new JSZip();
  archive.file('index.js', source);
  return archive.generateAsync({ type: 'nodebuffer' });
}

describe('CloudFormation', () => {
  test('DescribeStacks on nonexistent stack returns ValidationError', async () => {
    const cf = createCloudFormationClient();
    try {
      await cf.send(new DescribeStacksCommand({ StackName: 'nonexistent-stack-xyz' }));
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ValidationError');
    }
  });

  test('CreateStack rejects syntactically invalid templates immediately', async () => {
    const cf = createCloudFormationClient();
    const stackName = `cf-invalid-create-${Date.now()}`;

    await expect(cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: '{"Resources": ',
    }))).rejects.toMatchObject({
      name: 'ValidationError',
    });

    await expect(cf.send(new DescribeStacksCommand({ StackName: stackName }))).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('CreateStack rejects unsupported resource types immediately', async () => {
    const cf = createCloudFormationClient();
    const stackName = `cf-unsupported-create-${Date.now()}`;
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Nested: {
          Type: 'AWS::CloudFormation::Stack',
          Properties: {
            TemplateBody: JSON.stringify({
              AWSTemplateFormatVersion: '2010-09-09',
              Resources: {
                Bucket: {
                  Type: 'AWS::S3::Bucket',
                },
              },
            }),
          },
        },
      },
    });

    await expect(cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }))).rejects.toMatchObject({
      name: 'ValidationError',
    });

    await expect(cf.send(new DescribeStacksCommand({ StackName: stackName }))).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('CreateStack supports resources without a Properties block', async () => {
    const cf = createCloudFormationClient();
    const s3 = createS3Client();
    const stackName = `cf-no-properties-${Date.now()}`;
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }));

    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks?.[0]?.StackStatus).toBe('CREATE_COMPLETE');

    const resources = await cf.send(new DescribeStackResourcesCommand({ StackName: stackName }));
    const bucketName = resources.StackResources?.find((resource) => resource.LogicalResourceId === 'Bucket')?.PhysicalResourceId;
    expect(bucketName).toBeTruthy();
    const head = await s3.send(new HeadBucketCommand({ Bucket: bucketName! }));
    expect(head.$metadata.httpStatusCode).toBe(200);

    await cf.send(new DeleteStackCommand({ StackName: stackName }));
    await expect(s3.send(new HeadBucketCommand({ Bucket: bucketName! }))).rejects.toThrow();
  });

  test('CreateStack failure rolls back partially created resources', async () => {
    const cf = createCloudFormationClient();
    const s3 = createS3Client();
    const bucketName = `cf-failed-create-${Date.now()}`;
    const stackName = `cf-failed-create-${Date.now()}`;
    const brokenTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: bucketName,
          },
        },
        BrokenParam: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/cf/broken/create',
            Type: 'String',
            Value: { 'Fn::ImportValue': 'missing-export' },
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: brokenTemplate,
    }));

    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks?.[0]?.StackStatus).toBe('CREATE_FAILED');
    await expect(s3.send(new HeadBucketCommand({ Bucket: bucketName }))).rejects.toThrow();

    await cf.send(new DeleteStackCommand({ StackName: stackName }));
  });

  test('UpdateStack failure rolls back to the previous resources', async () => {
    const cf = createCloudFormationClient();
    const s3 = createS3Client();
    const stackName = `cf-update-rollback-${Date.now()}`;
    const originalBucket = `cf-update-original-${Date.now()}`;
    const replacementBucket = `cf-update-replacement-${Date.now()}`;

    const initialTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: originalBucket,
          },
        },
      },
    });

    const brokenUpdateTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: replacementBucket,
          },
        },
        BrokenParam: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/cf/broken/update',
            Type: 'String',
            Value: { 'Fn::ImportValue': 'missing-export' },
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: initialTemplate,
    }));

    await cf.send(new UpdateStackCommand({
      StackName: stackName,
      TemplateBody: brokenUpdateTemplate,
    }));

    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks?.[0]?.StackStatus).toBe('UPDATE_ROLLBACK_COMPLETE');
    await expect(s3.send(new HeadBucketCommand({ Bucket: replacementBucket }))).rejects.toThrow();
    const original = await s3.send(new HeadBucketCommand({ Bucket: originalBucket }));
    expect(original.$metadata.httpStatusCode).toBe(200);

    await cf.send(new DeleteStackCommand({ StackName: stackName }));
  });

  test('CloudFormation-created IAM inline policies are visible via IAM role policy APIs', async () => {
    const cf = createCloudFormationClient();
    const iam = createIAMClient();
    const stackName = `cf-iam-inline-policy-${Date.now()}`;
    const roleName = `cf-iam-inline-role-${Date.now()}`;
    const policyName = `cf-iam-inline-policy-doc-${Date.now()}`;
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Role: {
          Type: 'AWS::IAM::Role',
          Properties: {
            RoleName: roleName,
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole',
              }],
            },
          },
        },
        InlinePolicy: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyName: policyName,
            Roles: [{ Ref: 'Role' }],
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Action: 's3:GetObject',
                Resource: '*',
              }],
            },
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }));

    const policies = await iam.send(new ListRolePoliciesCommand({ RoleName: roleName }));
    expect(policies.PolicyNames).toEqual([policyName]);

    const policy = await iam.send(new GetRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
    }));
    const policyDocument = decodeURIComponent(policy.PolicyDocument ?? '');
    expect(policyDocument).toContain('"Action":"s3:GetObject"');

    await cf.send(new DeleteStackCommand({ StackName: stackName }));
  });

  test('UpdateStack rejects syntactically invalid templates without mutating the stack', async () => {
    const cf = createCloudFormationClient();
    const s3 = createS3Client();
    const stackName = `cf-invalid-update-${Date.now()}`;
    const bucketName = `cf-invalid-update-bucket-${Date.now()}`;
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: bucketName,
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }));

    await expect(cf.send(new UpdateStackCommand({
      StackName: stackName,
      TemplateBody: '{"Resources": ',
    }))).rejects.toMatchObject({
      name: 'ValidationError',
    });

    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks?.[0]?.StackStatus).toBe('CREATE_COMPLETE');
    expect(desc.Stacks?.[0]?.StackStatusReason).toBe('');
    const head = await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    expect(head.$metadata.httpStatusCode).toBe(200);

    await cf.send(new DeleteStackCommand({ StackName: stackName }));
  });

  test('UpdateStack rejects unsupported resource types without mutating the stack', async () => {
    const cf = createCloudFormationClient();
    const s3 = createS3Client();
    const stackName = `cf-unsupported-update-${Date.now()}`;
    const bucketName = `cf-unsupported-update-bucket-${Date.now()}`;
    const initialTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: bucketName,
          },
        },
      },
    });
    const unsupportedTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Nested: {
          Type: 'AWS::CloudFormation::Stack',
          Properties: {
            TemplateBody: JSON.stringify({
              AWSTemplateFormatVersion: '2010-09-09',
              Resources: {
                Bucket: {
                  Type: 'AWS::S3::Bucket',
                },
              },
            }),
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: initialTemplate,
    }));

    await expect(cf.send(new UpdateStackCommand({
      StackName: stackName,
      TemplateBody: unsupportedTemplate,
    }))).rejects.toMatchObject({
      name: 'ValidationError',
    });

    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks?.[0]?.StackStatus).toBe('CREATE_COMPLETE');
    expect(desc.Stacks?.[0]?.StackStatusReason).toBe('');
    const head = await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    expect(head.$metadata.httpStatusCode).toBe(200);

    await cf.send(new DeleteStackCommand({ StackName: stackName }));
  });

  test('CreateChangeSet rejects malformed templates instead of creating a fake change set', async () => {
    const cf = createCloudFormationClient();
    const stackName = `cf-invalid-changeset-${Date.now()}`;

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: JSON.stringify({
        AWSTemplateFormatVersion: '2010-09-09',
        Resources: {
          Bucket: {
            Type: 'AWS::S3::Bucket',
          },
        },
      }),
    }));

    try {
      await expect(cf.send(new CreateChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'invalid',
        ChangeSetType: 'UPDATE',
        TemplateBody: '{"Resources": ',
      }))).rejects.toMatchObject({
        name: 'ValidationError',
      });

      await expect(cf.send(new DescribeChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'invalid',
      }))).rejects.toMatchObject({
        name: 'ChangeSetNotFoundException',
      });
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName }));
    }
  });

  test('CreateChangeSet rejects unsupported resource types', async () => {
    const cf = createCloudFormationClient();
    const stackName = `cf-unsupported-changeset-${Date.now()}`;
    const initialTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
        },
      },
    });
    const unsupportedTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Nested: {
          Type: 'AWS::CloudFormation::Stack',
          Properties: {
            TemplateBody: JSON.stringify({
              AWSTemplateFormatVersion: '2010-09-09',
              Resources: {
                Bucket: {
                  Type: 'AWS::S3::Bucket',
                },
              },
            }),
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: initialTemplate,
    }));

    try {
      await expect(cf.send(new CreateChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'unsupported',
        ChangeSetType: 'UPDATE',
        TemplateBody: unsupportedTemplate,
      }))).rejects.toMatchObject({
        name: 'ValidationError',
      });

      await expect(cf.send(new DescribeChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'unsupported',
      }))).rejects.toMatchObject({
        name: 'ChangeSetNotFoundException',
      });
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName }));
    }
  });

  test('CreateStack fails custom resources without a ServiceToken', async () => {
    const cf = createCloudFormationClient();
    const stackName = `cf-custom-missing-token-${Date.now()}`;
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        CustomThing: {
          Type: 'Custom::Thing',
          Properties: {
            Value: 'missing-token',
          },
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }));

    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks?.[0]?.StackStatus).toBe('CREATE_FAILED');
    expect(desc.Stacks?.[0]?.StackStatusReason).toContain('Custom resource ServiceToken is required');

    await cf.send(new DeleteStackCommand({ StackName: stackName }));
  });

  test('CloudFormation-created Lambda versions are visible via Lambda API', async () => {
    const cf = createCloudFormationClient();
    const lambda = createLambdaClient();
    const s3 = createS3Client();
    const timestamp = Date.now();
    const stackName = `cf-lambda-version-${timestamp}`;
    const functionName = `cf-lambda-version-fn-${timestamp}`;
    const bucketName = `cf-lambda-version-code-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const zipBody = await createLambdaZip('exports.handler = async () => ({ ok: true });');
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Fn: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: functionName,
            Runtime: 'nodejs20.x',
            Role: 'arn:aws:iam::000000000000:role/lambda-role',
            Handler: 'index.handler',
            Code: {
              S3Bucket: bucketName,
              S3Key: objectKey,
            },
          },
        },
        Ver: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'Fn' },
          },
        },
      },
    });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await cf.send(new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
      }));

      const versions = await lambda.send(new ListVersionsByFunctionCommand({
        FunctionName: functionName,
      }));

      expect(versions.Versions?.map((version) => version.Version)).toEqual(['$LATEST', '1']);
      expect(versions.Versions?.[1]?.FunctionArn).toBe(`arn:aws:lambda:us-east-1:000000000000:function:${functionName}:1`);
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('CloudFormation-created Lambda event invoke configs are visible via Lambda API', async () => {
    const cf = createCloudFormationClient();
    const lambda = createLambdaClient();
    const s3 = createS3Client();
    const timestamp = Date.now();
    const stackName = `cf-lambda-invoke-config-${timestamp}`;
    const functionName = `cf-lambda-invoke-config-fn-${timestamp}`;
    const bucketName = `cf-lambda-invoke-config-code-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const zipBody = await createLambdaZip('exports.handler = async () => ({ ok: true });');
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Fn: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: functionName,
            Runtime: 'nodejs20.x',
            Role: 'arn:aws:iam::000000000000:role/lambda-role',
            Handler: 'index.handler',
            Code: {
              S3Bucket: bucketName,
              S3Key: objectKey,
            },
          },
        },
        InvokeConfig: {
          Type: 'AWS::Lambda::EventInvokeConfig',
          Properties: {
            FunctionName: { Ref: 'Fn' },
            Qualifier: '$LATEST',
            MaximumRetryAttempts: 1,
            MaximumEventAgeInSeconds: 120,
          },
        },
      },
    });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await cf.send(new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
      }));

      const config = await lambda.send(new GetFunctionEventInvokeConfigCommand({
        FunctionName: functionName,
        Qualifier: '$LATEST',
      }));
      expect(config.MaximumRetryAttempts).toBe(1);
      expect(config.MaximumEventAgeInSeconds).toBe(120);
      expect(config.FunctionArn).toBe(`arn:aws:lambda:us-east-1:000000000000:function:${functionName}:$LATEST`);

      const configs = await lambda.send(new ListFunctionEventInvokeConfigsCommand({
        FunctionName: functionName,
      }));
      expect(configs.FunctionEventInvokeConfigs).toHaveLength(1);
      expect(configs.FunctionEventInvokeConfigs?.[0]?.FunctionArn).toBe(config.FunctionArn);
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('CloudFormation-created Lambda permissions are visible via Lambda policy API', async () => {
    const cf = createCloudFormationClient();
    const lambda = createLambdaClient();
    const s3 = createS3Client();
    const timestamp = Date.now();
    const stackName = `cf-lambda-permission-${timestamp}`;
    const functionName = `cf-lambda-permission-fn-${timestamp}`;
    const bucketName = `cf-lambda-permission-code-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const sourceArn = `arn:aws:s3:::cf-lambda-permission-source-${timestamp}`;
    const zipBody = await createLambdaZip('exports.handler = async () => ({ ok: true });');
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Fn: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: functionName,
            Runtime: 'nodejs20.x',
            Role: 'arn:aws:iam::000000000000:role/lambda-role',
            Handler: 'index.handler',
            Code: {
              S3Bucket: bucketName,
              S3Key: objectKey,
            },
          },
        },
        Permission: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            Action: 'lambda:InvokeFunction',
            FunctionName: { Ref: 'Fn' },
            Principal: 's3.amazonaws.com',
            SourceArn: sourceArn,
          },
        },
      },
    });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await cf.send(new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
      }));

      const policy = await lambda.send(new GetPolicyCommand({
        FunctionName: functionName,
      }));
      const document = JSON.parse(policy.Policy ?? '{}');
      expect(document.Statement).toHaveLength(1);
      expect(document.Statement[0]).toMatchObject({
        Effect: 'Allow',
        Action: 'lambda:InvokeFunction',
        Principal: { Service: 's3.amazonaws.com' },
        Resource: `arn:aws:lambda:us-east-1:000000000000:function:${functionName}`,
      });
      expect(document.Statement[0].Condition).toMatchObject({
        ArnLike: { 'AWS:SourceArn': sourceArn },
      });
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('CloudFormation-created Lambda event source mappings are visible via Lambda API', async () => {
    const cf = createCloudFormationClient();
    const lambda = createLambdaClient();
    const s3 = createS3Client();
    const timestamp = Date.now();
    const stackName = `cf-lambda-event-source-${timestamp}`;
    const functionName = `cf-lambda-event-source-fn-${timestamp}`;
    const bucketName = `cf-lambda-event-source-code-${timestamp}`;
    const objectKey = 'code/handler.zip';
    const eventSourceArn = `arn:aws:sqs:us-east-1:000000000000:cf-lambda-event-source-${timestamp}`;
    const zipBody = await createLambdaZip('exports.handler = async () => ({ ok: true });');
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Fn: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: functionName,
            Runtime: 'nodejs20.x',
            Role: 'arn:aws:iam::000000000000:role/lambda-role',
            Handler: 'index.handler',
            Code: {
              S3Bucket: bucketName,
              S3Key: objectKey,
            },
          },
        },
        Mapping: {
          Type: 'AWS::Lambda::EventSourceMapping',
          Properties: {
            FunctionName: { Ref: 'Fn' },
            EventSourceArn: eventSourceArn,
            BatchSize: 5,
            Enabled: true,
          },
        },
      },
    });

    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBody,
      ContentType: 'application/zip',
    }));

    try {
      await cf.send(new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
      }));

      const mappings = await lambda.send(new ListEventSourceMappingsCommand({
        FunctionName: functionName,
      }));
      expect(mappings.EventSourceMappings).toHaveLength(1);
      expect(mappings.EventSourceMappings?.[0]).toMatchObject({
        FunctionArn: `arn:aws:lambda:us-east-1:000000000000:function:${functionName}`,
        EventSourceArn: eventSourceArn,
        BatchSize: 5,
        State: 'Enabled',
      });
      expect(mappings.EventSourceMappings?.[0]?.UUID).toBeTruthy();
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName })).catch(() => undefined);
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey })).catch(() => undefined);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName })).catch(() => undefined);
    }
  });

  test('ExecuteChangeSet rejects failed no-op change sets', async () => {
    const cf = createCloudFormationClient();
    const stackName = `cf-noop-changeset-${Date.now()}`;
    const templateBody = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
        },
      },
    });

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
    }));

    try {
      await cf.send(new CreateChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'noop',
        ChangeSetType: 'UPDATE',
        TemplateBody: templateBody,
      }));

      const before = await cf.send(new DescribeChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'noop',
      }));
      expect(before.Status).toBe('FAILED');
      expect(before.StatusReason).toContain("didn't contain changes");

      await expect(cf.send(new ExecuteChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'noop',
      }))).rejects.toMatchObject({
        name: 'ValidationError',
      });

      const after = await cf.send(new DescribeChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'noop',
      }));
      expect(after.Status).toBe('FAILED');
      expect(after.StatusReason).toContain("didn't contain changes");
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName }));
    }
  });

  test('ExecuteChangeSet applies stack tags from create and update change sets', async () => {
    const cf = createCloudFormationClient();
    const createStackName = `cf-create-tags-changeset-${Date.now()}`;
    const updateStackName = `cf-update-tags-changeset-${Date.now()}`;
    const createTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
        },
      },
    });
    const updateTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
        },
        BucketTwo: {
          Type: 'AWS::S3::Bucket',
        },
      },
    });

    try {
      await cf.send(new CreateChangeSetCommand({
        StackName: createStackName,
        ChangeSetName: 'create-tags',
        ChangeSetType: 'CREATE',
        TemplateBody: createTemplate,
        Tags: [{ Key: 'Env', Value: 'dev' }],
      }));

      await cf.send(new ExecuteChangeSetCommand({
        StackName: createStackName,
        ChangeSetName: 'create-tags',
      }));

      const created = await cf.send(new DescribeStacksCommand({ StackName: createStackName }));
      expect(created.Stacks?.[0]?.Tags).toEqual([{ Key: 'Env', Value: 'dev' }]);

      await cf.send(new CreateStackCommand({
        StackName: updateStackName,
        TemplateBody: createTemplate,
        Tags: [{ Key: 'Old', Value: '1' }],
      }));

      await cf.send(new CreateChangeSetCommand({
        StackName: updateStackName,
        ChangeSetName: 'update-tags',
        ChangeSetType: 'UPDATE',
        TemplateBody: updateTemplate,
        Tags: [{ Key: 'New', Value: '2' }],
      }));

      await cf.send(new ExecuteChangeSetCommand({
        StackName: updateStackName,
        ChangeSetName: 'update-tags',
      }));

      const updated = await cf.send(new DescribeStacksCommand({ StackName: updateStackName }));
      expect(updated.Stacks?.[0]?.Tags).toEqual([{ Key: 'New', Value: '2' }]);
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: createStackName })).catch(() => undefined);
      await cf.send(new DeleteStackCommand({ StackName: updateStackName })).catch(() => undefined);
    }
  });

  test('ExecuteChangeSet applies RoleARN from update change sets', async () => {
    const cf = createCloudFormationClient();
    const stackName = `cf-role-changeset-${Date.now()}`;
    const initialTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
        },
      },
    });
    const updateTemplate = JSON.stringify({
      AWSTemplateFormatVersion: '2010-09-09',
      Resources: {
        Bucket: {
          Type: 'AWS::S3::Bucket',
        },
        BucketTwo: {
          Type: 'AWS::S3::Bucket',
        },
      },
    });
    const originalRoleArn = 'arn:aws:iam::000000000000:role/original-role';
    const updatedRoleArn = 'arn:aws:iam::000000000000:role/updated-role';

    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: initialTemplate,
      RoleARN: originalRoleArn,
    }));

    try {
      await cf.send(new CreateChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'update-role',
        ChangeSetType: 'UPDATE',
        TemplateBody: updateTemplate,
        RoleARN: updatedRoleArn,
      }));

      await cf.send(new ExecuteChangeSetCommand({
        StackName: stackName,
        ChangeSetName: 'update-role',
      }));

      const updated = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
      expect(updated.Stacks?.[0]?.RoleARN).toBe(updatedRoleArn);
    } finally {
      await cf.send(new DeleteStackCommand({ StackName: stackName })).catch(() => undefined);
    }
  });
});
