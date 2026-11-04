import type { KitModel } from './kitModel.ts';

/** The adoption kit that `@acme/ui` publishes, whose findings checks name each site still on the old API. */
export const ADOPTION_KIT: KitModel = {
  name: 'default',
  command: 'rdy run --from npm:@acme/ui',
  origin: { source: 'npm:@acme/ui', version: '5.0.0' },
  compiledWith: '0.43.0',
  conditions: [
    { id: 'button', label: 'Buttons import from @acme/ui/button', on: false },
    { id: 'modal', label: 'Modals pass open, not isOpen', on: true },
    { id: 'field', label: 'Inputs are wrapped in a Field', on: true },
    { id: 'legacy', label: 'Nothing imports @acme/ui/legacy', on: false },
  ],
  checklists: [
    {
      name: 'adoption',
      ms: 412,
      checks: [
        {
          name: 'Every Button is imported from @acme/ui/button',
          id: 'acme-ui/button-entry',
          severity: 'warn',
          when: 'button',
          ms: 131,
          findings: true,
          examined: 41,
          sites: ['src/checkout/Pay.tsx:4', 'src/account/Profile.tsx:7', 'src/admin/Users.tsx:3'],
          fix: 'Import Button from @acme/ui/button at each site above; the root entry pulls in every component',
        },
        {
          name: 'No Modal passes the removed isOpen prop',
          id: 'acme-ui/modal-open',
          severity: 'error',
          when: 'modal',
          ms: 118,
          findings: true,
          examined: 11,
          sites: ['src/billing/Invoice.tsx:58', 'src/admin/Users.tsx:112'],
          fix: 'Rename isOpen to open at each site above; v5 ignores isOpen, so the modal never opens',
        },
        {
          name: 'Every input is wrapped in a Field',
          id: 'acme-ui/field-wrapper',
          severity: 'warn',
          when: 'field',
          ms: 104,
          findings: true,
          examined: 27,
          sites: ['src/account/Address.tsx:31', 'src/account/Address.tsx:47'],
          fix: 'Wrap each input above in a Field, which renders the label and the error for it',
        },
        {
          name: 'No source imports from @acme/ui/legacy',
          id: 'acme-ui/no-legacy-entry',
          severity: 'recommend',
          when: 'legacy',
          findings: true,
          examined: 41,
          sites: ['src/reports/Export.tsx:2'],
          fix: "Import from the component's own entry; @acme/ui/legacy is removed in v6",
        },
      ],
    },
  ],
};
