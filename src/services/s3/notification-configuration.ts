export interface NotificationFilterRule {
  Name: string;
  Value: string;
}

export interface NotificationFilter {
  Key?: {
    FilterRules?: NotificationFilterRule[];
  };
}

interface BaseNotificationConfiguration {
  Id?: string;
  Events?: string[];
  Filter?: NotificationFilter;
}

export interface LambdaFunctionNotificationConfiguration extends BaseNotificationConfiguration {
  LambdaFunctionArn: string;
}

export interface QueueNotificationConfiguration extends BaseNotificationConfiguration {
  QueueArn: string;
}

export interface TopicNotificationConfiguration extends BaseNotificationConfiguration {
  TopicArn: string;
}

export interface NotificationConfiguration {
  LambdaFunctionConfigurations?: LambdaFunctionNotificationConfiguration[];
  QueueConfigurations?: QueueNotificationConfiguration[];
  TopicConfigurations?: TopicNotificationConfiguration[];
  EventBridgeConfiguration?: Record<string, unknown>;
}

export type NotificationConfigurationListKey =
  | 'LambdaFunctionConfigurations'
  | 'QueueConfigurations'
  | 'TopicConfigurations';

export const NOTIFICATION_LIST_KEYS: NotificationConfigurationListKey[] = [
  'LambdaFunctionConfigurations',
  'QueueConfigurations',
  'TopicConfigurations',
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&');
}

function text(block: string, tagNames: string[]): string | undefined {
  for (const tagName of tagNames) {
    const match = block.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`));
    if (match) return decodeXmlText(match[1].trim());
  }
  return undefined;
}

function blocks(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  for (const match of xml.matchAll(regex)) {
    results.push(match[1]);
  }
  return results;
}

function events(block: string): string[] {
  const results: string[] = [];
  for (const match of block.matchAll(/<Event(?:\s[^>]*)?>([\s\S]*?)<\/Event>/g)) {
    results.push(decodeXmlText(match[1].trim()));
  }
  return results;
}

function filter(block: string): NotificationFilter | undefined {
  const rules: NotificationFilterRule[] = [];
  for (const match of block.matchAll(/<FilterRule(?:\s[^>]*)?>\s*<Name(?:\s[^>]*)?>([\s\S]*?)<\/Name>\s*<Value(?:\s[^>]*)?>([\s\S]*?)<\/Value>\s*<\/FilterRule>/g)) {
    rules.push({
      Name: decodeXmlText(match[1].trim()),
      Value: decodeXmlText(match[2].trim()),
    });
  }
  return rules.length > 0 ? { Key: { FilterRules: rules } } : undefined;
}

function renderBase(config: BaseNotificationConfiguration): string {
  const parts: string[] = [];
  if (config.Id) parts.push(`<Id>${escapeXml(config.Id)}</Id>`);
  for (const event of config.Events ?? []) {
    parts.push(`<Event>${escapeXml(event)}</Event>`);
  }
  const rules = config.Filter?.Key?.FilterRules ?? [];
  if (rules.length > 0) {
    parts.push('<Filter><S3Key>');
    for (const rule of rules) {
      parts.push(`<FilterRule><Name>${escapeXml(rule.Name)}</Name><Value>${escapeXml(rule.Value)}</Value></FilterRule>`);
    }
    parts.push('</S3Key></Filter>');
  }
  return parts.join('');
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function filterRuleArray(value: unknown): NotificationFilterRule[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rules: NotificationFilterRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = stringValue(record.Name);
    const ruleValue = stringValue(record.Value);
    if (name !== undefined && ruleValue !== undefined) {
      rules.push({ Name: name, Value: ruleValue });
    }
  }
  return rules.length > 0 ? rules : undefined;
}

function normalizeFilter(value: unknown): NotificationFilter | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const key = (value as Record<string, unknown>).Key;
  if (!key || typeof key !== 'object') return undefined;
  const rules = filterRuleArray((key as Record<string, unknown>).FilterRules);
  return rules ? { Key: { FilterRules: rules } } : undefined;
}

export function normalizeNotificationConfiguration(value: unknown): NotificationConfiguration {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const config: NotificationConfiguration = {};

  const lambdaConfigs = Array.isArray(input.LambdaFunctionConfigurations)
    ? input.LambdaFunctionConfigurations
      .map((item): LambdaFunctionNotificationConfiguration | undefined => {
        if (!item || typeof item !== 'object') return undefined;
        const record = item as Record<string, unknown>;
        const arn = stringValue(record.LambdaFunctionArn);
        if (!arn) return undefined;
        return {
          Id: stringValue(record.Id),
          LambdaFunctionArn: arn,
          Events: stringArray(record.Events),
          Filter: normalizeFilter(record.Filter),
        };
      })
      .filter((item): item is LambdaFunctionNotificationConfiguration => item !== undefined)
    : [];
  if (lambdaConfigs.length > 0) config.LambdaFunctionConfigurations = lambdaConfigs;

  const queueConfigs = Array.isArray(input.QueueConfigurations)
    ? input.QueueConfigurations
      .map((item): QueueNotificationConfiguration | undefined => {
        if (!item || typeof item !== 'object') return undefined;
        const record = item as Record<string, unknown>;
        const arn = stringValue(record.QueueArn);
        if (!arn) return undefined;
        return {
          Id: stringValue(record.Id),
          QueueArn: arn,
          Events: stringArray(record.Events),
          Filter: normalizeFilter(record.Filter),
        };
      })
      .filter((item): item is QueueNotificationConfiguration => item !== undefined)
    : [];
  if (queueConfigs.length > 0) config.QueueConfigurations = queueConfigs;

  const topicConfigs = Array.isArray(input.TopicConfigurations)
    ? input.TopicConfigurations
      .map((item): TopicNotificationConfiguration | undefined => {
        if (!item || typeof item !== 'object') return undefined;
        const record = item as Record<string, unknown>;
        const arn = stringValue(record.TopicArn);
        if (!arn) return undefined;
        return {
          Id: stringValue(record.Id),
          TopicArn: arn,
          Events: stringArray(record.Events),
          Filter: normalizeFilter(record.Filter),
        };
      })
      .filter((item): item is TopicNotificationConfiguration => item !== undefined)
    : [];
  if (topicConfigs.length > 0) config.TopicConfigurations = topicConfigs;

  if (input.EventBridgeConfiguration && typeof input.EventBridgeConfiguration === 'object') {
    config.EventBridgeConfiguration = {};
  }

  return config;
}

export function parseNotificationConfigurationXml(xml: string | undefined): NotificationConfiguration {
  if (!xml) return {};
  const config: NotificationConfiguration = {};

  const lambdaConfigs = [
    ...blocks(xml, 'LambdaFunctionConfiguration'),
    ...blocks(xml, 'CloudFunctionConfiguration'),
  ]
    .map((block): LambdaFunctionNotificationConfiguration | undefined => {
      const arn = text(block, ['CloudFunction', 'LambdaFunctionArn']);
      if (!arn) return undefined;
      return {
        Id: text(block, ['Id']),
        LambdaFunctionArn: arn,
        Events: events(block),
        Filter: filter(block),
      };
    })
    .filter((item): item is LambdaFunctionNotificationConfiguration => item !== undefined);
  if (lambdaConfigs.length > 0) config.LambdaFunctionConfigurations = lambdaConfigs;

  const queueConfigs = blocks(xml, 'QueueConfiguration')
    .map((block): QueueNotificationConfiguration | undefined => {
      const arn = text(block, ['Queue', 'QueueArn']);
      if (!arn) return undefined;
      return {
        Id: text(block, ['Id']),
        QueueArn: arn,
        Events: events(block),
        Filter: filter(block),
      };
    })
    .filter((item): item is QueueNotificationConfiguration => item !== undefined);
  if (queueConfigs.length > 0) config.QueueConfigurations = queueConfigs;

  const topicConfigs = blocks(xml, 'TopicConfiguration')
    .map((block): TopicNotificationConfiguration | undefined => {
      const arn = text(block, ['Topic', 'TopicArn']);
      if (!arn) return undefined;
      return {
        Id: text(block, ['Id']),
        TopicArn: arn,
        Events: events(block),
        Filter: filter(block),
      };
    })
    .filter((item): item is TopicNotificationConfiguration => item !== undefined);
  if (topicConfigs.length > 0) config.TopicConfigurations = topicConfigs;

  if (/<EventBridgeConfiguration(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/EventBridgeConfiguration>)/.test(xml)) {
    config.EventBridgeConfiguration = {};
  }

  return config;
}

export function notificationConfigurationToXml(config: NotificationConfiguration): string {
  const parts: string[] = ['<NotificationConfiguration>'];

  for (const item of config.TopicConfigurations ?? []) {
    parts.push('<TopicConfiguration>');
    parts.push(`<Topic>${escapeXml(item.TopicArn)}</Topic>`);
    parts.push(renderBase(item));
    parts.push('</TopicConfiguration>');
  }

  for (const item of config.QueueConfigurations ?? []) {
    parts.push('<QueueConfiguration>');
    parts.push(`<Queue>${escapeXml(item.QueueArn)}</Queue>`);
    parts.push(renderBase(item));
    parts.push('</QueueConfiguration>');
  }

  for (const item of config.LambdaFunctionConfigurations ?? []) {
    parts.push('<CloudFunctionConfiguration>');
    parts.push(`<CloudFunction>${escapeXml(item.LambdaFunctionArn)}</CloudFunction>`);
    parts.push(renderBase(item));
    parts.push('</CloudFunctionConfiguration>');
  }

  if (config.EventBridgeConfiguration) {
    parts.push('<EventBridgeConfiguration/>');
  }

  parts.push('</NotificationConfiguration>');
  return parts.join('');
}
