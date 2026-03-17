import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DescribeTableCommand,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  TableDescription,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { ChalkHeader, ChalkSpaceBetween, ChalkContainer, ChalkTabs, ChalkBreadcrumbs, ChalkTable, ChalkButton, ChalkModal, ChalkFormField, ChalkTextarea, ChalkKeyValuePairs, ChalkSpinner, ChalkBox } from '../../chalk';
import { dynamodb } from '../../api/clients';

function unmarshallValue(attr: AttributeValue): unknown {
  if (attr.S !== undefined) return attr.S;
  if (attr.N !== undefined) return Number(attr.N);
  if (attr.BOOL !== undefined) return attr.BOOL;
  if (attr.NULL) return null;
  if (attr.L) return attr.L.map(unmarshallValue);
  if (attr.M) return unmarshallRecord(attr.M);
  if (attr.SS) return attr.SS;
  if (attr.NS) return attr.NS.map(Number);
  if (attr.BS) return attr.BS;
  return JSON.stringify(attr);
}

function unmarshallRecord(
  item: Record<string, AttributeValue>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(item)) {
    result[key] = unmarshallValue(val);
  }
  return result;
}

function marshallValue(val: unknown): AttributeValue {
  if (val === null || val === undefined) return { NULL: true };
  if (typeof val === 'string') return { S: val };
  if (typeof val === 'number') return { N: String(val) };
  if (typeof val === 'boolean') return { BOOL: val };
  if (Array.isArray(val)) return { L: val.map(marshallValue) };
  if (typeof val === 'object')
    return {
      M: Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, marshallValue(v)])
      ),
    };
  return { S: String(val) };
}

function marshallRecord(
  obj: Record<string, unknown>
): Record<string, AttributeValue> {
  const result: Record<string, AttributeValue> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = marshallValue(val);
  }
  return result;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export default function TableDetail() {
  const { tableName } = useParams<{ tableName: string }>();
  const navigate = useNavigate();
  const [tableInfo, setTableInfo] = useState<TableDescription | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [rawItems, setRawItems] = useState<Record<string, AttributeValue>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createJson, setCreateJson] = useState('');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editJson, setEditJson] = useState('');
  const [showDeleteTable, setShowDeleteTable] = useState(false);
  const [deletingTable, setDeletingTable] = useState(false);

  const loadTable = async () => {
    try {
      const res = await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
      setTableInfo(res.Table ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const scanTable = async () => {
    setScanning(true);
    try {
      const res = await dynamodb.send(new ScanCommand({ TableName: tableName }));
      const raw = res.Items ?? [];
      setRawItems(raw);
      setItems(raw.map(unmarshallRecord));
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    loadTable();
    scanTable();
  }, [tableName]);

  const keyAttributes = (tableInfo?.KeySchema ?? []).map((k) => k.AttributeName!);

  const deleteItem = async (index: number) => {
    try {
      const raw = rawItems[index];
      const key: Record<string, AttributeValue> = {};
      for (const attr of keyAttributes) {
        if (raw[attr]) key[attr] = raw[attr];
      }
      await dynamodb.send(new DeleteItemCommand({ TableName: tableName, Key: key }));
      await scanTable();
    } catch (err) {
      setError(String(err));
    }
  };

  const createItem = async () => {
    try {
      const parsed = JSON.parse(createJson);
      await dynamodb.send(
        new PutItemCommand({ TableName: tableName, Item: marshallRecord(parsed) })
      );
      setShowCreate(false);
      setCreateJson('');
      await scanTable();
    } catch (err) {
      setError(String(err));
    }
  };

  const openEdit = (index: number) => {
    setEditJson(JSON.stringify(items[index], null, 2));
    setEditIndex(index);
  };

  const saveEdit = async () => {
    try {
      const parsed = JSON.parse(editJson);
      await dynamodb.send(
        new PutItemCommand({ TableName: tableName, Item: marshallRecord(parsed) })
      );
      setEditIndex(null);
      await scanTable();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDeleteTable = async () => {
    setDeletingTable(true);
    try {
      await dynamodb.send(new DeleteTableCommand({ TableName: tableName }));
      navigate('/dynamodb');
    } finally {
      setDeletingTable(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;
  if (!tableInfo) return <ChalkHeader variant="h1">Table not found</ChalkHeader>;

  const getKey = (type: 'HASH' | 'RANGE') => {
    const ks = tableInfo.KeySchema?.find((k) => k.KeyType === type);
    if (!ks) return '-';
    const attr = tableInfo.AttributeDefinitions?.find(
      (a) => a.AttributeName === ks.AttributeName
    );
    return `${ks.AttributeName} (${attr?.AttributeType ?? '?'})`;
  };

  const allColumns = Array.from(new Set(items.flatMap(Object.keys)));

  return (
    <ChalkSpaceBetween size="l">
      <ChalkBreadcrumbs
        items={[
          { text: 'MockCloud', href: '/' },
          { text: 'DynamoDB', href: '/dynamodb' },
          { text: 'Tables', href: '/dynamodb' },
          { text: tableName!, href: '' },
        ]}
        onNavigate={(href) => {
          if (href) navigate(href);
        }}
      />
      <ChalkHeader
        variant="h1"
        actions={
          <ChalkButton onClick={() => setShowDeleteTable(true)}>
            Delete table
          </ChalkButton>
        }
      >
        {tableName}
      </ChalkHeader>
      <ChalkTabs
        tabs={[
          {
            label: 'Overview',
            id: 'overview',
            content: (
              <ChalkContainer header={<ChalkHeader variant="h2">Table details</ChalkHeader>}>
                <ChalkKeyValuePairs
                  columns={2}
                  items={[
                    { label: 'Table Name', value: tableInfo.TableName ?? '-' },
                    { label: 'Status', value: tableInfo.TableStatus ?? '-' },
                    { label: 'ARN', value: tableInfo.TableArn ?? '-' },
                    { label: 'Partition Key', value: getKey('HASH') },
                    { label: 'Sort Key', value: getKey('RANGE') },
                    { label: 'Item Count', value: String(tableInfo.ItemCount ?? 0) },
                  ]}
                />
              </ChalkContainer>
            ),
          },
          {
            label: 'Items',
            id: 'items',
            content: scanning ? (
              <ChalkSpinner size="large" />
            ) : (
              <>
                <ChalkTable
                  header={
                    <ChalkHeader
                      counter={`(${items.length})`}
                      actions={
                        <ChalkButton variant="primary" onClick={() => {
                          setCreateJson('{}');
                          setShowCreate(true);
                        }}>
                          Create item
                        </ChalkButton>
                      }
                    >
                      Items
                    </ChalkHeader>
                  }
                  items={items}
                  columnDefinitions={[
                    ...allColumns.map((col) => ({
                      id: col,
                      header: col,
                      cell: (item: Record<string, unknown>) => formatValue(item[col]),
                    })),
                    {
                      id: 'actions',
                      header: 'Actions',
                      cell: (_item: Record<string, unknown>) => {
                        const idx = items.indexOf(_item);
                        return (
                          <ChalkSpaceBetween direction="horizontal" size="xs">
                            <ChalkButton variant="inline-link" onClick={() => openEdit(idx)}>
                              Edit
                            </ChalkButton>
                            <ChalkButton variant="inline-link" onClick={() => deleteItem(idx)}>
                              Delete
                            </ChalkButton>
                          </ChalkSpaceBetween>
                        );
                      },
                    },
                  ]}
                  empty={
                    <ChalkBox textAlign="center">
                      <b>No items</b>
                    </ChalkBox>
                  }
                />
                <ChalkModal
                  visible={showCreate}
                  onDismiss={() => setShowCreate(false)}
                  header="Create item"
                  footer={
                    <ChalkBox float="right">
                      <ChalkSpaceBetween direction="horizontal" size="xs">
                        <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                          Cancel
                        </ChalkButton>
                        <ChalkButton variant="primary" onClick={createItem}>
                          Create
                        </ChalkButton>
                      </ChalkSpaceBetween>
                    </ChalkBox>
                  }
                >
                  <ChalkFormField label="Item JSON">
                    <ChalkTextarea
                      value={createJson}
                      onChange={({ detail }) => setCreateJson(detail.value)}
                      rows={10}
                    />
                  </ChalkFormField>
                </ChalkModal>
                <ChalkModal
                  visible={editIndex !== null}
                  onDismiss={() => setEditIndex(null)}
                  header="Edit item"
                  footer={
                    <ChalkBox float="right">
                      <ChalkSpaceBetween direction="horizontal" size="xs">
                        <ChalkButton variant="link" onClick={() => setEditIndex(null)}>
                          Cancel
                        </ChalkButton>
                        <ChalkButton variant="primary" onClick={saveEdit}>
                          Save
                        </ChalkButton>
                      </ChalkSpaceBetween>
                    </ChalkBox>
                  }
                >
                  <ChalkFormField label="Item JSON">
                    <ChalkTextarea
                      value={editJson}
                      onChange={({ detail }) => setEditJson(detail.value)}
                      rows={10}
                    />
                  </ChalkFormField>
                </ChalkModal>
              </>
            ),
          },
        ]}
      />

      <ChalkModal
        visible={showDeleteTable}
        onDismiss={() => setShowDeleteTable(false)}
        header="Delete table"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDeleteTable(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteTable} disabled={deletingTable}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{tableName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
