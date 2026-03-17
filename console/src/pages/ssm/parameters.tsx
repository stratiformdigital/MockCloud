import { useState, useEffect, useCallback } from 'react';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkSpinner, ChalkSpaceBetween, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkTextarea, ChalkSelect, ChalkBox, useChalkCollection } from '../../chalk';
import {
  GetParametersByPathCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  Parameter,
} from '@aws-sdk/client-ssm';
import { ssm } from '../../api/clients';

const TYPE_OPTIONS = [
  { label: 'String', value: 'String' },
  { label: 'StringList', value: 'StringList' },
  { label: 'SecureString', value: 'SecureString' },
];

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

export default function Parameters() {
  const [params, setParams] = useState<Parameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createValue, setCreateValue] = useState('');
  const [createType, setCreateType] = useState(TYPE_OPTIONS[0]);
  const [creating, setCreating] = useState(false);

  const [editParam, setEditParam] = useState<Parameter | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteParam, setDeleteParam] = useState<Parameter | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ssm.send(new GetParametersByPathCommand({ Path: '/', Recursive: true, WithDecryption: true }));
      setParams(res.Parameters ?? []);
    } catch (err) {
      setError(String(err));
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
      await ssm.send(
        new PutParameterCommand({
          Name: createName,
          Value: createValue,
          Type: createType.value as 'String' | 'StringList' | 'SecureString',
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateValue('');
      setCreateType(TYPE_OPTIONS[0]);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editParam?.Name) return;
    setSaving(true);
    try {
      await ssm.send(
        new PutParameterCommand({
          Name: editParam.Name,
          Value: editValue,
          Type: editParam.Type as 'String' | 'StringList' | 'SecureString',
          Overwrite: true,
        })
      );
      setEditParam(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteParam?.Name) return;
    setDeleting(true);
    try {
      await ssm.send(new DeleteParameterCommand({ Name: deleteParam.Name }));
      setDeleteParam(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(params, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.Name ?? '').toLowerCase().includes(text.toLowerCase()),
    },
    sorting: {},
  });

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;

  return (
    <ChalkSpaceBetween size="l">
      <ChalkTable
        {...collectionProps}
        header={
          <ChalkHeader
            variant="h1"
            counter={`(${params.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create parameter
              </ChalkButton>
            }
          >
            SSM Parameters
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find parameters" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => (
              <ChalkButton
                variant="inline-link"
                onClick={() => {
                  setEditParam(item);
                  setEditValue(item.Value ?? '');
                }}
              >
                {item.Name ?? '-'}
              </ChalkButton>
            ),
            sortingField: 'Name',
          },
          {
            id: 'type',
            header: 'Type',
            cell: (item) => item.Type ?? '-',
          },
          {
            id: 'value',
            header: 'Value',
            cell: (item) => item.Value ?? '-',
          },
          {
            id: 'lastModified',
            header: 'Last Modified',
            cell: (item) => formatDate(item.LastModifiedDate),
            sortingField: 'LastModifiedDate',
          },
          {
            id: 'version',
            header: 'Version',
            cell: (item) => item.Version ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteParam(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        items={items}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create parameter"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={creating} disabled={!createName}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="/my/parameter" />
          </ChalkFormField>
          <ChalkFormField label="Type">
            <ChalkSelect
              selectedOption={createType}
              onChange={({ detail }) => setCreateType(detail.selectedOption as typeof createType)}
              options={TYPE_OPTIONS}
            />
          </ChalkFormField>
          <ChalkFormField label="Value">
            <ChalkTextarea value={createValue} onChange={({ detail }) => setCreateValue(detail.value)} rows={5} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={editParam !== null}
        onDismiss={() => setEditParam(null)}
        header={`Edit ${editParam?.Name ?? ''}`}
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setEditParam(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleEdit} loading={saving}>
                Save
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={editParam?.Name ?? ''} onChange={() => {}} disabled />
          </ChalkFormField>
          <ChalkFormField label="Type">
            <ChalkInput value={editParam?.Type ?? ''} onChange={() => {}} disabled />
          </ChalkFormField>
          <ChalkFormField label="Value">
            <ChalkTextarea value={editValue} onChange={({ detail }) => setEditValue(detail.value)} rows={5} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteParam !== null}
        onDismiss={() => setDeleteParam(null)}
        header="Delete parameter"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteParam(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteParam?.Name}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
