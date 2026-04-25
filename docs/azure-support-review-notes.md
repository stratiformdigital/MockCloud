# Azure Support Review Notes

These notes preserve review followups for the Azure support plan.

## Architecture Decisions

- Keep the provider-specific route split described in `azure-support-plan.md`; the review notes converged on parallel provider stacks rather than a shared router with many branches.
- Put the `/oauth2/token` behavior in the provider-specific Azure surface so it can diverge from AWS-compatible auth without special cases in shared code.
- Preserve provider-specific request and response fixtures when behavior differs, even when the high-level operation name is the same.

## Followups

- Confirm the first Azure service group before implementation. The reviewed candidates were identity/auth, storage, key vault, and configuration.
- Add compatibility tests around token exchange, tenant-scoped paths, and provider-specific error bodies before broadening service coverage.
- Keep `azure-support-plan.md` as the main plan; use this file for review decisions that should survive local scratch state.
