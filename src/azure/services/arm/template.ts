import { createHash } from 'node:crypto';
import { LOCATION, SUBSCRIPTION_ID } from '../../config.js';

export interface ArmTemplateResource {
  logicalId: string;
  id: string;
  name: string;
  type: string;
  apiVersion: string;
  location?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
  sku?: unknown;
  kind?: string;
  identity?: unknown;
  nestedResources?: ArmTemplateResource[];
}

export interface ArmTemplateProvisionResult {
  parameters: Record<string, { value: unknown }>;
  resources: ArmTemplateResource[];
  outputs: Record<string, { type: string; value: unknown }>;
  templateHash: string;
}

interface ArmResourceDefinition {
  type?: unknown;
  apiVersion?: unknown;
  name?: unknown;
  location?: unknown;
  tags?: unknown;
  properties?: unknown;
  sku?: unknown;
  kind?: unknown;
  identity?: unknown;
  dependsOn?: unknown;
  condition?: unknown;
  scope?: unknown;
  copy?: unknown;
}

interface ArmOutputDefinition {
  type?: unknown;
  value?: unknown;
  condition?: unknown;
}

interface EvalContext {
  subscriptionId: string;
  resourceGroupName?: string;
  deploymentName: string;
  location: string;
  parameters: Record<string, unknown>;
  variableDefs: Record<string, unknown>;
  variableCache: Map<string, unknown>;
  resourcesByLogicalId: Map<string, ArmTemplateResource>;
  resourcesById: Map<string, ArmTemplateResource>;
  copyIndexes: Map<string, number>;
}

interface NormalizedResource {
  logicalId: string;
  definition: ArmResourceDefinition;
}

type Token =
  | { type: 'identifier' | 'number' | 'string'; value: string }
  | { type: '(' | ')' | ',' | '.' | '[' | ']' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = String(item);
  }
  return result;
}

function stableGuid(input: string): string {
  const hash = createHash('md5').update(input).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function getCaseInsensitive(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return obj[key];
  const found = Object.keys(obj).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return found ? obj[found] : undefined;
}

function providerPath(type: string, names: string[]): string {
  const [namespace, ...resourceTypes] = type.split('/');
  const parts = ['providers', namespace];
  for (let i = 0; i < resourceTypes.length; i++) {
    parts.push(resourceTypes[i]);
    parts.push(names[i] ?? names[names.length - 1] ?? '');
  }
  return parts.map(encodeURIComponent).join('/');
}

export function buildArmResourceId(
  subscriptionId: string,
  resourceGroupName: string | undefined,
  type: string,
  name: string,
): string {
  if (type.toLowerCase() === 'microsoft.resources/resourcegroups') {
    return `/subscriptions/${subscriptionId}/resourceGroups/${name}`;
  }

  const names = name.split('/').filter(Boolean);
  const base = resourceGroupName
    ? `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`
    : `/subscriptions/${subscriptionId}`;
  return `${base}/${providerPath(type, names)}`;
}

function normalizeResources(template: Record<string, unknown>): NormalizedResource[] {
  const rawResources = template.resources;
  if (Array.isArray(rawResources)) {
    return rawResources
      .filter(isRecord)
      .map((definition, index) => ({
        logicalId: typeof definition.name === 'string' ? definition.name : `resource${index}`,
        definition,
      }));
  }

  if (!isRecord(rawResources)) return [];

  return Object.entries(rawResources)
    .filter((entry): entry is [string, ArmResourceDefinition] => isRecord(entry[1]))
    .map(([logicalId, definition]) => ({ logicalId, definition }));
}

function dependencyNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function orderResources(resources: NormalizedResource[]): NormalizedResource[] {
  const byLogicalId = new Map(resources.map((resource) => [resource.logicalId, resource]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: NormalizedResource[] = [];

  function visit(resource: NormalizedResource): void {
    if (visited.has(resource.logicalId)) return;
    if (visiting.has(resource.logicalId)) throw new Error(`Circular dependency in ARM template at ${resource.logicalId}`);

    visiting.add(resource.logicalId);
    for (const dependency of dependencyNames(resource.definition.dependsOn)) {
      const match = byLogicalId.get(dependency);
      if (match) visit(match);
    }
    visiting.delete(resource.logicalId);
    visited.add(resource.logicalId);
    ordered.push(resource);
  }

  for (const resource of resources) {
    visit(resource);
  }

  return ordered;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (['(', ')', ',', '.', '[', ']'].includes(char)) {
      tokens.push({ type: char as '(' | ')' | ',' | '.' | '[' | ']' });
      i++;
      continue;
    }

    if (char === "'") {
      let value = '';
      i++;
      while (i < expression.length) {
        if (expression[i] === "'" && expression[i + 1] === "'") {
          value += "'";
          i += 2;
          continue;
        }
        if (expression[i] === "'") {
          i++;
          break;
        }
        value += expression[i];
        i++;
      }
      tokens.push({ type: 'string', value });
      continue;
    }

    if (/[0-9-]/.test(char)) {
      let value = char;
      i++;
      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        value += expression[i];
        i++;
      }
      tokens.push({ type: 'number', value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let value = char;
      i++;
      while (i < expression.length && /[A-Za-z0-9_-]/.test(expression[i])) {
        value += expression[i];
        i++;
      }
      tokens.push({ type: 'identifier', value });
      continue;
    }

    throw new Error(`Unsupported ARM expression token '${char}' in ${expression}`);
  }

  return tokens;
}

class ExpressionParser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(expression: string, private readonly context: EvalContext) {
    this.tokens = tokenize(expression);
  }

  parse(): unknown {
    const value = this.parseExpression();
    if (this.peek()) {
      throw new Error(`Unexpected token in ARM expression: ${this.describe(this.peek()!)}`);
    }
    return value;
  }

  private parseExpression(): unknown {
    let value = this.parsePrimary();

    while (true) {
      if (this.match('.')) {
        const property = this.expectIdentifier();
        value = this.getProperty(value, property);
        continue;
      }

      if (this.match('[')) {
        const key = this.parseExpression();
        this.expect(']');
        value = this.getIndex(value, key);
        continue;
      }

      return value;
    }
  }

  private parsePrimary(): unknown {
    const token = this.next();
    if (!token) throw new Error('Unexpected end of ARM expression');

    if (token.type === 'string') return token.value;
    if (token.type === 'number') return Number(token.value);

    if (token.type === 'identifier') {
      if (this.match('(')) {
        const args: unknown[] = [];
        if (!this.match(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.match(','));
          this.expect(')');
        }
        return this.callFunction(token.value, args);
      }

      switch (token.value.toLowerCase()) {
        case 'true': return true;
        case 'false': return false;
        case 'null': return null;
        default: return token.value;
      }
    }

    throw new Error(`Unexpected token in ARM expression: ${this.describe(token)}`);
  }

  private callFunction(name: string, args: unknown[]): unknown {
    const normalized = name.toLowerCase();
    switch (normalized) {
      case 'parameters':
        return this.context.parameters[String(args[0])];
      case 'variables':
        return this.variable(String(args[0]));
      case 'resourcegroup':
        return {
          id: this.context.resourceGroupName
            ? `/subscriptions/${this.context.subscriptionId}/resourceGroups/${this.context.resourceGroupName}`
            : '',
          name: this.context.resourceGroupName ?? '',
          location: this.context.location,
        };
      case 'subscription':
        return {
          id: `/subscriptions/${this.context.subscriptionId}`,
          subscriptionId: this.context.subscriptionId,
        };
      case 'deployment':
        return { name: this.context.deploymentName };
      case 'concat':
        if (args.some(Array.isArray)) {
          return args.flatMap((arg) => Array.isArray(arg) ? arg : [arg]);
        }
        return args.map((arg) => String(arg)).join('');
      case 'createarray':
        return args;
      case 'createobject':
        return this.createObject(args);
      case 'split':
        return String(args[0] ?? '').split(String(args[1] ?? ''));
      case 'format':
        return this.format(String(args[0] ?? ''), args.slice(1));
      case 'replace':
        return String(args[0] ?? '').split(String(args[1] ?? '')).join(String(args[2] ?? ''));
      case 'take':
        return this.take(args[0], Number(args[1] ?? 0));
      case 'tolower':
        return String(args[0] ?? '').toLowerCase();
      case 'toupper':
        return String(args[0] ?? '').toUpperCase();
      case 'string':
        return typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
      case 'tostring':
        return typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
      case 'json':
        return JSON.parse(String(args[0] ?? 'null')) as unknown;
      case 'bool':
      case 'tobool':
        return args[0] === true || String(args[0]).toLowerCase() === 'true';
      case 'int':
        return Number.parseInt(String(args[0] ?? '0'), 10);
      case 'length':
        return this.length(args[0]);
      case 'empty':
        return this.empty(args[0]);
      case 'equals':
        return args[0] === args[1];
      case 'not':
        return !this.truthy(args[0]);
      case 'and':
        return args.every((arg) => this.truthy(arg));
      case 'or':
        return args.some((arg) => this.truthy(arg));
      case 'if':
        return this.truthy(args[0]) ? args[1] : args[2];
      case 'uniquestring':
        return createHash('sha256').update(args.map(String).join('|')).digest('hex').slice(0, 13);
      case 'guid':
        return stableGuid(args.map(String).join('|'));
      case 'copyindex':
        return this.copyIndex(typeof args[0] === 'string' ? args[0] : undefined);
      case 'environment':
        return {
          suffixes: {
            storage: 'core.windows.net',
            keyvaultDns: 'vault.azure.net',
          },
          authentication: {
            loginEndpoint: 'https://localhost:4445/azure/login.microsoftonline.com/',
          },
        };
      case 'resourceid':
        return this.resourceId(args);
      case 'subscriptionresourceid':
        return this.subscriptionResourceId(args);
      case 'extensionresourceid':
        return this.extensionResourceId(args);
      case 'listkeys':
        return {
          keys: [
            {
              keyName: 'key1',
              permissions: 'FULL',
              value: Buffer.from('mockcloud').toString('base64'),
            },
          ],
          functionKeys: {
            apim: 'mockcloud',
            default: 'mockcloud',
          },
        };
      case 'reference':
        return this.reference(String(args[0] ?? ''));
      default:
        throw new Error(`Unsupported ARM template function: ${name}`);
    }
  }

  private variable(name: string): unknown {
    if (this.context.variableCache.has(name)) {
      return this.context.variableCache.get(name);
    }
    if (!(name in this.context.variableDefs)) {
      throw new Error(`Unknown ARM template variable: ${name}`);
    }
    const value = resolveTemplateValue(this.context.variableDefs[name], this.context);
    this.context.variableCache.set(name, value);
    return value;
  }

  private resourceId(args: unknown[]): string {
    const strings = args.map(String);
    const typeIndex = strings.findIndex((arg) => arg.includes('/'));
    if (typeIndex === -1) throw new Error('resourceId requires a resource type');

    const type = strings[typeIndex];
    const names = strings.slice(typeIndex + 1).join('/');
    if (typeIndex >= 2) {
      return buildArmResourceId(strings[0], strings[1], type, names);
    }
    if (typeIndex === 1) {
      return buildArmResourceId(this.context.subscriptionId, strings[0], type, names);
    }
    return buildArmResourceId(this.context.subscriptionId, this.context.resourceGroupName, type, names);
  }

  private subscriptionResourceId(args: unknown[]): string {
    const strings = args.map(String);
    return buildArmResourceId(this.context.subscriptionId, undefined, strings[0], strings.slice(1).join('/'));
  }

  private extensionResourceId(args: unknown[]): string {
    const scope = String(args[0] ?? '').replace(/\/$/, '');
    const type = String(args[1] ?? '');
    const names = args.slice(2).map(String);
    return `${scope}/${providerPath(type, names)}`;
  }

  private reference(resourceId: string): unknown {
    const resource = this.context.resourcesById.get(resourceId.toLowerCase());
    if (!resource) return {};
    const type = resource.type.toLowerCase();
    const base = {
      ...(resource.properties ?? {}),
      id: resource.id,
      name: resource.name,
      type: resource.type,
      location: resource.location,
      tags: resource.tags,
      sku: resource.sku,
      kind: resource.kind,
    };

    if (type === 'microsoft.resources/deployments') {
      return resource.properties ?? {};
    }
    if (type === 'microsoft.insights/components') {
      return {
        ...base,
        InstrumentationKey: stableGuid(`${resource.id}:ikey`),
        ConnectionString: `InstrumentationKey=${stableGuid(`${resource.id}:ikey`)};IngestionEndpoint=https://localhost:4445/azure/monitor.azure.com/`,
      };
    }
    if (type === 'microsoft.keyvault/vaults') {
      return { ...base, vaultUri: `https://${resource.name}.vault.azure.net/` };
    }
    if (type === 'microsoft.appconfiguration/configurationstores') {
      return { ...base, endpoint: `https://${resource.name}.azconfig.io` };
    }
    if (type === 'microsoft.storage/storageaccounts') {
      return {
        ...base,
        primaryEndpoints: {
          blob: `https://${resource.name}.blob.core.windows.net/`,
          web: `https://${resource.name}.web.core.windows.net/`,
        },
      };
    }
    if (type === 'microsoft.documentdb/databaseaccounts') {
      return { ...base, documentEndpoint: `https://${resource.name}.documents.azure.com:443/` };
    }
    if (type === 'microsoft.search/searchservices') {
      return {
        ...base,
        identity: {
          ...(isRecord(resource.identity) ? resource.identity : {}),
          principalId: stableGuid(`${resource.id}:principal`),
        },
      };
    }
    if (type === 'microsoft.web/sites') {
      return {
        ...base,
        defaultHostName: `${resource.name}.azurewebsites.net`,
        identity: {
          ...(isRecord(resource.identity) ? resource.identity : {}),
          principalId: stableGuid(`${resource.id}:principal`),
        },
      };
    }
    if (type === 'microsoft.web/sites/host/functionkeys') {
      return { ...base, name: resource.name.split('/').pop() ?? resource.name };
    }
    if (type === 'microsoft.apimanagement/service') {
      return { ...base, gatewayUrl: `https://${resource.name}.azure-api.net` };
    }
    if (type === 'microsoft.cdn/profiles/afdendpoints') {
      const endpointName = resource.name.split('/').pop() ?? resource.name;
      return { ...base, hostName: `${endpointName}.azurefd.net` };
    }
    if (type === 'microsoft.cognitiveservices/accounts') {
      return { ...base, endpoint: `https://${resource.name}.cognitiveservices.azure.com/` };
    }
    return base;
  }

  private format(template: string, args: unknown[]): string {
    return template
      .replace(/{{/g, '\0OPEN\0')
      .replace(/}}/g, '\0CLOSE\0')
      .replace(/{(\d+)}/g, (_match, index: string) => String(args[Number(index)] ?? ''))
      .replace(/\0OPEN\0/g, '{')
      .replace(/\0CLOSE\0/g, '}');
  }

  private truthy(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return Boolean(value);
  }

  private getProperty(value: unknown, property: string): unknown {
    if (isRecord(value)) {
      return getCaseInsensitive(value, property);
    }
    return undefined;
  }

  private getIndex(value: unknown, key: unknown): unknown {
    if (Array.isArray(value)) return value[Number(key)];
    if (isRecord(value)) return value[String(key)];
    return undefined;
  }

  private match(type: Token['type']): boolean {
    if (this.peek()?.type !== type) return false;
    this.index++;
    return true;
  }

  private expect(type: Token['type']): Token {
    const token = this.next();
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type} in ARM expression, got ${token ? this.describe(token) : 'end of expression'}`);
    }
    return token;
  }

  private expectIdentifier(): string {
    const token = this.expect('identifier');
    if (!('value' in token)) {
      throw new Error('Expected identifier in ARM expression');
    }
    return token.value;
  }

  private next(): Token | undefined {
    return this.tokens[this.index++];
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private describe(token: Token): string {
    return 'value' in token ? `${token.type} ${token.value}` : token.type;
  }

  private createObject(args: unknown[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < args.length; i += 2) {
      result[String(args[i])] = args[i + 1];
    }
    return result;
  }

  private copyIndex(name?: string): number {
    if (name && this.context.copyIndexes.has(name)) {
      return this.context.copyIndexes.get(name)!;
    }
    return this.context.copyIndexes.get('') ?? 0;
  }

  private take(value: unknown, count: number): unknown {
    if (Array.isArray(value)) return value.slice(0, count);
    return String(value ?? '').slice(0, count);
  }

  private length(value: unknown): number {
    if (Array.isArray(value) || typeof value === 'string') return value.length;
    if (isRecord(value)) return Object.keys(value).length;
    return 0;
  }

  private empty(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
    if (isRecord(value)) return Object.keys(value).length === 0;
    return false;
  }
}

function resolveTemplateValue(value: unknown, context: EvalContext): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('[[')) return value.slice(1);
    if (value.startsWith('[') && value.endsWith(']')) {
      return new ExpressionParser(value.slice(1, -1), context).parse();
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, context));
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'copy' && Array.isArray(item)) continue;
      result[key] = resolveTemplateValue(item, context);
    }
    const copyBlocks = Array.isArray(value.copy) ? value.copy : [];
    for (const block of copyBlocks) {
      if (!isRecord(block) || typeof block.name !== 'string') continue;
      const count = Number(resolveTemplateValue(block.count, context) ?? 0);
      const items: unknown[] = [];
      for (let i = 0; i < count; i++) {
        context.copyIndexes.set(block.name, i);
        items.push(resolveTemplateValue(block.input, context));
      }
      context.copyIndexes.delete(block.name);
      result[block.name] = items;
    }
    return result;
  }

  return value;
}

function buildParameterValues(
  template: Record<string, unknown>,
  deploymentParameters: unknown,
  contextSeed: Omit<EvalContext, 'parameters' | 'variableDefs' | 'variableCache' | 'resourcesByLogicalId' | 'resourcesById' | 'copyIndexes'>,
): Record<string, unknown> {
  const definitions = isRecord(template.parameters) ? template.parameters : {};
  const supplied = isRecord(deploymentParameters) ? deploymentParameters : {};
  const parameters: Record<string, unknown> = {};
  const context: EvalContext = {
    ...contextSeed,
    parameters,
    variableDefs: {},
    variableCache: new Map(),
    resourcesByLogicalId: new Map(),
    resourcesById: new Map(),
    copyIndexes: new Map(),
  };

  for (const [name, definition] of Object.entries(definitions)) {
    const suppliedValue = isRecord(supplied[name]) && 'value' in supplied[name]
      ? supplied[name].value
      : undefined;
    if (suppliedValue !== undefined) {
      parameters[name] = suppliedValue;
      continue;
    }
    if (isRecord(definition) && 'defaultValue' in definition) {
      parameters[name] = resolveTemplateValue(definition.defaultValue, context);
    }
  }

  for (const [name, value] of Object.entries(supplied)) {
    if (!(name in parameters)) {
      parameters[name] = isRecord(value) && 'value' in value ? value.value : value;
    }
  }

  return parameters;
}

function resourceGroupFromScope(scope: unknown): string | undefined {
  if (typeof scope !== 'string') return undefined;
  const match = scope.match(/\/resourceGroups\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function templateResourceFromDefinition(
  logicalId: string,
  definition: ArmResourceDefinition,
  context: EvalContext,
): ArmTemplateResource | null {
  const condition = definition.condition === undefined
    ? true
    : new ExpressionParser(String(definition.condition).startsWith('[')
      ? String(definition.condition).slice(1, -1)
      : String(definition.condition), context).parse();
  if (condition === false || String(condition).toLowerCase() === 'false') return null;

  const type = String(resolveTemplateValue(definition.type, context));
  const name = String(resolveTemplateValue(definition.name, context));
  const apiVersion = String(resolveTemplateValue(definition.apiVersion, context));
  const scope = resolveTemplateValue(definition.scope, context);
  const resourceGroupName = resourceGroupFromScope(scope) ?? context.resourceGroupName;
  const location = definition.location === undefined
    ? undefined
    : String(resolveTemplateValue(definition.location, context));
  const typeLower = type.toLowerCase();
  const properties = typeLower === 'microsoft.resources/deployments' && isRecord(definition.properties)
    ? Object.fromEntries(Object.entries(definition.properties).map(([key, item]) => [
        key,
        key === 'template' ? item : resolveTemplateValue(item, context),
      ]))
    : resolveTemplateValue(definition.properties, context);

  const resource: ArmTemplateResource = {
    logicalId,
    id: buildArmResourceId(context.subscriptionId, resourceGroupName, type, name),
    name,
    type,
    apiVersion,
  };

  if (location) resource.location = location;
  const tags = asStringRecord(resolveTemplateValue(definition.tags, context));
  if (tags) resource.tags = tags;
  if (isRecord(properties)) resource.properties = properties;
  if (definition.sku !== undefined) resource.sku = resolveTemplateValue(definition.sku, context);
  if (definition.kind !== undefined) resource.kind = String(resolveTemplateValue(definition.kind, context));
  if (definition.identity !== undefined) resource.identity = resolveTemplateValue(definition.identity, context);
  if (typeLower === 'microsoft.resources/deployments' && isRecord(resource.properties?.template)) {
    const nested = provisionArmTemplate({
      template: resource.properties.template,
      deploymentName: name,
      parameters: resource.properties.parameters,
      subscriptionId: context.subscriptionId,
      resourceGroupName,
      location,
    });
    resource.properties = {
      provisioningState: 'Succeeded',
      mode: typeof resource.properties.mode === 'string' ? resource.properties.mode : 'Incremental',
      timestamp: new Date().toISOString(),
      duration: 'PT0S',
      templateHash: nested.templateHash,
      parameters: nested.parameters,
      outputs: nested.outputs,
      outputResources: nested.resources.map((nestedResource) => ({ id: nestedResource.id })),
    };
    resource.nestedResources = nested.resources;
  }
  return resource;
}

function inferOutputType(value: unknown): string {
  if (typeof value === 'boolean') return 'Bool';
  if (typeof value === 'number') return 'Int';
  if (Array.isArray(value)) return 'Array';
  if (isRecord(value)) return 'Object';
  return 'String';
}

export function provisionArmTemplate(input: {
  template: Record<string, unknown>;
  deploymentName: string;
  parameters?: unknown;
  subscriptionId?: string;
  resourceGroupName?: string;
  location?: string;
}): ArmTemplateProvisionResult {
  const subscriptionId = input.subscriptionId ?? SUBSCRIPTION_ID;
  const location = input.location ?? LOCATION;
  const seed = {
    subscriptionId,
    resourceGroupName: input.resourceGroupName,
    deploymentName: input.deploymentName,
    location,
  };
  const parameters = buildParameterValues(input.template, input.parameters, seed);
  const context: EvalContext = {
    ...seed,
    parameters,
    variableDefs: isRecord(input.template.variables) ? input.template.variables : {},
    variableCache: new Map(),
    resourcesByLogicalId: new Map(),
    resourcesById: new Map(),
    copyIndexes: new Map(),
  };

  const resources: ArmTemplateResource[] = [];
  for (const item of orderResources(normalizeResources(input.template))) {
    const copy = isRecord(item.definition.copy) ? item.definition.copy : undefined;
    const count = copy ? Number(resolveTemplateValue(copy.count, context) ?? 0) : 1;
    const copyName = typeof copy?.name === 'string' ? copy.name : '';
    const definition = copy ? { ...item.definition, copy: undefined } : item.definition;
    for (let i = 0; i < count; i++) {
      context.copyIndexes.set('', i);
      if (copyName) context.copyIndexes.set(copyName, i);
      const logicalId = copy ? `${item.logicalId}[${i}]` : item.logicalId;
      const resource = templateResourceFromDefinition(logicalId, definition, context);
      context.copyIndexes.delete('');
      if (copyName) context.copyIndexes.delete(copyName);
      if (!resource) continue;
      context.resourcesByLogicalId.set(logicalId, resource);
      if (!copy) context.resourcesByLogicalId.set(item.logicalId, resource);
      context.resourcesById.set(resource.id.toLowerCase(), resource);
      resources.push(resource);
      for (const nestedResource of resource.nestedResources ?? []) {
        context.resourcesById.set(nestedResource.id.toLowerCase(), nestedResource);
        resources.push(nestedResource);
      }
    }
  }

  const outputs: Record<string, { type: string; value: unknown }> = {};
  const rawOutputs = isRecord(input.template.outputs) ? input.template.outputs : {};
  for (const [name, rawOutput] of Object.entries(rawOutputs)) {
    if (!isRecord(rawOutput)) continue;
    const output = rawOutput as ArmOutputDefinition;
    if (output.condition !== undefined) {
      const condition = resolveTemplateValue(output.condition, context);
      if (condition === false || String(condition).toLowerCase() === 'false') continue;
    }
    const value = resolveTemplateValue(output.value, context);
    outputs[name] = {
      type: output.type ? String(output.type) : inferOutputType(value),
      value,
    };
  }

  const templateHash = createHash('sha256')
    .update(JSON.stringify(input.template))
    .digest('hex');

  return {
    parameters: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { value }])),
    resources,
    outputs,
    templateHash,
  };
}
