import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChalkHeader, ChalkBreadcrumbs, ChalkSpaceBetween, ChalkTabs, ChalkTable, ChalkBox, ChalkSpinner, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkCheckbox, ChalkToggle, ChalkFlashbar } from '../../chalk';
import {
  DescribeUserPoolCommand,
  ListUsersCommand,
  ListUserPoolClientsCommand,
  DescribeUserPoolDomainCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  DeleteUserPoolCommand,
  CreateUserPoolClientCommand,
  DeleteUserPoolClientCommand,
  type UserType,
  type UserPoolClientDescription,
  type UserPoolType,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognitoIdp } from '../../api/clients';

export default function UserPoolDetail() {
  const { userPoolId } = useParams<{ userPoolId: string }>();
  const navigate = useNavigate();
  const [pool, setPool] = useState<UserPoolType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [clients, setClients] = useState<UserPoolClientDescription[]>([]);
  const [domain, setDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteUser, setDeleteUser] = useState<UserType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [passwordUser, setPasswordUser] = useState<UserType | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [settingPassword, setSettingPassword] = useState(false);

  const [showDeletePool, setShowDeletePool] = useState(false);
  const [deletingPool, setDeletingPool] = useState(false);

  const [showCreateClient, setShowCreateClient] = useState(false);
  const [createClientName, setCreateClientName] = useState('');
  const [generateSecret, setGenerateSecret] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);

  const [deleteClient, setDeleteClient] = useState<UserPoolClientDescription | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await cognitoIdp.send(new ListUsersCommand({ UserPoolId: userPoolId }));
    setUsers(res.Users ?? []);
  }, [userPoolId]);

  const loadClients = useCallback(async () => {
    const res = await cognitoIdp.send(new ListUserPoolClientsCommand({ UserPoolId: userPoolId, MaxResults: 60 }));
    setClients(res.UserPoolClients ?? []);
  }, [userPoolId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [poolRes, usersRes, clientsRes] = await Promise.all([
          cognitoIdp.send(new DescribeUserPoolCommand({ UserPoolId: userPoolId })),
          cognitoIdp.send(new ListUsersCommand({ UserPoolId: userPoolId })),
          cognitoIdp.send(new ListUserPoolClientsCommand({ UserPoolId: userPoolId, MaxResults: 60 })),
        ]);

        if (cancelled) return;

        const userPool = poolRes.UserPool ?? null;
        setPool(userPool);
        setUsers(usersRes.Users ?? []);
        setClients(clientsRes.UserPoolClients ?? []);

        if (userPool?.Domain) {
          try {
            const domainRes = await cognitoIdp.send(
              new DescribeUserPoolDomainCommand({ Domain: userPool.Domain })
            );
            if (!cancelled) {
              setDomain(domainRes.DomainDescription?.Domain ?? null);
            }
          } catch {
            if (!cancelled) setDomain(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userPoolId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await cognitoIdp.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: createUsername,
          TemporaryPassword: createPassword,
        })
      );
      setShowCreate(false);
      setCreateUsername('');
      setCreatePassword('');
      await loadUsers();
      setFlash([{ type: 'success', content: `User "${createUsername}" created.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser?.Username) return;
    setDeleting(true);
    try {
      await cognitoIdp.send(
        new AdminDeleteUserCommand({
          UserPoolId: userPoolId,
          Username: deleteUser.Username,
        })
      );
      setDeleteUser(null);
      await loadUsers();
      setFlash([{ type: 'success', content: `User "${deleteUser.Username}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeleting(false);
    }
  };

  const handleSetPassword = async () => {
    if (!passwordUser?.Username) return;
    setSettingPassword(true);
    try {
      await cognitoIdp.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: passwordUser.Username,
          Password: newPassword,
          Permanent: permanent,
        })
      );
      setPasswordUser(null);
      setNewPassword('');
      setPermanent(true);
      setFlash([{ type: 'success', content: `Password set for "${passwordUser.Username}".` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSettingPassword(false);
    }
  };

  const handleDeletePool = async () => {
    setDeletingPool(true);
    try {
      await cognitoIdp.send(new DeleteUserPoolCommand({ UserPoolId: userPoolId }));
      navigate('/cognito');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingPool(false);
      setShowDeletePool(false);
    }
  };

  const handleCreateClient = async () => {
    setCreatingClient(true);
    try {
      await cognitoIdp.send(
        new CreateUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientName: createClientName,
          GenerateSecret: generateSecret,
        })
      );
      setShowCreateClient(false);
      setCreateClientName('');
      setGenerateSecret(false);
      await loadClients();
      setFlash([{ type: 'success', content: `App client "${createClientName}" created.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setCreatingClient(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!deleteClient?.ClientId) return;
    setDeletingClient(true);
    try {
      await cognitoIdp.send(
        new DeleteUserPoolClientCommand({
          UserPoolId: userPoolId,
          ClientId: deleteClient.ClientId,
        })
      );
      setDeleteClient(null);
      await loadClients();
      setFlash([{ type: 'success', content: `App client "${deleteClient.ClientName ?? deleteClient.ClientId}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingClient(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;

  const poolName = pool?.Name ?? userPoolId!;

  function getUserEmail(user: UserType): string {
    return user.Attributes?.find((a) => a.Name === 'email')?.Value ?? '-';
  }

  return (
    <ChalkSpaceBetween size="l">
      {flash.length > 0 && (
        <ChalkFlashbar
          items={flash.map((f, i) => ({
            type: f.type,
            content: f.content,
            dismissible: true,
            id: String(i),
            onDismiss: () => setFlash([]),
          }))}
        />
      )}

      <ChalkBreadcrumbs
        items={[
          { text: 'MockCloud', href: '/' },
          { text: 'Cognito', href: '/cognito' },
          { text: 'User Pools', href: '/cognito' },
          { text: poolName, href: '#' },
        ]}
        onNavigate={(href) => {
          if (href !== '#') navigate(href);
        }}
      />

      <ChalkHeader
        variant="h1"
        actions={
          <ChalkButton onClick={() => setShowDeletePool(true)}>Delete pool</ChalkButton>
        }
      >
        {poolName}
      </ChalkHeader>

      <ChalkTabs
        tabs={[
          {
            id: 'users',
            label: 'Users',
            content: (
              <ChalkTable
                header={
                  <ChalkHeader
                    counter={`(${users.length})`}
                    actions={
                      <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                        Create user
                      </ChalkButton>
                    }
                  >
                    Users
                  </ChalkHeader>
                }
                items={users}
                columnDefinitions={[
                  {
                    id: 'username',
                    header: 'Username',
                    cell: (item) => item.Username ?? '-',
                  },
                  {
                    id: 'email',
                    header: 'Email',
                    cell: (item) => getUserEmail(item),
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    cell: (item) => item.UserStatus ?? '-',
                  },
                  {
                    id: 'created',
                    header: 'Created',
                    cell: (item) => item.UserCreateDate?.toLocaleString() ?? '-',
                  },
                  {
                    id: 'actions',
                    header: 'Actions',
                    cell: (item) => (
                      <ChalkSpaceBetween direction="horizontal" size="xs">
                        <ChalkButton variant="inline-link" onClick={() => { setPasswordUser(item); setNewPassword(''); setPermanent(true); }}>
                          Set password
                        </ChalkButton>
                        <ChalkButton variant="inline-link" onClick={() => setDeleteUser(item)}>
                          Delete
                        </ChalkButton>
                      </ChalkSpaceBetween>
                    ),
                  },
                ]}
                empty={
                  <ChalkBox textAlign="center" color="inherit">
                    <b>No users</b>
                  </ChalkBox>
                }
              />
            ),
          },
          {
            id: 'clients',
            label: 'App Clients',
            content: (
              <ChalkTable
                header={
                  <ChalkHeader
                    counter={`(${clients.length})`}
                    actions={
                      <ChalkButton variant="primary" onClick={() => setShowCreateClient(true)}>
                        Create app client
                      </ChalkButton>
                    }
                  >
                    App Clients
                  </ChalkHeader>
                }
                items={clients}
                columnDefinitions={[
                  {
                    id: 'name',
                    header: 'Client Name',
                    cell: (item) => item.ClientName ?? '-',
                  },
                  {
                    id: 'id',
                    header: 'Client ID',
                    cell: (item) => item.ClientId ?? '-',
                  },
                  {
                    id: 'actions',
                    header: 'Actions',
                    cell: (item) => (
                      <ChalkButton variant="inline-link" onClick={() => setDeleteClient(item)}>
                        Delete
                      </ChalkButton>
                    ),
                  },
                ]}
                empty={
                  <ChalkBox textAlign="center" color="inherit">
                    <b>No app clients</b>
                  </ChalkBox>
                }
              />
            ),
          },
          {
            id: 'domain',
            label: 'Domain',
            content: (
              <ChalkBox padding="l">
                {domain ? (
                  <ChalkSpaceBetween size="s">
                    <ChalkBox variant="h3">Domain</ChalkBox>
                    <ChalkBox>{domain}</ChalkBox>
                  </ChalkSpaceBetween>
                ) : (
                  <ChalkBox color="text-body-secondary">No domain configured</ChalkBox>
                )}
              </ChalkBox>
            ),
          },
        ]}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create user"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={creating} disabled={!createUsername}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Username">
            <ChalkInput value={createUsername} onChange={({ detail }) => setCreateUsername(detail.value)} placeholder="username" />
          </ChalkFormField>
          <ChalkFormField label="Temporary password">
            <ChalkInput type="password" value={createPassword} onChange={({ detail }) => setCreatePassword(detail.value)} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteUser !== null}
        onDismiss={() => setDeleteUser(null)}
        header="Delete user"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteUser(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete user <b>{deleteUser?.Username}</b>?
      </ChalkModal>

      <ChalkModal
        visible={passwordUser !== null}
        onDismiss={() => setPasswordUser(null)}
        header={`Set password for ${passwordUser?.Username ?? ''}`}
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setPasswordUser(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleSetPassword} loading={settingPassword} disabled={!newPassword}>
                Set password
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Password">
            <ChalkInput type="password" value={newPassword} onChange={({ detail }) => setNewPassword(detail.value)} />
          </ChalkFormField>
          <ChalkCheckbox checked={permanent} onChange={({ detail }) => setPermanent(detail.checked)}>
            Permanent
          </ChalkCheckbox>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showCreateClient}
        onDismiss={() => setShowCreateClient(false)}
        header="Create app client"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreateClient(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateClient} loading={creatingClient} disabled={!createClientName}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Client name">
            <ChalkInput value={createClientName} onChange={({ detail }) => setCreateClientName(detail.value)} placeholder="my-app-client" />
          </ChalkFormField>
          <ChalkToggle checked={generateSecret} onChange={({ detail }) => setGenerateSecret(detail.checked)}>
            Generate client secret
          </ChalkToggle>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteClient !== null}
        onDismiss={() => setDeleteClient(null)}
        header="Delete app client"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteClient(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteClient} loading={deletingClient}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete app client <b>{deleteClient?.ClientName ?? deleteClient?.ClientId}</b>?
      </ChalkModal>

      <ChalkModal
        visible={showDeletePool}
        onDismiss={() => setShowDeletePool(false)}
        header="Delete user pool"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDeletePool(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeletePool} loading={deletingPool}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete user pool <b>{poolName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
