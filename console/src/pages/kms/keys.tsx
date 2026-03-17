import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkStatusIndicator, ChalkSpinner, ChalkSpaceBetween, ChalkLink, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkSelect, ChalkBox, useChalkCollection } from '../../chalk';
import {
  ListKeysCommand,
  DescribeKeyCommand,
  CreateKeyCommand,
  ScheduleKeyDeletionCommand,
  KeyMetadata,
} from '@aws-sdk/client-kms';
import { kms } from '../../api/clients';

const KEY_USAGE_OPTIONS = [
  { label: 'ENCRYPT_DECRYPT', value: 'ENCRYPT_DECRYPT' },
  { label: 'SIGN_VERIFY', value: 'SIGN_VERIFY' },
];

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

function statusType(state: string | undefined): 'success' | 'error' | 'warning' | 'info' {
  if (state === 'Enabled') return 'success';
  if (state === 'Disabled') return 'error';
  if (state === 'PendingDeletion') return 'warning';
  return 'info';
}

export default function Keys() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<KeyMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createDesc, setCreateDesc] = useState('');
  const [createUsage, setCreateUsage] = useState(KEY_USAGE_OPTIONS[0]);
  const [creating, setCreating] = useState(false);

  const [deleteKey, setDeleteKey] = useState<KeyMetadata | null>(null);
  const [pendingDays, setPendingDays] = useState('7');
  const [schedulingDeletion, setSchedulingDeletion] = useState(false);

  const load = useCallback(async () => {
    try {
      const listRes = await kms.send(new ListKeysCommand({}));
      const keyEntries = listRes.Keys ?? [];
      const details = await Promise.all(
        keyEntries.map(async (k) => {
          const desc = await kms.send(new DescribeKeyCommand({ KeyId: k.KeyId! }));
          return desc.KeyMetadata!;
        })
      );
      setKeys(details);
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
      await kms.send(
        new CreateKeyCommand({
          Description: createDesc || undefined,
          KeyUsage: createUsage.value as 'ENCRYPT_DECRYPT' | 'SIGN_VERIFY',
        })
      );
      setShowCreate(false);
      setCreateDesc('');
      setCreateUsage(KEY_USAGE_OPTIONS[0]);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleScheduleDeletion = async () => {
    if (!deleteKey?.KeyId) return;
    setSchedulingDeletion(true);
    try {
      await kms.send(
        new ScheduleKeyDeletionCommand({
          KeyId: deleteKey.KeyId,
          PendingWindowInDays: parseInt(pendingDays, 10) || 7,
        })
      );
      setDeleteKey(null);
      setPendingDays('7');
      await load();
    } finally {
      setSchedulingDeletion(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(keys, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.KeyId ?? '').toLowerCase().includes(text.toLowerCase()) ||
        (item.Description ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${keys.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create key
              </ChalkButton>
            }
          >
            KMS Keys
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find keys" />}
        columnDefinitions={[
          {
            id: 'keyId',
            header: 'Key ID',
            cell: (item) => (
              <ChalkLink onFollow={(e) => { e.preventDefault(); navigate(`/kms/keys/${item.KeyId}`); }}>
                {item.KeyId ?? '-'}
              </ChalkLink>
            ),
            sortingField: 'KeyId',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.Arn ?? '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description || '-',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => (
              <ChalkStatusIndicator type={statusType(item.KeyState)}>
                {item.KeyState}
              </ChalkStatusIndicator>
            ),
            sortingField: 'KeyState',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.CreationDate),
            sortingField: 'CreationDate',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) =>
              item.KeyState !== 'PendingDeletion' ? (
                <ChalkButton variant="inline-link" onClick={() => setDeleteKey(item)}>
                  Schedule deletion
                </ChalkButton>
              ) : (
                '-'
              ),
          },
        ]}
        items={items}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create key"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={creating}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Description">
            <ChalkInput value={createDesc} onChange={({ detail }) => setCreateDesc(detail.value)} placeholder="Optional description" />
          </ChalkFormField>
          <ChalkFormField label="Key Usage">
            <ChalkSelect
              selectedOption={createUsage}
              onChange={({ detail }) => setCreateUsage(detail.selectedOption as typeof createUsage)}
              options={KEY_USAGE_OPTIONS}
            />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteKey !== null}
        onDismiss={() => setDeleteKey(null)}
        header="Schedule key deletion"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteKey(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleScheduleDeletion} loading={schedulingDeletion}>
                Schedule deletion
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkBox>
            Are you sure you want to schedule deletion of key <b>{deleteKey?.KeyId}</b>?
          </ChalkBox>
          <ChalkFormField label="Pending window (days)">
            <ChalkInput value={pendingDays} onChange={({ detail }) => setPendingDays(detail.value)} type="number" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
