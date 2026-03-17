import { useState, useEffect, useCallback } from 'react';
import {
  ChalkTable, ChalkHeader, ChalkTextFilter, ChalkSpinner, ChalkSpaceBetween,
  ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkTextarea,
  ChalkBox, ChalkExpandableSection, useChalkCollection,
} from '../../chalk';
import {
  ListSecretsCommand,
  GetSecretValueCommand,
  CreateSecretCommand,
  PutSecretValueCommand,
  DeleteSecretCommand,
  SecretListEntry,
} from '@aws-sdk/client-secrets-manager';
import { secretsmanager } from '../../api/clients';

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

function SecretValue({ secretId }: { secretId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function loadValue() {
    if (value !== null) return;
    setLoading(true);
    try {
      const res = await secretsmanager.send(new GetSecretValueCommand({ SecretId: secretId }));
      setValue(res.SecretString ?? '(binary)');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ChalkExpandableSection
      headerText="Secret value"
      expanded={expanded}
      onChange={({ detail }) => {
        setExpanded(detail.expanded);
        if (detail.expanded) loadValue();
      }}
    >
      {loading ? (
        <ChalkSpinner />
      ) : error ? (
        <ChalkBox color="text-status-error">{error}</ChalkBox>
      ) : (
        <ChalkBox variant="code">{value}</ChalkBox>
      )}
    </ChalkExpandableSection>
  );
}

export default function Secrets() {
  const [secrets, setSecrets] = useState<SecretListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createValue, setCreateValue] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [editSecret, setEditSecret] = useState<SecretListEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteSecret, setDeleteSecret] = useState<SecretListEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await secretsmanager.send(new ListSecretsCommand({}));
      setSecrets(res.SecretList ?? []);
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
      await secretsmanager.send(
        new CreateSecretCommand({
          Name: createName,
          SecretString: createValue,
          ...(createDescription && { Description: createDescription }),
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateValue('');
      setCreateDescription('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const openEdit = async (secret: SecretListEntry) => {
    setEditSecret(secret);
    setEditValue('');
    setEditLoading(true);
    try {
      const res = await secretsmanager.send(new GetSecretValueCommand({ SecretId: secret.Name }));
      setEditValue(res.SecretString ?? '');
    } catch (err) {
      setError(String(err));
      setEditSecret(null);
    } finally {
      setEditLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editSecret?.Name) return;
    setSaving(true);
    try {
      await secretsmanager.send(
        new PutSecretValueCommand({
          SecretId: editSecret.Name,
          SecretString: editValue,
        })
      );
      setEditSecret(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteSecret?.Name) return;
    setDeleting(true);
    try {
      await secretsmanager.send(
        new DeleteSecretCommand({
          SecretId: deleteSecret.Name,
          ForceDeleteWithoutRecovery: true,
        })
      );
      setDeleteSecret(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(secrets, {
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
            counter={`(${secrets.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create secret
              </ChalkButton>
            }
          >
            Secrets Manager Secrets
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find secrets" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Secret Name',
            cell: (item) => item.Name ?? '-',
            sortingField: 'Name',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.ARN ?? '-',
          },
          {
            id: 'lastChanged',
            header: 'Last Changed',
            cell: (item) => formatDate(item.LastChangedDate),
            sortingField: 'LastChangedDate',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'value',
            header: 'Secret Value',
            cell: (item) => <SecretValue secretId={item.Name!} />,
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkSpaceBetween direction="horizontal" size="xs">
                <ChalkButton variant="inline-link" onClick={() => openEdit(item)}>
                  Edit
                </ChalkButton>
                <ChalkButton variant="inline-link" onClick={() => setDeleteSecret(item)}>
                  Delete
                </ChalkButton>
              </ChalkSpaceBetween>
            ),
          },
        ]}
        items={items}
        variant="full-page"
        stickyHeader
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create secret"
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
          <ChalkFormField label="Secret name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-secret" />
          </ChalkFormField>
          <ChalkFormField label="Secret value">
            <ChalkTextarea value={createValue} onChange={({ detail }) => setCreateValue(detail.value)} rows={5} />
          </ChalkFormField>
          <ChalkFormField label="Description" description="Optional">
            <ChalkInput value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={editSecret !== null}
        onDismiss={() => setEditSecret(null)}
        header={`Edit ${editSecret?.Name ?? ''}`}
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setEditSecret(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleEdit} loading={saving} disabled={editLoading}>
                Save
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        {editLoading ? (
          <ChalkSpinner />
        ) : (
          <ChalkFormField label="Secret value">
            <ChalkTextarea value={editValue} onChange={({ detail }) => setEditValue(detail.value)} rows={5} />
          </ChalkFormField>
        )}
      </ChalkModal>

      <ChalkModal
        visible={deleteSecret !== null}
        onDismiss={() => setDeleteSecret(null)}
        header="Delete secret"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteSecret(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to permanently delete <b>{deleteSecret?.Name}</b>? This action cannot be undone.
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
