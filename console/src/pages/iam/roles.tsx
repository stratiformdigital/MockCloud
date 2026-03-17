import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkLink, ChalkSpinner, ChalkBox, ChalkSpaceBetween, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkTextarea, useChalkCollection } from '../../chalk';
import { ListRolesCommand, CreateRoleCommand, DeleteRoleCommand, type Role } from '@aws-sdk/client-iam';
import { iam } from '../../api/clients';

const DEFAULT_ASSUME_ROLE_POLICY = JSON.stringify(
  {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'lambda.amazonaws.com' },
        Action: 'sts:AssumeRole',
      },
    ],
  },
  null,
  2
);

export default function Roles() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPolicy, setCreatePolicy] = useState(DEFAULT_ASSUME_ROLE_POLICY);
  const [creating, setCreating] = useState(false);

  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await iam.send(new ListRolesCommand({}));
    setRoles(res.Roles ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await iam.send(
        new CreateRoleCommand({
          RoleName: createName,
          Description: createDescription || undefined,
          AssumeRolePolicyDocument: createPolicy,
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreatePolicy(DEFAULT_ASSUME_ROLE_POLICY);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRole?.RoleName) return;
    setDeleting(true);
    try {
      await iam.send(new DeleteRoleCommand({ RoleName: deleteRole.RoleName }));
      setDeleteRole(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(roles, {
    filtering: {
      filteringFunction: (item, text) => {
        const lower = text.toLowerCase();
        return (
          (item.RoleName ?? '').toLowerCase().includes(lower) ||
          (item.Arn ?? '').toLowerCase().includes(lower) ||
          (item.Description ?? '').toLowerCase().includes(lower)
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
            counter={`(${roles.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create role
              </ChalkButton>
            }
          >
            IAM Roles
          </ChalkHeader>
        }
        items={items}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Role Name',
            cell: (item) => (
              <ChalkLink
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/iam/roles/${item.RoleName}`);
                }}
              >
                {item.RoleName}
              </ChalkLink>
            ),
            sortingField: 'RoleName',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.Arn ?? '-',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => item.CreateDate?.toLocaleString() ?? '-',
            sortingField: 'CreateDate',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteRole(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        filter={
          <ChalkTextFilter {...filterProps} filteringPlaceholder="Find roles" />
        }
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No roles</b>
          </ChalkBox>
        }
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create role"
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
          <ChalkFormField label="Role name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} />
          </ChalkFormField>
          <ChalkFormField label="Description">
            <ChalkInput value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </ChalkFormField>
          <ChalkFormField label="Assume Role Policy Document">
            <ChalkTextarea value={createPolicy} onChange={({ detail }) => setCreatePolicy(detail.value)} rows={10} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteRole !== null}
        onDismiss={() => setDeleteRole(null)}
        header="Delete role"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteRole(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteRole?.RoleName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
