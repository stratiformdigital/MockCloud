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

## Usage with Azure SDK

MockCloud also includes an initial Azure-compatible surface for Blob Storage, Key Vault, App Configuration, Functions, API Management, Monitor Logs, WAF policies, Defender for Cloud plans, Managed Identities, RBAC role assignments, Entra ID directory objects through Microsoft Graph, Network Security Groups, Event Grid, Cosmos DB, and ARM resource groups. Azure SDK clients should use the `/azure/<service-host>` proxy path:

```typescript
import { BlobServiceClient } from '@azure/storage-blob';

const blob = BlobServiceClient.fromConnectionString(
  'DefaultEndpointsProtocol=http;AccountName=mockcloud;AccountKey=bW9ja2Nsb3Vk;BlobEndpoint=http://localhost:4444/azure/mockcloud.blob.core.windows.net;',
);

await blob.createContainer('my-container');
```

For Key Vault:

```typescript
import { SecretClient } from '@azure/keyvault-secrets';
import type { TokenCredential } from '@azure/core-auth';

const credential: TokenCredential = {
  getToken: async () => ({
    token: 'mockcloud',
    expiresOnTimestamp: Date.now() + 3600_000,
  }),
};

const secrets = new SecretClient('http://localhost:4444/azure/mockvault.vault.azure.net', credential);
const secret = await secrets.getSecret('my-secret');
```

The Key Vault REST surface accepts standard JSON bodies for writes such as `PUT /secrets/{name}?api-version=...`.

For App Configuration:

```typescript
import { AppConfigurationClient } from '@azure/app-configuration';

const appConfig = new AppConfigurationClient(
  'Endpoint=http://localhost:4444/azure/mockconfig.azconfig.io;Id=mockconfig;Secret=bW9ja2Nsb3Vk',
  { allowInsecureConnection: true },
);

await appConfig.setConfigurationSetting({
  key: 'app:message',
  label: 'dev',
  value: 'hello',
});
```

For Azure Functions:

```typescript
const endpoint = 'http://localhost:4444/azure/mockfunc.azurewebsites.net';

await fetch(`${endpoint}/admin/functions/httpTrigger`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    properties: {
      config: {
        bindings: [
          { authLevel: 'anonymous', type: 'httpTrigger', direction: 'in', name: 'req', methods: ['get', 'post'] },
          { type: 'http', direction: 'out', name: 'res' },
        ],
      },
    },
  }),
});

const response = await fetch(`${endpoint}/api/httpTrigger`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'hello' }),
});
```

For API Management:

```typescript
const endpoint = 'http://localhost:4444/azure/mockapim.azure-api.net';

await fetch(`${endpoint}/apis/orders`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    properties: {
      displayName: 'Orders',
      path: 'orders',
      protocols: ['https'],
    },
  }),
});

await fetch(`${endpoint}/apis/orders/operations/getOrder`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    properties: {
      displayName: 'Get order',
      method: 'GET',
      urlTemplate: '/{orderId}',
    },
  }),
});

const order = await fetch(`${endpoint}/orders/123`);
```

For Monitor Logs:

```typescript
await fetch('http://localhost:4444/azure/mockworkspace.ods.opinsights.azure.com/api/logs?api-version=2016-04-01', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Log-Type': 'AppEvents',
  },
  body: JSON.stringify([{ message: 'hello', level: 'info' }]),
});

const query = await fetch('http://localhost:4444/azure/api.loganalytics.io/v1/workspaces/mockworkspace/query', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer mockcloud',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: 'AppEvents | take 10' }),
});
```

For WAF policies:

```typescript
await fetch(
  'http://localhost:4444/azure/management.azure.com/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mockcloud/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/web-waf?api-version=2024-05-01',
  {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer mockcloud',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location: 'eastus',
      properties: {
        policySettings: {
          enabledState: 'Enabled',
          mode: 'Prevention',
          requestBodyCheck: true,
        },
        managedRules: {
          managedRuleSets: [
            {
              ruleSetType: 'OWASP',
              ruleSetVersion: '3.2',
            },
          ],
        },
        customRules: [],
      },
    }),
  },
);
```

For Defender for Cloud plans:

```typescript
await fetch(
  'http://localhost:4444/azure/management.azure.com/subscriptions/00000000-0000-0000-0000-000000000000/providers/Microsoft.Security/pricings/StorageAccounts?api-version=2024-01-01',
  {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer mockcloud',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        pricingTier: 'Standard',
        subPlan: 'DefenderForStorageV2',
        extensions: [
          {
            name: 'OnUploadMalwareScanning',
            isEnabled: 'True',
            additionalExtensionProperties: {
              capGBPerMonthPerStorageAccount: '5000',
            },
          },
        ],
      },
    }),
  },
);
```

For Managed Identities and RBAC role assignments:

```typescript
const subscription = '00000000-0000-0000-0000-000000000000';
const identityName = 'web-identity';
const principalId = crypto.randomUUID();

await fetch(
  `http://localhost:4444/azure/management.azure.com/subscriptions/${subscription}/resourceGroups/mockcloud/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${identityName}?api-version=2023-01-31`,
  {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer mockcloud',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location: 'eastus',
      properties: {
        clientId: crypto.randomUUID(),
        principalId,
        tenantId: '00000000-0000-0000-0000-000000000000',
      },
    }),
  },
);

await fetch(
  `http://localhost:4444/azure/management.azure.com/subscriptions/${subscription}/providers/Microsoft.Authorization/roleAssignments/${crypto.randomUUID()}?api-version=2022-04-01`,
  {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer mockcloud',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        principalId,
        principalType: 'ServicePrincipal',
        roleDefinitionId: `/subscriptions/${subscription}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`,
        scope: `/subscriptions/${subscription}`,
      },
    }),
  },
);
```

For Entra ID directory objects through Microsoft Graph:

```typescript
const graph = 'http://localhost:4444/azure/graph.microsoft.com/v1.0';

const user = await fetch(`${graph}/users`, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer mockcloud',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    displayName: 'Local User',
    userPrincipalName: 'local.user@example.com',
    mailNickname: 'localuser',
    accountEnabled: true,
  }),
});

const app = await fetch(`${graph}/applications`, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer mockcloud',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    displayName: 'web-app',
    signInAudience: 'AzureADMyOrg',
  }),
});
```

For Network Security Groups:

```typescript
await fetch(
  'http://localhost:4444/azure/management.azure.com/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mockcloud/providers/Microsoft.Network/networkSecurityGroups/web-nsg?api-version=2024-05-01',
  {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer mockcloud',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      location: 'eastus',
      properties: {
        securityRules: [
          {
            name: 'allowHttp',
            properties: {
              priority: 100,
              direction: 'Inbound',
              access: 'Allow',
              protocol: 'Tcp',
              sourcePortRange: '*',
              destinationPortRange: '80',
              sourceAddressPrefix: '*',
              destinationAddressPrefix: '*',
            },
          },
        ],
      },
    }),
  },
);
```

For Event Grid:

```typescript
import { AzureKeyCredential, EventGridPublisherClient } from '@azure/eventgrid';

const events = new EventGridPublisherClient(
  'http://localhost:4444/azure/mocktopic.eastus-1.eventgrid.azure.net/api/events',
  'EventGrid',
  new AzureKeyCredential('bW9ja2Nsb3Vk'),
  { allowInsecureConnection: true },
);

await events.send([
  {
    subject: '/mockcloud/example',
    eventType: 'MockCloud.Test',
    dataVersion: '1.0',
    data: { message: 'hello' },
  },
]);
```

For Cosmos DB:

```typescript
import { CosmosClient } from '@azure/cosmos';

const cosmos = new CosmosClient({
  endpoint: 'http://localhost:4444/azure/mockcosmos.documents.azure.com',
  key: 'bW9ja2Nsb3Vk',
  connectionPolicy: { enableEndpointDiscovery: false },
});

const { database } = await cosmos.databases.create({ id: 'my-db' });
const { container } = await database.containers.create({
  id: 'items',
  partitionKey: { paths: ['/pk'] },
});
await container.items.create({ id: 'item-1', pk: 'local', name: 'example' });
```

For Bicep-backed deployments, point Resource Manager calls at the MockCloud ARM endpoint. Bicep is compiled client-side by Azure tooling; MockCloud handles the resulting `Microsoft.Resources/deployments` requests. Install the Bicep CLI before loading MockCloud's local CA bundle if it is not already installed:

```sh
az bicep install
eval "$(./run env --azure)"
az config set core.instance_discovery=false
az cloud register \
  --name MockCloud \
  --endpoint-resource-manager "$AZURE_RESOURCE_MANAGER_ENDPOINT" \
  --endpoint-active-directory "$AZURE_AUTHORITY_HOST" \
  --endpoint-active-directory-resource-id "$AZURE_RESOURCE_MANAGER_ENDPOINT" \
  --suffix-storage-endpoint core.windows.net \
  --suffix-keyvault-dns vault.azure.net \
  --skip-endpoint-discovery
az cloud set --name MockCloud
az login --service-principal \
  --username "$AZURE_CLIENT_ID" \
  --password "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID"

az group create --name my-rg --location eastus
az deployment group create \
  --resource-group my-rg \
  --template-file main.bicep \
  --parameters containerName=my-container
```

The deployment surface currently supports resource-group and subscription-scope deployments for mocked Azure resources such as Blob Storage containers, Key Vault secrets, App Configuration key-values, Function Apps/functions, API Management services/APIs/operations, Log Analytics workspaces/tables, WAF policies, Defender for Cloud plans, Managed Identities, RBAC role assignments, Network Security Groups/security rules, and Event Grid topics/subscriptions.

## Commands

| Command | Description |
|---|---|
| `./run start` | Start MockCloud in the background (default) |
| `./run stop` | Stop a running MockCloud server |
| `./run reset` | Stop the server and delete all persisted state |
| `./run env` | Print environment variables for the current shell |
| `./run env --azure` | Print Azure SDK environment variables for the current shell |

### Configuring the AWS CLI

To point the AWS CLI at MockCloud for the current shell session:

```sh
eval "$(./run env)"
```

This sets `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`.

To print Azure SDK environment variables:

```sh
eval "$(./run env --azure)"
```

## Console

MockCloud includes a web management console at `http://localhost:4444` with UI for browsing and managing resources across all supported services.

## Supported Services

S3, DynamoDB, Lambda, CloudFormation, IAM, Cognito (User Pools + Identity Pools), API Gateway, Secrets Manager, SSM Parameter Store, KMS, EventBridge, EC2 (security groups, VPCs), WAFv2, CloudWatch Logs, STS.

Initial Azure support covers Blob Storage containers/blobs/block blobs, Key Vault secrets/keys/encrypt/decrypt, App Configuration settings/keys/labels, Azure Functions admin/HTTP trigger calls, API Management APIs/operations/gateway invocation, Monitor Logs ingestion/querying, WAF policies, Defender for Cloud plans, Managed Identities, RBAC role assignments, Entra ID users/groups/app registrations/service principals through Microsoft Graph, Network Security Groups/security rules, Event Grid topics/subscriptions/events, Cosmos DB databases/containers/items/queries, ARM resource groups and deployments, and a mock OAuth token endpoint.

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
