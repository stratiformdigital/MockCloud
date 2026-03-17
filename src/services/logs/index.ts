import { defineMockService } from '../service.js';
import type { ApiResponse, ParsedApiRequest } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { jsonAmz11 as json, errorAmz11 as error, ServiceError } from '../response.js';
import { REGION, ACCOUNT_ID } from '../../config.js';
import type { LogGroup as SdkLogGroup, OutputLogEvent, LogStream as SdkLogStream } from '@aws-sdk/client-cloudwatch-logs';

export interface LogGroup extends SdkLogGroup {
  tags: Record<string, string>;
  streams: Map<string, SdkLogStream>;
  events: Map<string, OutputLogEvent[]>;
}

export interface ResourcePolicy {
  policyName: string;
  policyDocument: string;
  lastUpdatedTime: number;
}

export const logGroups = new PersistentMap<string, LogGroup>('logs-log-groups');
export const resourcePolicies = new PersistentMap<string, ResourcePolicy>('logs-resource-policies');

export function groupArn(name: string): string {
  return `arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${name}:*`;
}

export function createLogGroup(logGroupName: string, tags?: Record<string, string>, retentionInDays?: number): LogGroup {
  if (logGroups.has(logGroupName)) {
    throw new ServiceError('ResourceAlreadyExistsException', `Log group ${logGroupName} already exists.`);
  }
  const group: LogGroup = {
    logGroupName,
    arn: groupArn(logGroupName),
    creationTime: Date.now(),
    retentionInDays,
    storedBytes: 0,
    tags: tags ?? {},
    streams: new Map(),
    events: new Map(),
  };
  logGroups.set(logGroupName, group);
  return group;
}

export function deleteLogGroup(logGroupName: string): void {
  if (!logGroups.has(logGroupName)) {
    throw new ServiceError('ResourceNotFoundException', `Log group ${logGroupName} does not exist.`, 404);
  }
  logGroups.delete(logGroupName);
}

function streamArn(groupName: string, streamName: string): string {
  return `arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${groupName}:log-stream:${streamName}`;
}

function findGroupByArn(arn: string): LogGroup | undefined {
  for (const g of logGroups.values()) {
    if (g.arn === arn) return g;
  }
  return undefined;
}

function groupOutput(g: LogGroup): Record<string, unknown> {
  const out: Record<string, unknown> = {
    logGroupName: g.logGroupName,
    arn: g.arn,
    creationTime: g.creationTime,
    storedBytes: g.storedBytes,
    metricFilterCount: 0,
  };
  if (g.retentionInDays !== undefined) out.retentionInDays = g.retentionInDays;
  return out;
}

function streamOutput(s: SdkLogStream): Record<string, unknown> {
  const out: Record<string, unknown> = {
    logStreamName: s.logStreamName,
    arn: s.arn,
    creationTime: s.creationTime,
    storedBytes: s.storedBytes,
  };
  if (s.firstEventTimestamp !== undefined) out.firstEventTimestamp = s.firstEventTimestamp;
  if (s.lastEventTimestamp !== undefined) out.lastEventTimestamp = s.lastEventTimestamp;
  if (s.lastIngestionTime !== undefined) out.lastIngestionTime = s.lastIngestionTime;
  return out;
}

function CreateLogGroup(req: ParsedApiRequest): ApiResponse {
  const { logGroupName, tags } = req.body as { logGroupName?: string; tags?: Record<string, string> };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  try {
    createLogGroup(logGroupName, tags);
    return json({});
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function DescribeLogGroups(req: ParsedApiRequest): ApiResponse {
  const { logGroupNamePrefix, limit, nextToken } = req.body as {
    logGroupNamePrefix?: string;
    limit?: number;
    nextToken?: string;
  };
  const max = limit ?? 50;
  let all = Array.from(logGroups.values());
  if (logGroupNamePrefix) {
    all = all.filter((g) => g.logGroupName!.startsWith(logGroupNamePrefix));
  }
  const start = nextToken ? parseInt(nextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const next = start + max < all.length ? String(start + max) : undefined;
  return json({
    logGroups: page.map(groupOutput),
    ...(next ? { nextToken: next } : {}),
  });
}

function DeleteLogGroup(req: ParsedApiRequest): ApiResponse {
  const { logGroupName } = req.body as { logGroupName?: string };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  try {
    deleteLogGroup(logGroupName);
    return json({});
  } catch (e) {
    if (e instanceof ServiceError) return error(e.code, e.message, e.statusCode);
    throw e;
  }
}

function CreateLogStream(req: ParsedApiRequest): ApiResponse {
  const { logGroupName, logStreamName } = req.body as { logGroupName?: string; logStreamName?: string };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  if (!logStreamName) return error('InvalidParameterException', 'logStreamName is required');
  const group = logGroups.get(logGroupName);
  if (!group) return error('ResourceNotFoundException', `Log group ${logGroupName} does not exist.`, 404);
  if (group.streams.has(logStreamName)) {
    return error('ResourceAlreadyExistsException', `Log stream ${logStreamName} already exists.`);
  }
  const stream: SdkLogStream = {
    logStreamName,
    arn: streamArn(logGroupName, logStreamName),
    creationTime: Date.now(),
    storedBytes: 0,
  };
  group.streams.set(logStreamName, stream);
  group.events.set(logStreamName, []);
  logGroups.set(logGroupName, group);
  return json({});
}

function DescribeLogStreams(req: ParsedApiRequest): ApiResponse {
  const { logGroupName, logStreamNamePrefix, limit, nextToken } = req.body as {
    logGroupName?: string;
    logStreamNamePrefix?: string;
    limit?: number;
    nextToken?: string;
  };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  const group = logGroups.get(logGroupName);
  if (!group) return error('ResourceNotFoundException', `Log group ${logGroupName} does not exist.`, 404);

  let all = Array.from(group.streams.values());
  if (logStreamNamePrefix) {
    all = all.filter((s) => s.logStreamName!.startsWith(logStreamNamePrefix));
  }
  const max = limit ?? 50;
  const start = nextToken ? parseInt(nextToken, 10) : 0;
  const page = all.slice(start, start + max);
  const next = start + max < all.length ? String(start + max) : undefined;
  return json({
    logStreams: page.map(streamOutput),
    ...(next ? { nextToken: next } : {}),
  });
}

function PutLogEvents(req: ParsedApiRequest): ApiResponse {
  const { logGroupName, logStreamName, logEvents } = req.body as {
    logGroupName?: string;
    logStreamName?: string;
    logEvents?: Array<{ timestamp: number; message: string }>;
  };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  if (!logStreamName) return error('InvalidParameterException', 'logStreamName is required');
  const group = logGroups.get(logGroupName);
  if (!group) return error('ResourceNotFoundException', `Log group ${logGroupName} does not exist.`, 404);
  const stream = group.streams.get(logStreamName);
  if (!stream) return error('ResourceNotFoundException', `Log stream ${logStreamName} does not exist.`, 404);

  const now = Date.now();
  const events = group.events.get(logStreamName)!;
  let bytesAdded = 0;

  for (const e of logEvents ?? []) {
    const evt: OutputLogEvent = { timestamp: e.timestamp, message: e.message, ingestionTime: now };
    events.push(evt);
    bytesAdded += e.message.length + 26;
    if (stream.firstEventTimestamp === undefined || e.timestamp < stream.firstEventTimestamp!) {
      stream.firstEventTimestamp = e.timestamp;
    }
    if (stream.lastEventTimestamp === undefined || e.timestamp > stream.lastEventTimestamp!) {
      stream.lastEventTimestamp = e.timestamp;
    }
  }

  stream.lastIngestionTime = now;
  stream.storedBytes = (stream.storedBytes ?? 0) + bytesAdded;
  group.storedBytes = (group.storedBytes ?? 0) + bytesAdded;
  logGroups.set(logGroupName, group);

  return json({ nextSequenceToken: '0' });
}

function GetLogEvents(req: ParsedApiRequest): ApiResponse {
  const { logGroupName, logStreamName, startTime, endTime, limit, startFromHead } = req.body as {
    logGroupName?: string;
    logStreamName?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    startFromHead?: boolean;
  };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  if (!logStreamName) return error('InvalidParameterException', 'logStreamName is required');
  const group = logGroups.get(logGroupName);
  if (!group) return error('ResourceNotFoundException', `Log group ${logGroupName} does not exist.`, 404);
  if (!group.streams.has(logStreamName)) {
    return error('ResourceNotFoundException', `Log stream ${logStreamName} does not exist.`, 404);
  }

  let events = group.events.get(logStreamName) ?? [];
  if (startTime !== undefined) events = events.filter((e) => e.timestamp! >= startTime);
  if (endTime !== undefined) events = events.filter((e) => e.timestamp! <= endTime);

  const max = limit ?? 10000;
  if (startFromHead) {
    events = events.slice(0, max);
  } else {
    events = events.slice(-max);
  }

  return json({
    events: events.map((e) => ({
      timestamp: e.timestamp,
      message: e.message,
      ingestionTime: e.ingestionTime,
    })),
    nextForwardToken: 'f/0',
    nextBackwardToken: 'b/0',
  });
}

function PutRetentionPolicy(req: ParsedApiRequest): ApiResponse {
  const { logGroupName, retentionInDays } = req.body as { logGroupName?: string; retentionInDays?: number };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  const group = logGroups.get(logGroupName);
  if (!group) return error('ResourceNotFoundException', `Log group ${logGroupName} does not exist.`, 404);
  group.retentionInDays = retentionInDays;
  logGroups.set(logGroupName, group);
  return json({});
}

function TagLogGroup(req: ParsedApiRequest): ApiResponse {
  const { logGroupName, tags } = req.body as { logGroupName?: string; tags?: Record<string, string> };
  if (!logGroupName) return error('InvalidParameterException', 'logGroupName is required');
  const group = logGroups.get(logGroupName);
  if (!group) return error('ResourceNotFoundException', `Log group ${logGroupName} does not exist.`, 404);
  if (tags) {
    Object.assign(group.tags, tags);
    logGroups.set(logGroupName, group);
  }
  return json({});
}

function TagResource(req: ParsedApiRequest): ApiResponse {
  const { resourceArn, tags } = req.body as { resourceArn?: string; tags?: Record<string, string> };
  if (!resourceArn) return error('InvalidParameterException', 'resourceArn is required');
  const group = findGroupByArn(resourceArn);
  if (!group) return error('ResourceNotFoundException', `Resource ${resourceArn} not found.`, 404);
  if (tags) {
    Object.assign(group.tags, tags);
    logGroups.set(group.logGroupName!, group);
  }
  return json({});
}

function StartQuery(_req: ParsedApiRequest): ApiResponse {
  return json({ queryId: 'mockcloud-query-1' });
}

function StopQuery(_req: ParsedApiRequest): ApiResponse {
  return json({ success: true });
}

function GetQueryResults(_req: ParsedApiRequest): ApiResponse {
  return json({
    results: [],
    statistics: { recordsMatched: 0, recordsScanned: 0, bytesScanned: 0 },
    status: 'Complete',
  });
}

function DescribeQueryDefinitions(_req: ParsedApiRequest): ApiResponse {
  return json({ queryDefinitions: [] });
}

function PutResourcePolicy(req: ParsedApiRequest): ApiResponse {
  const { policyName, policyDocument } = req.body as { policyName?: string; policyDocument?: string };
  if (!policyName) return error('InvalidParameterException', 'policyName is required');
  const policy: ResourcePolicy = {
    policyName,
    policyDocument: policyDocument ?? '',
    lastUpdatedTime: Date.now(),
  };
  resourcePolicies.set(policyName, policy);
  return json({ resourcePolicy: policy });
}

function DeleteResourcePolicy(req: ParsedApiRequest): ApiResponse {
  const { policyName } = req.body as { policyName?: string };
  if (!policyName) return error('InvalidParameterException', 'policyName is required');
  resourcePolicies.delete(policyName);
  return json({});
}

function DescribeResourcePolicies(_req: ParsedApiRequest): ApiResponse {
  return json({ resourcePolicies: Array.from(resourcePolicies.values()) });
}

function DescribeMetricFilters(_req: ParsedApiRequest): ApiResponse {
  return json({ metricFilters: [] });
}

function ListTagsForResource(req: ParsedApiRequest): ApiResponse {
  const { resourceArn } = req.body as { resourceArn?: string };
  if (!resourceArn) return error('InvalidParameterException', 'resourceArn is required');
  const group = findGroupByArn(resourceArn);
  if (!group) return error('ResourceNotFoundException', `Resource ${resourceArn} not found.`, 404);
  return json({ tags: group.tags });
}

export const logsService = defineMockService({
  name: 'logs',
  hostPatterns: ['logs.*.amazonaws.com'],
  protocol: 'json',
  targetPrefix: 'Logs_20140328',
  signingName: 'logs',
  handlers: {
    CreateLogGroup,
    DescribeLogGroups,
    DeleteLogGroup,
    CreateLogStream,
    DescribeLogStreams,
    PutLogEvents,
    GetLogEvents,
    PutRetentionPolicy,
    TagLogGroup,
    TagResource,
    ListTagsForResource,
    PutResourcePolicy,
    DeleteResourcePolicy,
    DescribeResourcePolicies,
    DescribeMetricFilters,
    StartQuery,
    StopQuery,
    GetQueryResults,
    DescribeQueryDefinitions,
    _default: () => json({}),
  },
});
