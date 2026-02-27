# Semantic Probe

- [Introduction](#introduction)
- [What is a Semantic Probe?](#what)
- [Usage](#usage)
- [Probe Composition](#composition)

## Introduction {#introduction}

Before calling a tool, the AI sometimes needs to know *if* the operation is possible, *what* the constraints are, or *what* options are available — without actually executing the side effect. Semantic Probes provide **dry-run introspection** for your tools.

## What is a Semantic Probe? {#what}

A Semantic Probe is a read-only companion to a mutation or action. It answers: "Can I do this? What are the constraints?" without actually doing it.

```typescript
const f = initFusion<AppContext>();

// The mutation (actual operation)
export const deleteProject = f.mutation('projects.delete')
  .describe('Permanently delete a project')
  .withString('id', 'Project ID')
  .handle(async (input, ctx) => {
    await ctx.db.projects.delete({ where: { id: input.id } });
    return { deleted: input.id };
  });

// The probe (dry-run check)
export const canDeleteProject = f.query('projects.can_delete')
  .describe('Check if a project can be deleted and list dependencies')
  .withString('id', 'Project ID')
  .handle(async (input, ctx) => {
    const project = await ctx.db.projects.findUnique({
      where: { id: input.id },
      include: { _count: { select: { tasks: true, members: true } } },
    });

    if (!project) return { canDelete: false, reason: 'Project not found' };

    const blockers = [];
    if (project._count.tasks > 0)
      blockers.push(`${project._count.tasks} active tasks`);
    if (project._count.members > 0)
      blockers.push(`${project._count.members} team members`);

    return {
      canDelete: blockers.length === 0,
      blockers,
      suggestion: blockers.length > 0
        ? 'Archive the project instead, or remove dependencies first.'
        : 'Safe to delete.',
    };
  });
```

The AI calls `projects.can_delete` first, sees the blockers, and either proceeds with the deletion or takes corrective action — without ever executing the destructive operation prematurely.

## Usage {#usage}

Probes are regular `f.query()` tools. The naming convention is `{entity}.can_{action}`:

| Action | Probe | Purpose |
|---|---|---|
| `projects.delete` | `projects.can_delete` | Check dependencies |
| `billing.charge` | `billing.can_charge` | Validate payment method |
| `users.promote` | `users.can_promote` | Check role constraints |

> [!TIP]
> Probes naturally pair with [Agentic Affordances](/cookbook/agentic-affordances). The probe's response can include `suggest()` hints that guide the AI to the actual action or to corrective steps.

## Probe Composition {#composition}

For complex workflows, compose probes to validate multiple steps before executing:

```typescript
export const canPublishRelease = f.query('releases.can_publish')
  .describe('Check if a release is ready to publish')
  .withString('id', 'Release ID')
  .handle(async (input, ctx) => {
    const release = await ctx.db.releases.findUnique({
      where: { id: input.id },
      include: { tests: true, approvals: true },
    });

    const checks = [
      { name: 'All tests pass', ok: release.tests.every(t => t.status === 'pass') },
      { name: 'At least 2 approvals', ok: release.approvals.length >= 2 },
      { name: 'No blocking issues', ok: release.blockers === 0 },
      { name: 'Changelog written', ok: !!release.changelog },
    ];

    return {
      canPublish: checks.every(c => c.ok),
      checks,
      suggestion: checks.filter(c => !c.ok).map(c => c.name).join(', '),
    };
  });
```

The AI sees a checklist of requirements. If any check fails, it knows exactly what to fix before retrying the publish.