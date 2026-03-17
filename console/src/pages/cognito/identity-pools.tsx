import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkLink, ChalkSpinner, ChalkBox, ChalkSpaceBetween, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkCheckbox, useChalkCollection } from '../../chalk';
import {
  ListIdentityPoolsCommand,
  CreateIdentityPoolCommand,
  DeleteIdentityPoolCommand,
} from '@aws-sdk/client-cognito-identity';
import { cognitoIdentity } from '../../api/clients';

interface IdentityPoolEntry {
  IdentityPoolId: string;
  IdentityPoolName: string;
}

export default function IdentityPools() {
  const navigate = useNavigate();
  const [pools, setPools] = useState<IdentityPoolEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [allowUnauth, setAllowUnauth] = useState(false);
  const [creating, setCreating] = useState(false);

  const [deletePool, setDeletePool] = useState<IdentityPoolEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cognitoIdentity.send(new ListIdentityPoolsCommand({ MaxResults: 60 }));
      setPools((res.IdentityPools ?? []) as IdentityPoolEntry[]);
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
      await cognitoIdentity.send(new CreateIdentityPoolCommand({
        IdentityPoolName: createName,
        AllowUnauthenticatedIdentities: allowUnauth,
      }));
      setShowCreate(false);
      setCreateName('');
      setAllowUnauth(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePool?.IdentityPoolId) return;
    setDeleting(true);
    try {
      await cognitoIdentity.send(new DeleteIdentityPoolCommand({ IdentityPoolId: deletePool.IdentityPoolId }));
      setDeletePool(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(pools, {
    filtering: {
      filteringFunction: (item, text) => {
        const lower = text.toLowerCase();
        return (
          (item.IdentityPoolName ?? '').toLowerCase().includes(lower) ||
          (item.IdentityPoolId ?? '').toLowerCase().includes(lower)
        );
      },
    },
    sorting: {},
  });

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ChalkTable
        {...collectionProps}
        header={
          <ChalkHeader
            counter={`(${pools.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create identity pool
              </ChalkButton>
            }
          >
            Cognito Identity Pools
          </ChalkHeader>
        }
        items={items}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Pool Name',
            cell: (item) => (
              <ChalkLink
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/cognito/identity-pools/${item.IdentityPoolId}`);
                }}
              >
                {item.IdentityPoolName}
              </ChalkLink>
            ),
            sortingField: 'IdentityPoolName',
          },
          {
            id: 'id',
            header: 'Pool ID',
            cell: (item) => item.IdentityPoolId ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeletePool(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        filter={
          <ChalkTextFilter {...filterProps} filteringPlaceholder="Find identity pools" />
        }
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No identity pools</b>
          </ChalkBox>
        }
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create identity pool"
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
        <ChalkSpaceBetween size="l">
          <ChalkFormField label="Identity pool name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-identity-pool" />
          </ChalkFormField>
          <ChalkCheckbox checked={allowUnauth} onChange={({ detail }) => setAllowUnauth(detail.checked)}>
            Allow unauthenticated identities
          </ChalkCheckbox>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deletePool !== null}
        onDismiss={() => setDeletePool(null)}
        header="Delete identity pool"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeletePool(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete identity pool <b>{deletePool?.IdentityPoolName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
