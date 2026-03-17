import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChalkHeader, ChalkBreadcrumbs, ChalkSpaceBetween, ChalkTabs, ChalkTable, ChalkBox, ChalkSpinner, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkTextarea, ChalkFlashbar } from '../../chalk';
import {
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  DeleteRoleCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
  PutRolePolicyCommand,
  GetRolePolicyCommand,
  DeleteRolePolicyCommand,
  type AttachedPolicy,
  type Role,
} from '@aws-sdk/client-iam';
import { iam } from '../../api/clients';

export default function RoleDetail() {
  const { roleName } = useParams<{ roleName: string }>();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [attachedPolicies, setAttachedPolicies] = useState<AttachedPolicy[]>([]);
  const [inlinePolicies, setInlinePolicies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDeleteRole, setShowDeleteRole] = useState(false);
  const [deletingRole, setDeletingRole] = useState(false);

  const [showAttach, setShowAttach] = useState(false);
  const [attachArn, setAttachArn] = useState('');
  const [attaching, setAttaching] = useState(false);

  const [detachPolicy, setDetachPolicy] = useState<AttachedPolicy | null>(null);
  const [detaching, setDetaching] = useState(false);

  const [showEditTrust, setShowEditTrust] = useState(false);
  const [trustPolicyDraft, setTrustPolicyDraft] = useState('');
  const [savingTrust, setSavingTrust] = useState(false);

  const [showCreateInline, setShowCreateInline] = useState(false);
  const [inlinePolicyName, setInlinePolicyName] = useState('');
  const [inlinePolicyDoc, setInlinePolicyDoc] = useState('{"Version":"2012-10-17","Statement":[]}');
  const [creatingInline, setCreatingInline] = useState(false);

  const [viewInlinePolicy, setViewInlinePolicy] = useState<string | null>(null);
  const [viewInlinePolicyDoc, setViewInlinePolicyDoc] = useState('');
  const [loadingInlinePolicy, setLoadingInlinePolicy] = useState(false);
  const [savingInlinePolicy, setSavingInlinePolicy] = useState(false);

  const [deleteInlinePolicy, setDeleteInlinePolicy] = useState<string | null>(null);
  const [deletingInlinePolicy, setDeletingInlinePolicy] = useState(false);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const load = useCallback(async () => {
    const [roleRes, attachedRes, inlineRes] = await Promise.all([
      iam.send(new GetRoleCommand({ RoleName: roleName })),
      iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName })),
      iam.send(new ListRolePoliciesCommand({ RoleName: roleName })),
    ]);
    setRole(roleRes.Role ?? null);
    setAttachedPolicies(attachedRes.AttachedPolicies ?? []);
    setInlinePolicies(inlineRes.PolicyNames ?? []);
    setLoading(false);
  }, [roleName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteRole = async () => {
    setDeletingRole(true);
    try {
      await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
      navigate('/iam');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingRole(false);
    }
  };

  const handleAttach = async () => {
    setAttaching(true);
    try {
      await iam.send(
        new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: attachArn })
      );
      setShowAttach(false);
      setAttachArn('');
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAttaching(false);
    }
  };

  const handleDetach = async () => {
    if (!detachPolicy?.PolicyArn) return;
    setDetaching(true);
    try {
      await iam.send(
        new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: detachPolicy.PolicyArn })
      );
      setDetachPolicy(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDetaching(false);
    }
  };

  const handleEditTrust = async () => {
    setSavingTrust(true);
    try {
      await iam.send(
        new UpdateAssumeRolePolicyCommand({ RoleName: roleName, PolicyDocument: trustPolicyDraft })
      );
      setShowEditTrust(false);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSavingTrust(false);
    }
  };

  const handleCreateInline = async () => {
    setCreatingInline(true);
    try {
      await iam.send(
        new PutRolePolicyCommand({ RoleName: roleName, PolicyName: inlinePolicyName, PolicyDocument: inlinePolicyDoc })
      );
      setShowCreateInline(false);
      setInlinePolicyName('');
      setInlinePolicyDoc('{"Version":"2012-10-17","Statement":[]}');
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setCreatingInline(false);
    }
  };

  const handleViewInlinePolicy = async (policyName: string) => {
    setViewInlinePolicy(policyName);
    setLoadingInlinePolicy(true);
    try {
      const res = await iam.send(
        new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
      );
      setViewInlinePolicyDoc(JSON.stringify(JSON.parse(decodeURIComponent(res.PolicyDocument!)), null, 2));
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setLoadingInlinePolicy(false);
    }
  };

  const handleSaveInlinePolicy = async () => {
    setSavingInlinePolicy(true);
    try {
      await iam.send(
        new PutRolePolicyCommand({ RoleName: roleName, PolicyName: viewInlinePolicy!, PolicyDocument: viewInlinePolicyDoc })
      );
      setViewInlinePolicy(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSavingInlinePolicy(false);
    }
  };

  const handleDeleteInlinePolicy = async () => {
    setDeletingInlinePolicy(true);
    try {
      await iam.send(
        new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: deleteInlinePolicy! })
      );
      setDeleteInlinePolicy(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingInlinePolicy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  const trustPolicy = role?.AssumeRolePolicyDocument
    ? JSON.stringify(JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument)), null, 2)
    : '{}';

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
          { text: 'IAM', href: '/iam' },
          { text: 'Roles', href: '/iam' },
          { text: roleName!, href: '#' },
        ]}
        onNavigate={(href) => {
          if (href !== '#') navigate(href);
        }}
      />

      <ChalkHeader
        variant="h1"
        actions={
          <ChalkButton onClick={() => setShowDeleteRole(true)}>Delete</ChalkButton>
        }
      >
        {roleName}
      </ChalkHeader>

      <ChalkTabs
        tabs={[
          {
            id: 'trust',
            label: 'Trust Policy',
            content: (
              <ChalkSpaceBetween size="m">
                <ChalkBox float="right">
                  <ChalkButton onClick={() => { setTrustPolicyDraft(trustPolicy); setShowEditTrust(true); }}>
                    Edit trust policy
                  </ChalkButton>
                </ChalkBox>
                <ChalkBox padding="l">
                  <pre style={{ background: '#1a1a2e', color: '#e0e0e0', padding: '16px', borderRadius: '8px', overflow: 'auto', fontSize: '13px' }}>
                    {trustPolicy}
                  </pre>
                </ChalkBox>
              </ChalkSpaceBetween>
            ),
          },
          {
            id: 'permissions',
            label: 'Permissions',
            content: (
              <ChalkSpaceBetween size="l">
                <ChalkTable
                  header={
                    <ChalkHeader
                      counter={`(${attachedPolicies.length})`}
                      actions={
                        <ChalkButton onClick={() => setShowAttach(true)}>Attach policy</ChalkButton>
                      }
                    >
                      Attached Policies
                    </ChalkHeader>
                  }
                  items={attachedPolicies}
                  columnDefinitions={[
                    {
                      id: 'name',
                      header: 'Policy Name',
                      cell: (item) => item.PolicyName ?? '-',
                    },
                    {
                      id: 'arn',
                      header: 'Policy ARN',
                      cell: (item) => item.PolicyArn ?? '-',
                    },
                    {
                      id: 'actions',
                      header: 'Actions',
                      cell: (item) => (
                        <ChalkButton variant="inline-link" onClick={() => setDetachPolicy(item)}>
                          Detach
                        </ChalkButton>
                      ),
                    },
                  ]}
                  empty={
                    <ChalkBox textAlign="center" color="inherit">
                      <b>No attached policies</b>
                    </ChalkBox>
                  }
                />
                <ChalkTable
                  header={
                    <ChalkHeader
                      counter={`(${inlinePolicies.length})`}
                      actions={
                        <ChalkButton onClick={() => setShowCreateInline(true)}>Create inline policy</ChalkButton>
                      }
                    >
                      Inline Policies
                    </ChalkHeader>
                  }
                  items={inlinePolicies.map((name) => ({ name }))}
                  columnDefinitions={[
                    {
                      id: 'name',
                      header: 'Policy Name',
                      cell: (item) => (
                        <ChalkButton variant="inline-link" onClick={() => handleViewInlinePolicy(item.name)}>
                          {item.name}
                        </ChalkButton>
                      ),
                    },
                    {
                      id: 'actions',
                      header: 'Actions',
                      cell: (item) => (
                        <ChalkButton variant="inline-link" onClick={() => setDeleteInlinePolicy(item.name)}>
                          Delete
                        </ChalkButton>
                      ),
                    },
                  ]}
                  empty={
                    <ChalkBox textAlign="center" color="inherit">
                      <b>No inline policies</b>
                    </ChalkBox>
                  }
                />
              </ChalkSpaceBetween>
            ),
          },
        ]}
      />

      <ChalkModal
        visible={showDeleteRole}
        onDismiss={() => setShowDeleteRole(false)}
        header="Delete role"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDeleteRole(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteRole} loading={deletingRole}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{roleName}</b>?
      </ChalkModal>

      <ChalkModal
        visible={showAttach}
        onDismiss={() => setShowAttach(false)}
        header="Attach policy"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowAttach(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleAttach} loading={attaching} disabled={!attachArn}>
                Attach
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Policy ARN">
          <ChalkInput
            value={attachArn}
            onChange={({ detail }) => setAttachArn(detail.value)}
            placeholder="arn:aws:iam::aws:policy/..."
          />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={detachPolicy !== null}
        onDismiss={() => setDetachPolicy(null)}
        header="Detach policy"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDetachPolicy(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDetach} loading={detaching}>
                Detach
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to detach <b>{detachPolicy?.PolicyName}</b>?
      </ChalkModal>

      <ChalkModal
        visible={showEditTrust}
        onDismiss={() => setShowEditTrust(false)}
        header="Edit trust policy"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowEditTrust(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleEditTrust} loading={savingTrust}>
                Update
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Trust policy document">
          <ChalkTextarea
            value={trustPolicyDraft}
            onChange={({ detail }) => setTrustPolicyDraft(detail.value)}
            rows={16}
          />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showCreateInline}
        onDismiss={() => setShowCreateInline(false)}
        header="Create inline policy"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreateInline(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateInline} loading={creatingInline} disabled={!inlinePolicyName}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Policy name">
            <ChalkInput
              value={inlinePolicyName}
              onChange={({ detail }) => setInlinePolicyName(detail.value)}
            />
          </ChalkFormField>
          <ChalkFormField label="Policy document">
            <ChalkTextarea
              value={inlinePolicyDoc}
              onChange={({ detail }) => setInlinePolicyDoc(detail.value)}
              rows={16}
            />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={viewInlinePolicy !== null}
        onDismiss={() => setViewInlinePolicy(null)}
        header={viewInlinePolicy}
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setViewInlinePolicy(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleSaveInlinePolicy} loading={savingInlinePolicy} disabled={loadingInlinePolicy}>
                Save
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        {loadingInlinePolicy ? <ChalkSpinner /> : (
          <ChalkFormField label="Policy document">
            <ChalkTextarea
              value={viewInlinePolicyDoc}
              onChange={({ detail }) => setViewInlinePolicyDoc(detail.value)}
              rows={16}
            />
          </ChalkFormField>
        )}
      </ChalkModal>

      <ChalkModal
        visible={deleteInlinePolicy !== null}
        onDismiss={() => setDeleteInlinePolicy(null)}
        header="Delete inline policy"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteInlinePolicy(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteInlinePolicy} loading={deletingInlinePolicy}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteInlinePolicy}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
