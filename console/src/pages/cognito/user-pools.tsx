import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkLink, ChalkSpinner, ChalkBox, ChalkSpaceBetween, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, useChalkCollection } from '../../chalk';
import {
  ListUserPoolsCommand,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  type UserPoolDescriptionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognitoIdp } from '../../api/clients';

export default function UserPools() {
  const navigate = useNavigate();
  const [pools, setPools] = useState<UserPoolDescriptionType[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deletePool, setDeletePool] = useState<UserPoolDescriptionType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cognitoIdp.send(new ListUserPoolsCommand({ MaxResults: 60 }));
      setPools(res.UserPools ?? []);
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
      await cognitoIdp.send(new CreateUserPoolCommand({ PoolName: createName }));
      setShowCreate(false);
      setCreateName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePool?.Id) return;
    setDeleting(true);
    try {
      await cognitoIdp.send(new DeleteUserPoolCommand({ UserPoolId: deletePool.Id }));
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
          (item.Name ?? '').toLowerCase().includes(lower) ||
          (item.Id ?? '').toLowerCase().includes(lower)
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
                Create user pool
              </ChalkButton>
            }
          >
            Cognito User Pools
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
                  navigate(`/cognito/user-pools/${item.Id}`);
                }}
              >
                {item.Name}
              </ChalkLink>
            ),
            sortingField: 'Name',
          },
          {
            id: 'id',
            header: 'Pool ID',
            cell: (item) => item.Id ?? '-',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => item.CreationDate?.toLocaleString() ?? '-',
            sortingField: 'CreationDate',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => item.Status ?? '-',
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
          <ChalkTextFilter {...filterProps} filteringPlaceholder="Find user pools" />
        }
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No user pools</b>
          </ChalkBox>
        }
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create user pool"
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
        <ChalkFormField label="Pool name">
          <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-user-pool" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={deletePool !== null}
        onDismiss={() => setDeletePool(null)}
        header="Delete user pool"
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
        Are you sure you want to delete user pool <b>{deletePool?.Name}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
