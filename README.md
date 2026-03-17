# MockCloud

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A lightweight local mock of AWS services for development and testing.

**Warning:** MockCloud has only been tested with a small set of applications. It implements just enough of each AWS service to get specific workloads running locally. Every unhandled API action returns an empty response, so SDK calls won't crash — they just won't do anything meaningful. Expect incomplete validation and simplified behavior compared to real AWS.

## Demo

https://github.com/stratiformdigital/MockCloud/raw/refs/heads/main/demo.mp4

## Installation

**Prerequisites:** Node.js 20+, Java 11+ (for DynamoDB Local)

```sh
git clone https://github.com/stratiformdigital/MockCloud.git
cd MockCloud
yarn
```

The web console is built automatically on first `./run start`.

## Quick Start

```sh
./run start        # Start the server (background, port 4444)
./run stop         # Stop the server
./run reset        # Stop the server and clear all data
```

## Usage with AWS SDK

Point any AWS SDK v3 client at `http://localhost:4444`:

```typescript
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: 'http://localhost:4444',
  credentials: { accessKeyId: 'mockcloud', secretAccessKey: 'mockcloud' },
  forcePathStyle: true,
});

await s3.send(new CreateBucketCommand({ Bucket: 'my-bucket' }));
```

Or configure the AWS CLI for the current shell session:

```sh
eval "$(./run env)"
aws s3 mb s3://my-bucket
```

## Commands

| Command | Description |
|---|---|
| `./run start` | Start MockCloud in the background (default) |
| `./run stop` | Stop a running MockCloud server |
| `./run reset` | Stop the server and delete all persisted state |
| `./run env` | Print environment variables for the current shell |

### Configuring the AWS CLI

To point the AWS CLI at MockCloud for the current shell session:

```sh
eval "$(./run env)"
```

This sets `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`.

## Console

MockCloud includes a web management console at `http://localhost:4444` with UI for browsing and managing resources across all supported services.

## Supported Services

S3, DynamoDB, Lambda, CloudFormation, IAM, Cognito (User Pools + Identity Pools), API Gateway, Secrets Manager, SSM Parameter Store, KMS, EventBridge, EC2 (security groups, VPCs), WAFv2, CloudWatch Logs, STS.

## CDK

MockCloud supports `cdk bootstrap` and `cdk deploy`:

```sh
eval "$(./run env)"
cdk bootstrap
cdk deploy --all
```

## Tests

```sh
yarn test
```
