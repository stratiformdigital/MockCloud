import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChalkHeader, ChalkBreadcrumbs, ChalkSpaceBetween, ChalkContainer,
  ChalkKeyValuePairs, ChalkTable, ChalkBox, ChalkSpinner, ChalkButton,
  ChalkModal, ChalkFormField, ChalkInput, ChalkSelect, ChalkFlashbar,
} from '../../chalk';
import { GetWebACLCommand, DeleteWebACLCommand, UpdateWebACLCommand, WebACL, Rule } from '@aws-sdk/client-wafv2';
import { wafv2 } from '../../api/clients';

function ruleAction(rule: Rule): string {
  if (rule.Action?.Allow) return 'Allow';
  if (rule.Action?.Block) return 'Block';
  if (rule.Action?.Count) return 'Count';
  return '-';
}

export default function WebAclDetail() {
  const { name, id } = useParams<{ name: string; id: string }>();
  const navigate = useNavigate();
  const [acl, setAcl] = useState<WebACL | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showEditAction, setShowEditAction] = useState(false);
  const [editAction, setEditAction] = useState<{ label: string; value: string }>({ label: 'Allow', value: 'Allow' });
  const [savingAction, setSavingAction] = useState(false);

  const [showAddRule, setShowAddRule] = useState(false);
  const [addRuleName, setAddRuleName] = useState('');
  const [addRulePriority, setAddRulePriority] = useState('');
  const [addRuleAction, setAddRuleAction] = useState<{ label: string; value: string }>({ label: 'Allow', value: 'Allow' });
  const [addingRule, setAddingRule] = useState(false);

  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await wafv2.send(new GetWebACLCommand({ Name: name, Id: id, Scope: 'REGIONAL' }));
      setAcl(res.WebACL ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [name, id]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchLockToken = async (): Promise<string | undefined> => {
    const res = await wafv2.send(new GetWebACLCommand({ Name: name, Id: id, Scope: 'REGIONAL' }));
    return res.LockToken;
  };

  const handleEditAction = async () => {
    if (!acl || !id || !name) return;
    setSavingAction(true);
    try {
      const token = await fetchLockToken();
      const defaultAction = editAction.value === 'Allow' ? { Allow: {} } : { Block: {} };
      await wafv2.send(
        new UpdateWebACLCommand({
          Name: name,
          Id: id,
          Scope: 'REGIONAL',
          LockToken: token,
          DefaultAction: defaultAction,
          VisibilityConfig: acl.VisibilityConfig,
          Rules: acl.Rules ?? [],
        })
      );
      setShowEditAction(false);
      setLoading(true);
      await load();
      setFlash([{ type: 'success', content: 'Default action updated.' }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setSavingAction(false);
    }
  };

  const handleAddRule = async () => {
    if (!acl || !id || !name || !addRuleName || !addRulePriority) return;
    setAddingRule(true);
    try {
      const token = await fetchLockToken();
      const newRule: Rule = {
        Name: addRuleName,
        Priority: parseInt(addRulePriority, 10),
        Action: addRuleAction.value === 'Allow' ? { Allow: {} } : { Block: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: addRuleName,
        },
        Statement: {
          ByteMatchStatement: {
            SearchString: new Uint8Array(),
            FieldToMatch: { UriPath: {} },
            TextTransformations: [{ Priority: 0, Type: 'NONE' }],
            PositionalConstraint: 'CONTAINS',
          },
        },
      };
      await wafv2.send(
        new UpdateWebACLCommand({
          Name: name,
          Id: id,
          Scope: 'REGIONAL',
          LockToken: token,
          DefaultAction: acl.DefaultAction,
          VisibilityConfig: acl.VisibilityConfig,
          Rules: [...(acl.Rules ?? []), newRule],
        })
      );
      setShowAddRule(false);
      setAddRuleName('');
      setAddRulePriority('');
      setAddRuleAction({ label: 'Allow', value: 'Allow' });
      setLoading(true);
      await load();
      setFlash([{ type: 'success', content: `Rule "${addRuleName}" added.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!acl || !id || !name || !deleteRule) return;
    setDeletingRule(true);
    try {
      const token = await fetchLockToken();
      const updatedRules = (acl.Rules ?? []).filter((r) => r.Name !== deleteRule.Name);
      await wafv2.send(
        new UpdateWebACLCommand({
          Name: name,
          Id: id,
          Scope: 'REGIONAL',
          LockToken: token,
          DefaultAction: acl.DefaultAction,
          VisibilityConfig: acl.VisibilityConfig,
          Rules: updatedRules,
        })
      );
      setDeleteRule(null);
      setLoading(true);
      await load();
      setFlash([{ type: 'success', content: `Rule "${deleteRule.Name}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingRule(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !name) return;
    setDeleting(true);
    try {
      const token = await fetchLockToken();
      await wafv2.send(
        new DeleteWebACLCommand({ Name: name, Id: id, Scope: 'REGIONAL', LockToken: token })
      );
      navigate('/wafv2');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;
  if (!acl) return <ChalkHeader variant="h1">Web ACL not found</ChalkHeader>;

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
          { text: 'WAFv2', href: '/wafv2' },
          { text: 'Web ACLs', href: '/wafv2' },
          { text: name!, href: '#' },
        ]}
        onNavigate={(href) => {
          if (href !== '#') navigate(href);
        }}
      />
      <ChalkHeader
        variant="h1"
        actions={
          <ChalkSpaceBetween direction="horizontal" size="xs">
            <ChalkButton onClick={() => {
              const current = acl.DefaultAction?.Allow ? 'Allow' : 'Block';
              setEditAction({ label: current, value: current });
              setShowEditAction(true);
            }}>
              Edit default action
            </ChalkButton>
            <ChalkButton onClick={() => setShowDelete(true)}>Delete</ChalkButton>
          </ChalkSpaceBetween>
        }
      >
        {acl.Name}
      </ChalkHeader>
      <ChalkContainer header={<ChalkHeader variant="h2">Web ACL details</ChalkHeader>}>
        <ChalkKeyValuePairs
          columns={2}
          items={[
            { label: 'Name', value: acl.Name ?? '-' },
            { label: 'ID', value: acl.Id ?? '-' },
            { label: 'ARN', value: acl.ARN ?? '-' },
            { label: 'Description', value: acl.Description || '-' },
            { label: 'Default Action', value: acl.DefaultAction?.Allow ? 'Allow' : 'Block' },
            { label: 'Capacity', value: String(acl.Capacity ?? '-') },
          ]}
        />
      </ChalkContainer>
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${(acl.Rules ?? []).length})`}
            actions={
              <ChalkButton onClick={() => setShowAddRule(true)}>Add rule</ChalkButton>
            }
          >
            Rules
          </ChalkHeader>
        }
        items={acl.Rules ?? []}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => item.Name ?? '-',
          },
          {
            id: 'priority',
            header: 'Priority',
            cell: (item) => item.Priority ?? '-',
            sortingField: 'Priority',
          },
          {
            id: 'action',
            header: 'Action',
            cell: (item) => ruleAction(item),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteRule(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No rules</b>
          </ChalkBox>
        }
      />

      <ChalkModal
        visible={showAddRule}
        onDismiss={() => setShowAddRule(false)}
        header="Add rule"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowAddRule(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleAddRule} loading={addingRule} disabled={!addRuleName || !addRulePriority}>
                Add
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={addRuleName} onChange={({ detail }) => setAddRuleName(detail.value)} placeholder="my-rule" />
          </ChalkFormField>
          <ChalkFormField label="Priority">
            <ChalkInput value={addRulePriority} onChange={({ detail }) => setAddRulePriority(detail.value)} type="number" placeholder="0" />
          </ChalkFormField>
          <ChalkFormField label="Action">
            <ChalkSelect
              selectedOption={addRuleAction}
              onChange={({ detail }) => setAddRuleAction(detail.selectedOption as typeof addRuleAction)}
              options={[
                { label: 'Allow', value: 'Allow' },
                { label: 'Block', value: 'Block' },
              ]}
            />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteRule !== null}
        onDismiss={() => setDeleteRule(null)}
        header="Delete rule"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteRule(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteRule} loading={deletingRule}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete rule <b>{deleteRule?.Name}</b>?
      </ChalkModal>

      <ChalkModal
        visible={showEditAction}
        onDismiss={() => setShowEditAction(false)}
        header="Edit default action"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowEditAction(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleEditAction} loading={savingAction}>
                Save
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Default Action">
          <ChalkSelect
            selectedOption={editAction}
            onChange={({ detail }) => setEditAction(detail.selectedOption as typeof editAction)}
            options={[
              { label: 'Allow', value: 'Allow' },
              { label: 'Block', value: 'Block' },
            ]}
          />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete Web ACL"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDelete(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete Web ACL <b>{acl.Name}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
