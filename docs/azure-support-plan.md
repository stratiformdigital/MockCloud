# Plan: Add Azure Support to MockCloud

## Current State

MockCloud mocks 18 AWS services behind a single HTTP server on port 4444. The architecture is tightly coupled to AWS conventions at every layer:

| Layer | AWS coupling |
|---|---|
| **Router** (`src/router.ts`) | Detects `.amazonaws.com` / `.amazoncognito.com` hosts, `AWS4-HMAC-SHA256` auth headers, `X-Amz-Target` headers |
| **Resolver** (`src/services/resolve.ts`) | Matches by `hostPatterns` (e.g. `kms.*.amazonaws.com`) and `targetPrefix` (e.g. `TrentService`) |
| **Request parser** (`src/middleware/request-parser.ts`) | Extracts actions from `X-Amz-Target` and `Action=` query params; decodes `aws-chunked` encoding |
| **Response helpers** (`src/services/response.ts`) | `application/x-amz-json-1.1` content type, `{ __type: code, message }` error format |
| **Middleware** (`src/middleware/aws-headers.ts`) | Applies `x-amzn-requestid` and `x-amz-request-id` response headers |
| **Service definitions** (`src/types.ts`) | `MockServiceDefinition` has `hostPatterns`, `protocol` (query/json/rest-xml/rest-json are AWS protocol families), `targetPrefix`, `signingName` |
| **Config** (`src/config.ts`) | `REGION = 'us-east-1'`, `ACCOUNT_ID = '000000000000'` |
| **State** | ARN generation, AWS account structure |

## Architecture Decision: Provider-Specific Stacks

Two approaches were considered:

1. **Generalized abstractions** — Refactor `MockServiceDefinition` into a provider-agnostic interface, create adapter layers for both AWS and Azure.
2. **Provider-specific routers** — Keep the AWS stack untouched. Add a parallel Azure stack (router, resolver, service definitions, middleware) and dispatch at the top level by request shape.

**Recommended: Option 2 (provider-specific routers).** Rationale:

- AWS and Azure have fundamentally different request conventions (auth headers, host patterns, error formats, API versioning). A "generic" abstraction would be a leaky union type that makes both sides harder to read.
- Zero risk to the working AWS implementation. The existing router, resolver, and 18 services stay exactly as they are.
- Matches the project philosophy: "just enough to get specific workloads running locally."
- Provider detection is cheap — Azure requests are trivially distinguishable from AWS requests (different hosts, different auth, `api-version` query param).

## Implementation Plan

### Phase 1: Provider Routing Layer

**Goal:** Route incoming requests to the correct provider stack without changing any existing AWS code.

**Changes:**

1. **`src/router.ts`** — Add a top-level check before any AWS-specific logic. If the request matches Azure patterns, delegate to `handleAzureRequest()`.

   Detection heuristics (checked in order):
   - Path starts with `/api/` and the embedded hostname matches `*.azure.com`, `*.core.windows.net`, `*.vault.azure.net`, `*.azurecr.io`, etc.
   - Host header matches any Azure domain
   - `Authorization: Bearer` + `api-version` query param (Azure REST convention)
   - Path starts with `/azure/` (explicit proxy path, similar to `/api/` for AWS)

2. **`src/types.ts`** — Add `AzureServiceDefinition` alongside `MockServiceDefinition`:

   ```typescript
   export interface AzureServiceDefinition {
     name: string;
     hostPatterns: string[];          // e.g. ['*.blob.core.windows.net']
     pathPatterns?: string[];         // e.g. ['/subscriptions/*/resourceGroups/*']
     handlers: Record<string, AzureHandler>;
   }

   export type AzureHandler = (req: AzureParsedRequest) => ApiResponse | Promise<ApiResponse>;

   export interface AzureParsedRequest extends ParsedApiRequest {
     apiVersion: string;              // from ?api-version=2023-11-03
     subscriptionId?: string;         // extracted from /subscriptions/{id}
     resourceGroup?: string;          // extracted from /resourceGroups/{name}
     provider?: string;               // e.g. 'Microsoft.Storage'
   }
   ```

   `ApiResponse` stays shared — both providers return HTTP responses.

### Phase 2: Azure Core Infrastructure

**New files, all under `src/azure/`:**

| File | Purpose |
|---|---|
| `src/azure/config.ts` | `SUBSCRIPTION_ID`, `TENANT_ID`, `LOCATION` constants |
| `src/azure/router.ts` | Azure request dispatch, similar to `handleApiRequest()` |
| `src/azure/resolve.ts` | Match requests to Azure services by host pattern + path pattern |
| `src/azure/request-parser.ts` | Extract `api-version`, subscription/resource-group from path, parse JSON body |
| `src/azure/response.ts` | Azure response helpers: `jsonOk()`, `azureError()` (Azure error envelope: `{ error: { code, message } }`) |
| `src/azure/middleware.ts` | Apply Azure response headers (`x-ms-request-id`, `x-ms-version`) |
| `src/azure/registry.ts` | `getAllAzureServices()` — same pattern as `src/services/registry.ts` |

**Azure error format:**
```json
{
  "error": {
    "code": "ResourceNotFound",
    "message": "The specified resource does not exist."
  }
}
```

**Azure auth handling:** Accept and ignore `Authorization: Bearer <token>` and `Authorization: SharedKey <account>:<signature>`. No real validation, same philosophy as the AWS side ignoring `AWS4-HMAC-SHA256` signatures.

### Phase 3: Initial Azure Services

Start with services that cover the most common local development use cases:

#### 1. Azure Blob Storage (`src/azure/services/blob-storage/`)

The Azure equivalent of S3. Uses `*.blob.core.windows.net` hosts and the Blob REST API.

**Operations:**
- Container CRUD: `CreateContainer`, `DeleteContainer`, `ListContainers`, `GetContainerProperties`
- Blob CRUD: `PutBlob`, `GetBlob`, `DeleteBlob`, `ListBlobs`, `GetBlobProperties`
- Block blobs: `PutBlock`, `PutBlockList`, `GetBlockList`

**SDK compatibility:** `@azure/storage-blob` (`BlobServiceClient`)

**Routing:** `{account}.blob.core.windows.net/{container}/{blob}` with REST verbs. Also `/azure/{account}.blob.core.windows.net/...` proxy path.

**State reuse:** Can share the existing `PersistentMap` and the filesystem-backed storage approach from the S3 service for actual blob data.

#### 2. Azure Key Vault (`src/azure/services/keyvault/`)

Covers both secrets and keys (analogous to KMS + Secrets Manager).

**Operations:**
- Secrets: `SetSecret`, `GetSecret`, `DeleteSecret`, `ListSecrets`, `GetDeletedSecret`, `PurgeDeletedSecret`
- Keys: `CreateKey`, `GetKey`, `ListKeys`, `Encrypt`, `Decrypt`

**SDK compatibility:** `@azure/keyvault-secrets`, `@azure/keyvault-keys`

**Routing:** `{vault-name}.vault.azure.net/secrets/{name}` and `.../keys/{name}` with `api-version` query param.

#### 3. Azure Resource Manager (`src/azure/services/arm/`)

Minimal ARM support so other services can resolve resource groups and Bicep-backed deployments can provision mocked Azure resources.

**Operations:**
- `CreateOrUpdateResourceGroup`, `GetResourceGroup`, `ListResourceGroups`, `DeleteResourceGroup`
- `CreateOrUpdateDeployment`, `GetDeployment`, `DeleteDeployment`, `ValidateDeployment`
- Generic resource `Get`, `ListByResourceGroup`, `CreateOrUpdate`, and `Delete` for mocked resource records

**SDK compatibility:** `@azure/arm-resources`

**Routing:** `management.azure.com/subscriptions/{sub}/resourcegroups/{rg}` and `management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Resources/deployments/{deployment}`

**Azure CLI/Bicep compatibility:** MockCloud serves Azure CLI traffic over a local HTTPS endpoint because Azure CLI/MSAL requires HTTPS authority URLs. Bicep files are compiled by the Azure CLI before MockCloud receives the deployment request.

#### 4. Azure Cosmos DB (`src/azure/services/cosmos/`)

The Azure equivalent for the current DynamoDB local data-store coverage. Uses `*.documents.azure.com` hosts and the Cosmos DB NoSQL REST shape.

**Operations:**
- Database CRUD: `CreateDatabase`, `ReadDatabase`, `DeleteDatabase`, `ReadAllDatabases`
- Container CRUD: `CreateContainer`, `ReadContainer`, `ReplaceContainer`, `DeleteContainer`, `ReadAllContainers`
- Item CRUD: `CreateItem`, `ReadItem`, `UpsertItem`, `ReplaceItem`, `DeleteItem`, `ReadAllItems`
- Query basics: `SELECT * FROM c` and simple equality filters with SDK query parameters
- Partition key range metadata for SDK compatibility

**SDK compatibility:** `@azure/cosmos`

**Routing:** `{account}.documents.azure.com/dbs/{database}/colls/{container}/docs/{item}` with REST verbs. Also `/azure/{account}.documents.azure.com/...` proxy path.

#### 5. Azure App Configuration (`src/azure/services/app-configuration/`)

The Azure equivalent for SSM Parameter Store-style key/value configuration. Uses `*.azconfig.io` hosts and the App Configuration data-plane REST shape.

**Operations:**
- Configuration setting CRUD: `AddConfigurationSetting`, `SetConfigurationSetting`, `GetConfigurationSetting`, `DeleteConfigurationSetting`
- Listing: `ListConfigurationSettings`, `ListLabels`, `ListKeys`
- Conditional write/read basics through ETag headers
- Read-only lock toggles for SDK compatibility
- ARM/Bicep provisioning for `Microsoft.AppConfiguration/configurationStores/keyValues`

**SDK compatibility:** `@azure/app-configuration`

**Routing:** `{account}.azconfig.io/kv/{key}`, `{account}.azconfig.io/keys`, and `{account}.azconfig.io/labels` with REST verbs. Also `/azure/{account}.azconfig.io/...` proxy path.

#### 6. Azure Functions (`src/azure/services/functions/`)

The Azure equivalent for the current Lambda local compute coverage. Uses `*.azurewebsites.net` hosts and a small Functions host/admin surface.

**Operations:**
- Function app host status
- Function CRUD through `/admin/functions/{name}`
- Function listing through `/admin/functions`
- HTTP trigger invocation through `/api/{name}`
- ARM/Bicep provisioning for `Microsoft.Web/sites` and `Microsoft.Web/sites/functions`

**SDK compatibility:** ARM resource lookup through `@azure/arm-resources`; invocation uses the Functions host HTTP surface.

**Routing:** `{app}.azurewebsites.net/admin/functions/{function}` and `{app}.azurewebsites.net/api/{function}`. Also `/azure/{app}.azurewebsites.net/...` proxy path.

#### 7. Azure API Management (`src/azure/services/api-management/`)

The Azure equivalent for the current API Gateway local API routing coverage. Uses `*.azure-api.net` gateway hosts and a small control-plane surface for APIs and operations.

**Operations:**
- API CRUD through `/apis/{apiName}`
- Operation CRUD through `/apis/{apiName}/operations/{operationName}`
- Gateway invocation by matching API paths and operation URL templates
- ARM/Bicep provisioning for `Microsoft.ApiManagement/service`, `Microsoft.ApiManagement/service/apis`, and `Microsoft.ApiManagement/service/apis/operations`

**SDK compatibility:** ARM resource lookup through `@azure/arm-resources`; invocation uses the API Management gateway HTTP surface.

**Routing:** `{service}.azure-api.net/{apiPath}`. Also `/azure/{service}.azure-api.net/...` proxy path.

#### 8. Azure Network Security Groups

The Azure equivalent for the current EC2 security group coverage. Uses ARM generic resources because Network Security Groups are managed through Azure Resource Manager.

**Operations:**
- Network Security Group create/read/list/delete through ARM resource endpoints
- Security rule provisioning as `Microsoft.Network/networkSecurityGroups/securityRules`
- ARM/Bicep provisioning for `Microsoft.Network/networkSecurityGroups` and nested `securityRules`

**SDK compatibility:** ARM resource lookup through `@azure/arm-resources`.

**Routing:** `management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Network/networkSecurityGroups/{name}`. Also `/azure/management.azure.com/...` proxy path.

#### 9. Azure Monitor Logs (`src/azure/services/monitor/`)

The Azure equivalent for the current CloudWatch Logs coverage. Uses Log Analytics-style ingestion/query endpoints with ARM-backed workspaces and tables.

**Operations:**
- Workspace provisioning through `Microsoft.OperationalInsights/workspaces`
- Table provisioning through `Microsoft.OperationalInsights/workspaces/tables`
- Record ingestion through `{workspace}.ods.opinsights.azure.com/api/logs`
- Table and record listing for the console
- Simple Log Analytics query responses through `api.loganalytics.io/v1/workspaces/{workspace}/query`

**SDK compatibility:** ARM resource lookup through `@azure/arm-resources`; ingestion/query use Azure Monitor HTTP surfaces.

**Routing:** `{workspace}.ods.opinsights.azure.com/api/logs` and `api.loganalytics.io/v1/workspaces/{workspace}/query`. Also `/azure/{host}/...` proxy paths.

#### 10. Azure Web Application Firewall Policies

The Azure equivalent for the current WAFv2 Web ACL coverage. Uses ARM generic resources because WAF policies are managed through Azure Resource Manager.

**Operations:**
- WAF policy create/read/list/delete through ARM resource endpoints
- Managed rule and custom rule persistence
- ARM/Bicep provisioning for `Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies`

**SDK compatibility:** ARM resource lookup through `@azure/arm-resources`.

**Routing:** `management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/{name}`. Also `/azure/management.azure.com/...` proxy path.

#### 11. Azure Defender for Cloud Plans

The Azure equivalent for the current GuardDuty malware-protection-plan coverage. Uses ARM generic resources because Defender plan pricing is managed through Azure Resource Manager.

**Operations:**
- Defender plan create/read/list/delete through ARM resource endpoints
- Pricing tier, sub-plan, and extension persistence
- ARM/Bicep provisioning for `Microsoft.Security/pricings`

**SDK compatibility:** ARM resource lookup through `@azure/arm-resources`.

**Routing:** `management.azure.com/subscriptions/{sub}/providers/Microsoft.Security/pricings/{name}`. Also `/azure/management.azure.com/...` proxy path.

#### 12. Azure Managed Identities and RBAC Role Assignments

The Azure equivalent for the current IAM role/policy attachment coverage. Uses ARM generic resources because user-assigned managed identities and role assignments are managed through Azure Resource Manager.

**Operations:**
- User-assigned managed identity create/read/list/delete through ARM resource endpoints
- Role assignment create/read/list/delete through ARM resource endpoints
- ARM/Bicep provisioning for `Microsoft.ManagedIdentity/userAssignedIdentities` and `Microsoft.Authorization/roleAssignments`

**SDK compatibility:** ARM resource lookup through `@azure/arm-resources`.

**Routing:** `management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{name}` and `management.azure.com/subscriptions/{sub}/providers/Microsoft.Authorization/roleAssignments/{name}`. Also `/azure/management.azure.com/...` proxy path.

#### 13. Azure Entra ID / Microsoft Graph (`src/azure/services/graph/`)

The Azure equivalent for Cognito-style directory, application, and service-principal coverage. Uses the Microsoft Graph REST shape for local directory objects.

**Operations:**
- `GET /me`
- User create/read/list/delete
- Group create/read/list/delete
- Application create/read/list/delete
- Service principal create/read/list/delete

**SDK compatibility:** Microsoft Graph-compatible REST clients that can point at the `/azure/graph.microsoft.com` proxy path.

**Routing:** `graph.microsoft.com/v1.0/{users|groups|applications|servicePrincipals}`. Also `/azure/graph.microsoft.com/...` proxy path.

#### 14. Azure Event Grid (`src/azure/services/eventgrid/`)

The Azure equivalent for the current EventBridge event publishing coverage. Uses `*.eventgrid.azure.net` topic hosts and a small data-plane surface for local event capture.

**Operations:**
- Event publishing through `/api/events`
- Event listing through `/api/events`
- Event subscription listing through `/api/subscriptions`
- ARM/Bicep provisioning for `Microsoft.EventGrid/topics` and `Microsoft.EventGrid/topics/eventSubscriptions`

**SDK compatibility:** `@azure/eventgrid`

**Routing:** `{topic}.{location}-1.eventgrid.azure.net/api/events`. Also `/azure/{topic}.{location}-1.eventgrid.azure.net/...` proxy path.

### Phase 4: Console & CLI Integration

1. **Web console** — Add an "Azure" tab or section to the console UI showing Azure resources. The console already fetches state via internal endpoints; add equivalent `/api/azure/*` internal routes.

2. **CLI** — Update `./run env` to optionally print Azure SDK environment variables:
   - `AZURE_STORAGE_CONNECTION_STRING`
   - `AZURE_KEYVAULT_URL`
   - `AZURE_APPCONFIG_ENDPOINT`
   - `AZURE_APPCONFIG_CONNECTION_STRING`
   - `AZURE_FUNCTIONS_ENDPOINT`
   - `AZURE_EVENTGRID_ENDPOINT`
   - `AZURE_EVENTGRID_KEY`
   - `AZURE_APIM_GATEWAY_ENDPOINT`
   - `AZURE_LOG_ANALYTICS_WORKSPACE`
   - `AZURE_LOG_ANALYTICS_INGEST_ENDPOINT`
   - `AZURE_LOG_ANALYTICS_QUERY_ENDPOINT`
   - Or a `--azure` flag.

3. **README** — Add Azure usage examples alongside the existing AWS examples.

### Phase 5: Testing

Mirror the existing test structure:

| Test file | What it covers |
|---|---|
| `test/sdk/azure-blob-storage.test.ts` | `@azure/storage-blob` client against MockCloud |
| `test/sdk/azure-keyvault.test.ts` | `@azure/keyvault-secrets` + `@azure/keyvault-keys` |
| `test/sdk/azure-arm.test.ts` | `@azure/arm-resources` resource group operations |
| `test/sdk/azure-cosmos.test.ts` | `@azure/cosmos` database, container, item, and query operations |
| `test/sdk/azure-app-configuration.test.ts` | `@azure/app-configuration` setting lifecycle, labels, and duplicate handling |
| `test/sdk/azure-functions.test.ts` | Azure Functions host/admin calls and ARM deployment side effects |
| `test/sdk/azure-api-management.test.ts` | API Management gateway invocation and ARM deployment side effects |
| `test/sdk/azure-network.test.ts` | Network Security Group ARM resources and deployment side effects |
| `test/sdk/azure-monitor.test.ts` | Monitor Logs ingestion/querying and ARM deployment side effects |
| `test/sdk/azure-waf.test.ts` | WAF policy ARM resources and deployment side effects |
| `test/sdk/azure-defender.test.ts` | Defender for Cloud pricing plan ARM resources and deployment side effects |
| `test/sdk/azure-identity.test.ts` | Managed Identity and RBAC role assignment ARM resources and deployment side effects |
| `test/sdk/azure-entra.test.ts` | Microsoft Graph users, groups, app registrations, and service principals |
| `test/sdk/azure-eventgrid.test.ts` | Event Grid publishing and ARM deployment side effects |

Test factory at `test/sdk/azure-client-factory.ts` with shared config (endpoint override, dummy credentials).

Azure SDKs support custom endpoints via their client constructors (e.g. `BlobServiceClient(url)` where url points to `http://localhost:4444`).

## File Tree After Implementation

```
src/
  azure/
    config.ts
    router.ts
    resolve.ts
    request-parser.ts
    response.ts
    middleware.ts
    registry.ts
    services/
      blob-storage/
        index.ts
      keyvault/
        index.ts
      cosmos/
        index.ts
      app-configuration/
        index.ts
      functions/
        index.ts
      api-management/
        index.ts
      eventgrid/
        index.ts
      graph/
        index.ts
      monitor/
        index.ts
      arm/
        index.ts
  services/          # (existing AWS services, unchanged)
  router.ts          # (modified: add Azure dispatch at top)
  types.ts           # (modified: add Azure types)
test/
  sdk/
    azure-blob-storage.test.ts
    azure-keyvault.test.ts
    azure-cosmos.test.ts
    azure-app-configuration.test.ts
    azure-functions.test.ts
    azure-api-management.test.ts
    azure-network.test.ts
    azure-monitor.test.ts
    azure-waf.test.ts
    azure-defender.test.ts
    azure-identity.test.ts
    azure-entra.test.ts
    azure-eventgrid.test.ts
    azure-arm.test.ts
    azure-client-factory.ts
```

## Execution Order

1. Phase 1 + Phase 2 together (routing + core infra) — one PR
2. Phase 3 services, one per PR (blob storage first, then keyvault, then ARM)
3. Phase 4 + 5 (console/CLI/tests) can parallel with Phase 3

## Risks and Open Questions

1. **Azure SDK endpoint overrides** — Need to verify that each Azure SDK (`@azure/storage-blob`, `@azure/keyvault-secrets`, etc.) supports pointing at a custom local endpoint. Preliminary research says yes (they accept a URL in the constructor), but this needs verification for auth token handling.

2. **Managed Identity / DefaultAzureCredential** — The Azure SDK's `DefaultAzureCredential` tries multiple auth methods. MockCloud should accept any bearer token or provide a mock token endpoint. May need a minimal `/oauth2/token` endpoint that hands back a dummy token.

3. **`api-version` compatibility** — Azure APIs are versioned. MockCloud can accept any version and return the latest-known response shape, or it can enforce a minimum version. Recommendation: accept any version, same philosophy as ignoring AWS signature validation.

4. **Port sharing** — Both AWS and Azure requests can be served on the same port (4444) since they're distinguishable by host/header patterns. No need for a separate port.
