import { REGION, ACCOUNT_ID } from '../../config.js';

const NS = 'http://ec2.amazonaws.com/doc/2016-11-15/';
const REQ_ID = '<requestId>00000000-0000-0000-0000-000000000000</requestId>';

interface Tag {
  key: string;
  value: string;
}

interface Vpc {
  vpcId: string;
  state: string;
  cidrBlock: string;
  isDefault: boolean;
  ownerId: string;
  tags: Tag[];
  cidrAssociationId: string;
}

interface Subnet {
  subnetId: string;
  vpcId: string;
  state: string;
  cidrBlock: string;
  availabilityZone: string;
  availabilityZoneId: string;
  mapPublicIpOnLaunch: boolean;
  ownerId: string;
  tags: Tag[];
}

interface Route {
  destinationCidrBlock: string;
  gatewayId?: string;
  natGatewayId?: string;
  state: string;
  origin: string;
}

interface RouteTableAssociation {
  routeTableAssociationId: string;
  routeTableId: string;
  subnetId: string;
  main: boolean;
}

interface RouteTable {
  routeTableId: string;
  vpcId: string;
  associations: RouteTableAssociation[];
  routes: Route[];
  tags: Tag[];
}

const vpcs: Vpc[] = [
  {
    vpcId: 'vpc-mockcloud0001',
    state: 'available',
    cidrBlock: '10.0.0.0/16',
    isDefault: false,
    ownerId: ACCOUNT_ID,
    cidrAssociationId: 'vpc-cidr-assoc-mockcloud0001',
    tags: [{ key: 'Name', value: 'mockcloud-dev' }],
  },
];

const subnets: Subnet[] = [
  {
    subnetId: 'subnet-mockcloud0001',
    vpcId: 'vpc-mockcloud0001',
    state: 'available',
    cidrBlock: '10.0.1.0/24',
    availabilityZone: `${REGION}a`,
    availabilityZoneId: 'use1-az1',
    mapPublicIpOnLaunch: true,
    ownerId: ACCOUNT_ID,
    tags: [
      { key: 'Name', value: 'mockcloud-public-1a' },
      { key: 'aws-cdk:subnet-type', value: 'Public' },
      { key: 'aws-cdk:subnet-name', value: 'Public' },
    ],
  },
  {
    subnetId: 'subnet-mockcloud0002',
    vpcId: 'vpc-mockcloud0001',
    state: 'available',
    cidrBlock: '10.0.2.0/24',
    availabilityZone: `${REGION}b`,
    availabilityZoneId: 'use1-az2',
    mapPublicIpOnLaunch: true,
    ownerId: ACCOUNT_ID,
    tags: [
      { key: 'Name', value: 'mockcloud-public-1b' },
      { key: 'aws-cdk:subnet-type', value: 'Public' },
      { key: 'aws-cdk:subnet-name', value: 'Public' },
    ],
  },
  {
    subnetId: 'subnet-mockcloud0003',
    vpcId: 'vpc-mockcloud0001',
    state: 'available',
    cidrBlock: '10.0.3.0/24',
    availabilityZone: `${REGION}c`,
    availabilityZoneId: 'use1-az3',
    mapPublicIpOnLaunch: true,
    ownerId: ACCOUNT_ID,
    tags: [
      { key: 'Name', value: 'mockcloud-public-1c' },
      { key: 'aws-cdk:subnet-type', value: 'Public' },
      { key: 'aws-cdk:subnet-name', value: 'Public' },
    ],
  },
  {
    subnetId: 'subnet-mockcloud0004',
    vpcId: 'vpc-mockcloud0001',
    state: 'available',
    cidrBlock: '10.0.4.0/24',
    availabilityZone: `${REGION}a`,
    availabilityZoneId: 'use1-az1',
    mapPublicIpOnLaunch: false,
    ownerId: ACCOUNT_ID,
    tags: [
      { key: 'Name', value: 'mockcloud-private-1a' },
      { key: 'aws-cdk:subnet-type', value: 'Private' },
      { key: 'aws-cdk:subnet-name', value: 'Private' },
    ],
  },
  {
    subnetId: 'subnet-mockcloud0005',
    vpcId: 'vpc-mockcloud0001',
    state: 'available',
    cidrBlock: '10.0.5.0/24',
    availabilityZone: `${REGION}b`,
    availabilityZoneId: 'use1-az2',
    mapPublicIpOnLaunch: false,
    ownerId: ACCOUNT_ID,
    tags: [
      { key: 'Name', value: 'mockcloud-private-1b' },
      { key: 'aws-cdk:subnet-type', value: 'Private' },
      { key: 'aws-cdk:subnet-name', value: 'Private' },
    ],
  },
  {
    subnetId: 'subnet-mockcloud0006',
    vpcId: 'vpc-mockcloud0001',
    state: 'available',
    cidrBlock: '10.0.6.0/24',
    availabilityZone: `${REGION}c`,
    availabilityZoneId: 'use1-az3',
    mapPublicIpOnLaunch: false,
    ownerId: ACCOUNT_ID,
    tags: [
      { key: 'Name', value: 'mockcloud-private-1c' },
      { key: 'aws-cdk:subnet-type', value: 'Private' },
      { key: 'aws-cdk:subnet-name', value: 'Private' },
    ],
  },
];

const routeTables: RouteTable[] = [
  {
    routeTableId: 'rtb-mockcloud0001',
    vpcId: 'vpc-mockcloud0001',
    associations: [
      { routeTableAssociationId: 'rtbassoc-mockcloud0001', routeTableId: 'rtb-mockcloud0001', subnetId: 'subnet-mockcloud0001', main: false },
      { routeTableAssociationId: 'rtbassoc-mockcloud0002', routeTableId: 'rtb-mockcloud0001', subnetId: 'subnet-mockcloud0002', main: false },
      { routeTableAssociationId: 'rtbassoc-mockcloud0003', routeTableId: 'rtb-mockcloud0001', subnetId: 'subnet-mockcloud0003', main: false },
    ],
    routes: [
      { destinationCidrBlock: '10.0.0.0/16', gatewayId: 'local', state: 'active', origin: 'CreateRouteTable' },
      { destinationCidrBlock: '0.0.0.0/0', gatewayId: 'igw-mockcloud0001', state: 'active', origin: 'CreateRoute' },
    ],
    tags: [],
  },
  {
    routeTableId: 'rtb-mockcloud0002',
    vpcId: 'vpc-mockcloud0001',
    associations: [
      { routeTableAssociationId: 'rtbassoc-mockcloud0004', routeTableId: 'rtb-mockcloud0002', subnetId: 'subnet-mockcloud0004', main: false },
      { routeTableAssociationId: 'rtbassoc-mockcloud0005', routeTableId: 'rtb-mockcloud0002', subnetId: 'subnet-mockcloud0005', main: false },
      { routeTableAssociationId: 'rtbassoc-mockcloud0006', routeTableId: 'rtb-mockcloud0002', subnetId: 'subnet-mockcloud0006', main: false },
    ],
    routes: [
      { destinationCidrBlock: '10.0.0.0/16', gatewayId: 'local', state: 'active', origin: 'CreateRouteTable' },
      { destinationCidrBlock: '0.0.0.0/0', natGatewayId: 'nat-mockcloud0001', state: 'active', origin: 'CreateRoute' },
    ],
    tags: [],
  },
];

function parseFilters(body: Record<string, unknown>): Map<string, string[]> {
  const filters = new Map<string, string[]>();
  for (let i = 1; ; i++) {
    const name = body[`Filter.${i}.Name`] as string | undefined;
    if (!name) break;
    const values: string[] = [];
    for (let j = 1; ; j++) {
      const val = body[`Filter.${i}.Value.${j}`] as string | undefined;
      if (!val) break;
      values.push(val);
    }
    filters.set(name, values);
  }
  return filters;
}

function matchesTagFilter(tags: Tag[], filterName: string, filterValues: string[]): boolean {
  if (!filterName.startsWith('tag:')) return false;
  const tagKey = filterName.slice(4);
  return tags.some(t => t.key === tagKey && filterValues.includes(t.value));
}

function tagsXml(tags: Tag[]): string {
  if (tags.length === 0) return '<tagSet/>';
  const items = tags.map(t => `<item><key>${t.key}</key><value>${t.value}</value></item>`).join('');
  return `<tagSet>${items}</tagSet>`;
}

function filterVpcs(body: Record<string, unknown>): Vpc[] {
  const filters = parseFilters(body);
  if (filters.size === 0) return vpcs;
  return vpcs.filter(vpc => {
    for (const [name, values] of filters) {
      if (name === 'vpc-id') {
        if (!values.includes(vpc.vpcId)) return false;
      } else if (name.startsWith('tag:')) {
        if (!matchesTagFilter(vpc.tags, name, values)) return false;
      }
    }
    return true;
  });
}

function filterSubnets(body: Record<string, unknown>): Subnet[] {
  const filters = parseFilters(body);
  const subnetIds: string[] = [];
  for (let i = 1; ; i++) {
    const id = body[`SubnetId.${i}`] as string | undefined;
    if (!id) break;
    subnetIds.push(id);
  }
  if (filters.size === 0 && subnetIds.length === 0) return subnets;
  return subnets.filter(s => {
    if (subnetIds.length > 0 && !subnetIds.includes(s.subnetId)) return false;
    for (const [name, values] of filters) {
      if (name === 'vpc-id') {
        if (!values.includes(s.vpcId)) return false;
      } else if (name === 'subnet-id') {
        if (!values.includes(s.subnetId)) return false;
      } else if (name === 'availability-zone') {
        if (!values.includes(s.availabilityZone)) return false;
      } else if (name.startsWith('tag:')) {
        if (!matchesTagFilter(s.tags, name, values)) return false;
      }
    }
    return true;
  });
}

function filterRouteTables(body: Record<string, unknown>): RouteTable[] {
  const filters = parseFilters(body);
  if (filters.size === 0) return routeTables;
  return routeTables.filter(rt => {
    for (const [name, values] of filters) {
      if (name === 'vpc-id') {
        if (!values.includes(rt.vpcId)) return false;
      } else if (name === 'route-table-id') {
        if (!values.includes(rt.routeTableId)) return false;
      }
    }
    return true;
  });
}

function vpcItemXml(vpc: Vpc): string {
  return [
    '<item>',
    `<vpcId>${vpc.vpcId}</vpcId>`,
    `<state>${vpc.state}</state>`,
    `<cidrBlock>${vpc.cidrBlock}</cidrBlock>`,
    '<cidrBlockAssociationSet><item>',
    `<cidrBlock>${vpc.cidrBlock}</cidrBlock>`,
    `<associationId>${vpc.cidrAssociationId}</associationId>`,
    '<cidrBlockState><state>associated</state></cidrBlockState>',
    '</item></cidrBlockAssociationSet>',
    `<isDefault>${vpc.isDefault}</isDefault>`,
    `<ownerId>${vpc.ownerId}</ownerId>`,
    tagsXml(vpc.tags),
    '</item>',
  ].join('');
}

function subnetItemXml(s: Subnet): string {
  return [
    '<item>',
    `<subnetId>${s.subnetId}</subnetId>`,
    `<vpcId>${s.vpcId}</vpcId>`,
    `<state>${s.state}</state>`,
    `<cidrBlock>${s.cidrBlock}</cidrBlock>`,
    `<availabilityZone>${s.availabilityZone}</availabilityZone>`,
    `<availabilityZoneId>${s.availabilityZoneId}</availabilityZoneId>`,
    `<mapPublicIpOnLaunch>${s.mapPublicIpOnLaunch}</mapPublicIpOnLaunch>`,
    `<ownerId>${s.ownerId}</ownerId>`,
    tagsXml(s.tags),
    '</item>',
  ].join('');
}

function routeXml(r: Route): string {
  const gateway = r.natGatewayId
    ? `<natGatewayId>${r.natGatewayId}</natGatewayId>`
    : `<gatewayId>${r.gatewayId}</gatewayId>`;
  return [
    '<item>',
    `<destinationCidrBlock>${r.destinationCidrBlock}</destinationCidrBlock>`,
    gateway,
    `<state>${r.state}</state>`,
    `<origin>${r.origin}</origin>`,
    '</item>',
  ].join('');
}

function associationXml(a: RouteTableAssociation): string {
  return [
    '<item>',
    `<routeTableAssociationId>${a.routeTableAssociationId}</routeTableAssociationId>`,
    `<routeTableId>${a.routeTableId}</routeTableId>`,
    `<subnetId>${a.subnetId}</subnetId>`,
    `<main>${a.main}</main>`,
    '</item>',
  ].join('');
}

function routeTableItemXml(rt: RouteTable): string {
  const assocItems = rt.associations.length > 0
    ? `<associationSet>${rt.associations.map(associationXml).join('')}</associationSet>`
    : '<associationSet/>';
  const routeItems = rt.routes.length > 0
    ? `<routeSet>${rt.routes.map(routeXml).join('')}</routeSet>`
    : '<routeSet/>';
  return [
    '<item>',
    `<routeTableId>${rt.routeTableId}</routeTableId>`,
    `<vpcId>${rt.vpcId}</vpcId>`,
    assocItems,
    routeItems,
    tagsXml(rt.tags),
    '</item>',
  ].join('');
}

export function buildDescribeVpcsXml(body: Record<string, unknown>): string {
  const matched = filterVpcs(body);
  const items = matched.map(vpcItemXml).join('');
  const set = matched.length > 0 ? `<vpcSet>${items}</vpcSet>` : '<vpcSet/>';
  return `<DescribeVpcsResponse xmlns="${NS}">${REQ_ID}${set}</DescribeVpcsResponse>`;
}

export function buildDescribeSubnetsXml(body: Record<string, unknown>): string {
  const matched = filterSubnets(body);
  const items = matched.map(subnetItemXml).join('');
  const set = matched.length > 0 ? `<subnetSet>${items}</subnetSet>` : '<subnetSet/>';
  return `<DescribeSubnetsResponse xmlns="${NS}">${REQ_ID}${set}</DescribeSubnetsResponse>`;
}

export function buildDescribeRouteTablesXml(body: Record<string, unknown>): string {
  const matched = filterRouteTables(body);
  const items = matched.map(routeTableItemXml).join('');
  const set = matched.length > 0 ? `<routeTableSet>${items}</routeTableSet>` : '<routeTableSet/>';
  return `<DescribeRouteTablesResponse xmlns="${NS}">${REQ_ID}${set}</DescribeRouteTablesResponse>`;
}

export function buildDescribeAvailabilityZonesXml(): string {
  const zones = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter, i) =>
    [
      '<item>',
      `<zoneName>${REGION}${letter}</zoneName>`,
      '<zoneState>available</zoneState>',
      `<regionName>${REGION}</regionName>`,
      `<zoneId>use1-az${i + 1}</zoneId>`,
      '<zoneType>availability-zone</zoneType>',
      '<optInStatus>opt-in-not-required</optInStatus>',
      '</item>',
    ].join('')
  ).join('');
  return `<DescribeAvailabilityZonesResponse xmlns="${NS}">${REQ_ID}<availabilityZoneInfo>${zones}</availabilityZoneInfo></DescribeAvailabilityZonesResponse>`;
}

export function buildDescribeVpnGatewaysXml(): string {
  return `<DescribeVpnGatewaysResponse xmlns="${NS}">${REQ_ID}<vpnGatewaySet/></DescribeVpnGatewaysResponse>`;
}
