// Preload script for Lambda subprocesses.
// CDK custom resource framework hardcodes require("https") to send
// CloudFormation responses via https.request(). When MockCloud runs plain HTTP,
// those calls fail with ECONNREFUSED. This patches https.request/get to
// delegate to http when the target is localhost.
//
// The CDK handler builds request options like {hostname, path, method}
// WITHOUT a port field, so https defaults to 443. We extract the correct
// port from AWS_ENDPOINT_URL.

'use strict';

const http = require('node:http');
const https = require('node:https');
const url = require('node:url');

const endpointUrl = process.env.AWS_ENDPOINT_URL;
const endpointPort = endpointUrl ? url.parse(endpointUrl).port : undefined;

function isLocalhost(options) {
  const hostname = typeof options === 'string'
    ? url.parse(options).hostname
    : (options && (options.hostname || options.host));
  return hostname === 'localhost';
}

const originalRequest = https.request;
const originalGet = https.get;

function toHttpOptions(options) {
  if (typeof options === 'string') {
    const parsed = url.parse(options);
    parsed.protocol = 'http:';
    if (!parsed.port && endpointPort) parsed.port = endpointPort;
    return parsed;
  }
  const port = options.port || endpointPort || 80;
  return { ...options, port, protocol: 'http:' };
}

https.request = function patchedRequest(...args) {
  if (isLocalhost(args[0])) {
    return http.request(toHttpOptions(args[0]), ...args.slice(1));
  }
  return originalRequest.apply(this, args);
};

https.get = function patchedGet(...args) {
  if (isLocalhost(args[0])) {
    return http.get(toHttpOptions(args[0]), ...args.slice(1));
  }
  return originalGet.apply(this, args);
};
