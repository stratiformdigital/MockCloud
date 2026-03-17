import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListTablesCommand,
  DescribeTableCommand,
  CreateTableCommand,
  DeleteTableCommand,
  TableDescription,
} from '@aws-sdk/client-dynamodb';
import { ChalkTable, ChalkHeader, ChalkSpaceBetween, ChalkTextFilter, ChalkLink, ChalkSpinner, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkSelect, ChalkBox } from '../../chalk';
import { dynamodb } from '../../api/clients';

const KEY_TYPE_OPTIONS = [
  { label: 'String (S)', value: 'S' },
  { label: 'Number (N)', value: 'N' },
  { label: 'Binary (B)', value: 'B' },
];

export default function Tables() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createTableName, setCreateTableName] = useState('');
  const [pkName, setPkName] = useState('pk');
  const [pkType, setPkType] = useState(KEY_TYPE_OPTIONS[0]);
  const [skName, setSkName] = useState('');
  const [skType, setSkType] = useState(KEY_TYPE_OPTIONS[0]);
  const [creating, setCreating] = useState(false);

  const [deleteTable, setDeleteTable] = useState<TableDescription | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const listRes = await dynamodb.send(new ListTablesCommand({}));
      const names = listRes.TableNames ?? [];
      const descriptions = await Promise.all(
        names.map((name) =>
          dynamodb
            .send(new DescribeTableCommand({ TableName: name }))
            .then((r) => r.Table!)
        )
      );
      setTables(descriptions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const keySchema: { AttributeName: string; KeyType: 'HASH' | 'RANGE' }[] = [{ AttributeName: pkName, KeyType: 'HASH' }];
      const attributeDefinitions: { AttributeName: string; AttributeType: 'S' | 'N' | 'B' }[] = [{ AttributeName: pkName, AttributeType: pkType.value as 'S' | 'N' | 'B' }];
      if (skName) {
        keySchema.push({ AttributeName: skName, KeyType: 'RANGE' });
        attributeDefinitions.push({ AttributeName: skName, AttributeType: skType.value as 'S' | 'N' | 'B' });
      }
      await dynamodb.send(
        new CreateTableCommand({
          TableName: createTableName,
          KeySchema: keySchema,
          AttributeDefinitions: attributeDefinitions,
          BillingMode: 'PAY_PER_REQUEST',
        })
      );
      setShowCreate(false);
      setCreateTableName('');
      setPkName('pk');
      setPkType(KEY_TYPE_OPTIONS[0]);
      setSkName('');
      setSkType(KEY_TYPE_OPTIONS[0]);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTable?.TableName) return;
    setDeleting(true);
    try {
      await dynamodb.send(new DeleteTableCommand({ TableName: deleteTable.TableName }));
      setDeleteTable(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const getKey = (table: TableDescription, type: 'HASH' | 'RANGE') => {
    const ks = table.KeySchema?.find((k) => k.KeyType === type);
    if (!ks) return '-';
    const attr = table.AttributeDefinitions?.find((a) => a.AttributeName === ks.AttributeName);
    return `${ks.AttributeName} (${attr?.AttributeType ?? '?'})`;
  };

  const filtered = tables.filter(
    (t) => !filterText || t.TableName?.toLowerCase().includes(filterText.toLowerCase())
  );

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${filtered.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create table
              </ChalkButton>
            }
          >
            Tables
          </ChalkHeader>
        }
        items={filtered}
        filter={
          <ChalkTextFilter
            filteringPlaceholder="Find tables"
            filteringText={filterText}
            onChange={({ detail }) => setFilterText(detail.filteringText)}
          />
        }
        columnDefinitions={[
          {
            id: 'name',
            header: 'Table Name',
            cell: (item) => (
              <ChalkLink
                onFollow={() => navigate(`/dynamodb/tables/${item.TableName}`)}
              >
                {item.TableName}
              </ChalkLink>
            ),
            sortingField: 'TableName',
          },
          { id: 'status', header: 'Status', cell: (item) => item.TableStatus ?? '-' },
          { id: 'pk', header: 'Partition Key', cell: (item) => getKey(item, 'HASH') },
          { id: 'sk', header: 'Sort Key', cell: (item) => getKey(item, 'RANGE') },
          { id: 'itemCount', header: 'Item Count', cell: (item) => item.ItemCount ?? 0 },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteTable(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={
          <ChalkSpaceBetween size="m" direction="vertical" alignItems="center">
            <b>No tables</b>
          </ChalkSpaceBetween>
        }
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create table"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} disabled={creating || !createTableName || !pkName}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Table name">
            <ChalkInput value={createTableName} onChange={({ detail }) => setCreateTableName(detail.value)} placeholder="my-table" />
          </ChalkFormField>
          <ChalkFormField label="Partition key name">
            <ChalkInput value={pkName} onChange={({ detail }) => setPkName(detail.value)} placeholder="pk" />
          </ChalkFormField>
          <ChalkFormField label="Partition key type">
            <ChalkSelect
              selectedOption={pkType}
              onChange={({ detail }) => setPkType(detail.selectedOption as typeof pkType)}
              options={KEY_TYPE_OPTIONS}
            />
          </ChalkFormField>
          <ChalkFormField label="Sort key name (optional)">
            <ChalkInput value={skName} onChange={({ detail }) => setSkName(detail.value)} placeholder="" />
          </ChalkFormField>
          {skName && (
            <ChalkFormField label="Sort key type">
              <ChalkSelect
                selectedOption={skType}
                onChange={({ detail }) => setSkType(detail.selectedOption as typeof skType)}
                options={KEY_TYPE_OPTIONS}
              />
            </ChalkFormField>
          )}
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteTable !== null}
        onDismiss={() => setDeleteTable(null)}
        header="Delete table"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteTable(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} disabled={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteTable?.TableName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
