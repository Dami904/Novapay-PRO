const STATUS_CONFIG = {
  draft:            { label: 'Draft',           className: 'badge-draft'     },
  pending_approval: { label: 'Pending Approval', className: 'badge-pending'   },
  approved:         { label: 'Approved',         className: 'badge-approved'  },
  rejected:         { label: 'Rejected',         className: 'badge-rejected'  },
  executing:        { label: 'Executing',        className: 'badge-executing' },
  complete:         { label: 'Complete',         className: 'badge-complete'  },
  failed:           { label: 'Failed',           className: 'badge-failed'    },
}

export default function PayrollStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'badge-draft' }
  return <span className={`status-badge ${cfg.className}`}>{cfg.label}</span>
}
