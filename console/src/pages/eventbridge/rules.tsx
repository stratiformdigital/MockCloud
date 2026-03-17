import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkStatusIndicator, ChalkSpinner, ChalkSpaceBetween, ChalkLink, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkTextarea, ChalkBox, useChalkCollection } from '../../chalk';
import { ListRulesCommand, PutRuleCommand, DeleteRuleCommand, Rule } from '@aws-sdk/client-eventbridge';
import { eventbridge } from '../../api/clients';

export default function Rules() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSchedule, setCreateSchedule] = useState('');
  const [createEventPattern, setCreateEventPattern] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await eventbridge.send(new ListRulesCommand({}));
      setRules(res.Rules ?? []);
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
      await eventbridge.send(
        new PutRuleCommand({
          Name: createName,
          Description: createDescription || undefined,
          ScheduleExpression: createSchedule || undefined,
          EventPattern: createEventPattern || undefined,
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreateSchedule('');
      setCreateEventPattern('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRule?.Name) return;
    setDeleting(true);
    try {
      await eventbridge.send(new DeleteRuleCommand({ Name: deleteRule.Name }));
      setDeleteRule(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(rules, {
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
            counter={`(${rules.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create rule
              </ChalkButton>
            }
          >
            EventBridge Rules
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find rules" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Rule Name',
            cell: (item) => (
              <ChalkLink onFollow={(e) => { e.preventDefault(); navigate(`/eventbridge/rules/${item.Name}`); }}>
                {item.Name ?? '-'}
              </ChalkLink>
            ),
            sortingField: 'Name',
          },
          {
            id: 'state',
            header: 'State',
            cell: (item) => (
              <ChalkStatusIndicator type={item.State === 'ENABLED' ? 'success' : 'stopped'}>
                {item.State}
              </ChalkStatusIndicator>
            ),
            sortingField: 'State',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'schedule',
            header: 'Schedule / Event Pattern',
            cell: (item) => item.ScheduleExpression ?? (item.EventPattern ? 'Event pattern' : '-'),
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
        items={items}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create rule"
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
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-rule" />
          </ChalkFormField>
          <ChalkFormField label="Description">
            <ChalkInput value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </ChalkFormField>
          <ChalkFormField label="Schedule Expression">
            <ChalkInput value={createSchedule} onChange={({ detail }) => setCreateSchedule(detail.value)} placeholder="rate(1 hour)" />
          </ChalkFormField>
          <ChalkFormField label="Event Pattern" description="Optional JSON event pattern">
            <ChalkTextarea value={createEventPattern} onChange={({ detail }) => setCreateEventPattern(detail.value)} rows={5} />
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
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteRule?.Name}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
