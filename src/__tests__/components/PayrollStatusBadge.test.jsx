import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PayrollStatusBadge from '../../components/PayrollStatusBadge';

const STATUSES = [
  { status: 'draft',            label: 'Draft',           className: 'badge-draft'     },
  { status: 'pending_approval', label: 'Pending Approval', className: 'badge-pending'   },
  { status: 'approved',         label: 'Approved',        className: 'badge-approved'  },
  { status: 'rejected',         label: 'Rejected',        className: 'badge-rejected'  },
  { status: 'executing',        label: 'Executing',       className: 'badge-executing' },
  { status: 'complete',         label: 'Complete',        className: 'badge-complete'  },
  { status: 'failed',           label: 'Failed',          className: 'badge-failed'    },
];

describe('PayrollStatusBadge', () => {
  STATUSES.forEach(({ status, label, className }) => {
    it(`renders "${label}" label for status "${status}"`, () => {
      render(<PayrollStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it(`applies "${className}" class for status "${status}"`, () => {
      const { container } = render(<PayrollStatusBadge status={status} />);
      expect(container.firstChild).toHaveClass(className);
    });
  });

  it('always applies the base status-badge class', () => {
    const { container } = render(<PayrollStatusBadge status="complete" />);
    expect(container.firstChild).toHaveClass('status-badge');
  });

  it('falls back gracefully for unknown status', () => {
    render(<PayrollStatusBadge status="totally_unknown" />);
    expect(screen.getByText('totally_unknown')).toBeInTheDocument();
  });

  it('applies badge-draft class as fallback for unknown status', () => {
    const { container } = render(<PayrollStatusBadge status="mystery" />);
    expect(container.firstChild).toHaveClass('badge-draft');
  });
});
