import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChalkHeader, ChalkBreadcrumbs, ChalkSpaceBetween, ChalkContainer, ChalkKeyValuePairs, ChalkStatusIndicator, ChalkTable, ChalkBox, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkTextarea, ChalkSpinner, ChalkFlashbar } from '../../chalk';
import {
  DescribeRuleCommand,
  DescribeRuleCommandOutput,
  ListTargetsByRuleCommand,
  EnableRuleCommand,
  DisableRuleCommand,
  DeleteRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  Target,
} from '@aws-sdk/client-eventbridge';
import { eventbridge } from '../../api/clients';

export default function RuleDetail() {
  const { ruleName } = useParams<{ ruleName: string }>();
  const navigate = useNavigate();
  const [rule, setRule] = useState<DescribeRuleCommandOutput | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showAddTarget, setShowAddTarget] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [targetArn, setTargetArn] = useState('');
  const [addingTarget, setAddingTarget] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<Target | null>(null);
  const [removingTarget, setRemovingTarget] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editSchedule, setEditSchedule] = useState('');
  const [editPattern, setEditPattern] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ruleRes, targetsRes] = await Promise.all([
        eventbridge.send(new DescribeRuleCommand({ Name: ruleName })),
        eventbridge.send(new ListTargetsByRuleCommand({ Rule: ruleName })),
      ]);
      setRule(ruleRes);
      setTargets(targetsRes.Targets ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [ruleName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (!rule) return;
    setToggling(true);
    try {
      if (rule.State === 'ENABLED') {
        await eventbridge.send(new DisableRuleCommand({ Name: ruleName }));
      } else {
        await eventbridge.send(new EnableRuleCommand({ Name: ruleName }));
      }
      await load();
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await eventbridge.send(new DeleteRuleCommand({ Name: ruleName }));
      navigate('/eventbridge');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = () => {
    if (!rule) return;
    setEditDescription(rule.Description ?? '');
    setEditSchedule(rule.ScheduleExpression ?? '');
    setEditPattern(rule.EventPattern ?? '');
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await eventbridge.send(
        new PutRuleCommand({
          Name: ruleName,
          Description: editDescription || undefined,
          ScheduleExpression: editSchedule || undefined,
          EventPattern: editPattern || undefined,
        })
      );
      setShowEdit(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleAddTarget = async () => {
    setAddingTarget(true);
    try {
      await eventbridge.send(
        new PutTargetsCommand({
          Rule: ruleName,
          Targets: [{ Id: targetId, Arn: targetArn }],
        })
      );
      setShowAddTarget(false);
      setTargetId('');
      setTargetArn('');
      await load();
      setFlash([{ type: 'success', content: `Target "${targetId}" added.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAddingTarget(false);
    }
  };

  const handleRemoveTarget = async () => {
    if (!removeTarget?.Id) return;
    setRemovingTarget(true);
    try {
      await eventbridge.send(
        new RemoveTargetsCommand({
          Rule: ruleName,
          Ids: [removeTarget.Id],
        })
      );
      setRemoveTarget(null);
      await load();
      setFlash([{ type: 'success', content: `Target "${removeTarget.Id}" removed.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setRemovingTarget(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;
  if (!rule) return <ChalkHeader variant="h1">Rule not found</ChalkHeader>;

  let formattedPattern = '-';
  if (rule.EventPattern) {
    try {
      formattedPattern = JSON.stringify(JSON.parse(rule.EventPattern), null, 2);
    } catch {
      formattedPattern = rule.EventPattern;
    }
  }

  const isEnabled = rule.State === 'ENABLED';

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
          { text: 'EventBridge', href: '/eventbridge' },
          { text: 'Rules', href: '/eventbridge' },
          { text: ruleName!, href: '#' },
        ]}
        onNavigate={(href) => {
          if (href !== '#') navigate(href);
        }}
      />
      <ChalkHeader
        variant="h1"
        actions={
          <ChalkSpaceBetween direction="horizontal" size="xs">
            <ChalkButton onClick={openEdit}>Edit</ChalkButton>
            <ChalkButton onClick={handleToggle} loading={toggling}>
              {isEnabled ? 'Disable' : 'Enable'}
            </ChalkButton>
            <ChalkButton onClick={() => setShowDelete(true)}>Delete</ChalkButton>
          </ChalkSpaceBetween>
        }
      >
        {ruleName}
      </ChalkHeader>
      <ChalkContainer header={<ChalkHeader variant="h2">Rule details</ChalkHeader>}>
        <ChalkKeyValuePairs
          columns={2}
          items={[
            { label: 'Name', value: rule.Name ?? '-' },
            { label: 'ARN', value: rule.Arn ?? '-' },
            {
              label: 'State',
              value: (
                <ChalkStatusIndicator type={isEnabled ? 'success' : 'stopped'}>
                  {rule.State}
                </ChalkStatusIndicator>
              ),
            },
            { label: 'Description', value: rule.Description || '-' },
            { label: 'Schedule Expression', value: rule.ScheduleExpression || '-' },
            { label: 'Event Bus', value: rule.EventBusName ?? '-' },
          ]}
        />
      </ChalkContainer>
      {rule.EventPattern && (
        <ChalkContainer header={<ChalkHeader variant="h2">Event pattern</ChalkHeader>}>
          <pre style={{ background: '#1a1a2e', color: '#e0e0e0', padding: '16px', borderRadius: '8px', overflow: 'auto', fontSize: '13px', margin: 0 }}>
            {formattedPattern}
          </pre>
        </ChalkContainer>
      )}
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${targets.length})`}
            actions={<ChalkButton onClick={() => setShowAddTarget(true)}>Add target</ChalkButton>}
          >
            Targets
          </ChalkHeader>
        }
        items={targets}
        columnDefinitions={[
          {
            id: 'targetId',
            header: 'Target ID',
            cell: (item) => item.Id ?? '-',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.Arn ?? '-',
          },
          {
            id: 'input',
            header: 'Input',
            cell: (item) => item.Input ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setRemoveTarget(item)}>
                Remove
              </ChalkButton>
            ),
          },
        ]}
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No targets</b>
          </ChalkBox>
        }
      />

      <ChalkModal
        visible={showEdit}
        onDismiss={() => setShowEdit(false)}
        header="Edit rule"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowEdit(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleSaveEdit} loading={saving}>
                Save
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Description">
            <ChalkInput value={editDescription} onChange={({ detail }) => setEditDescription(detail.value)} placeholder="Rule description" />
          </ChalkFormField>
          <ChalkFormField label="Schedule Expression">
            <ChalkInput value={editSchedule} onChange={({ detail }) => setEditSchedule(detail.value)} placeholder="rate(1 hour)" />
          </ChalkFormField>
          <ChalkFormField label="Event Pattern">
            <ChalkTextarea value={editPattern} onChange={({ detail }) => setEditPattern(detail.value)} placeholder='{"source": ["aws.ec2"]}' rows={8} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showAddTarget}
        onDismiss={() => setShowAddTarget(false)}
        header="Add target"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowAddTarget(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleAddTarget} loading={addingTarget} disabled={!targetId || !targetArn}>
                Add
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Target ID">
            <ChalkInput value={targetId} onChange={({ detail }) => setTargetId(detail.value)} placeholder="my-target" />
          </ChalkFormField>
          <ChalkFormField label="Target ARN">
            <ChalkInput value={targetArn} onChange={({ detail }) => setTargetArn(detail.value)} placeholder="arn:aws:lambda:us-east-1:000000000000:function:my-function" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={removeTarget !== null}
        onDismiss={() => setRemoveTarget(null)}
        header="Remove target"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setRemoveTarget(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleRemoveTarget} loading={removingTarget}>
                Remove
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to remove target <b>{removeTarget?.Id}</b>?
      </ChalkModal>

      <ChalkModal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete rule"
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
        Are you sure you want to delete <b>{ruleName}</b>? This will navigate back to the rules list.
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
