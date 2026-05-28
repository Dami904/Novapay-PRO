import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
});

interface SendEmailParams {
  to:      string | string[];
  subject: string;
  html:    string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  try {
    await transporter.sendMail({
      from:    `NovaPay <${env.GMAIL_USER}>`,
      to:      Array.isArray(params.to) ? params.to.join(', ') : params.to,
      subject: params.subject,
      html:    params.html,
    });
  } catch (err) {
    console.error('[EmailService] Failed to send email:', err);
  }
}

// ── Email Templates ───────────────────────────────────────────────────────────

export function payrollSubmittedEmail(data: {
  orgName:    string;
  runLabel:   string;
  submitter:  string;
  runId:      string;
  orgId:      string;
  appUrl:     string;
}): { subject: string; html: string } {
  return {
    subject: `[NovaPay] Payroll "${data.runLabel}" needs your approval`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#6366f1">NovaPay — Action Required</h2>
        <p>Hi,</p>
        <p><strong>${data.submitter}</strong> submitted a payroll run for <strong>${data.orgName}</strong> and it needs your approval.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#64748b">Payroll label</td><td style="padding:8px"><strong>${data.runLabel}</strong></td></tr>
          <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Submitted by</td><td style="padding:8px">${data.submitter}</td></tr>
        </table>
        <a href="${data.appUrl}/org/${data.orgId}/payroll/${data.runId}"
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Review Payroll Run →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">NovaPay · On-chain payroll for modern teams</p>
      </div>
    `,
  };
}

export function payrollApprovedEmail(data: {
  orgName:   string;
  runLabel:  string;
  approver:  string;
  runId:     string;
  orgId:     string;
  appUrl:    string;
}): { subject: string; html: string } {
  return {
    subject: `[NovaPay] Payroll "${data.runLabel}" approved — ready to execute`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#10b981">NovaPay — Payroll Approved ✅</h2>
        <p>Hi,</p>
        <p>The payroll run <strong>${data.runLabel}</strong> for <strong>${data.orgName}</strong> has been approved by <strong>${data.approver}</strong>.</p>
        <p>It is now ready for on-chain execution.</p>
        <a href="${data.appUrl}/org/${data.orgId}/payroll/${data.runId}/execute"
           style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Execute Payroll →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">NovaPay · On-chain payroll for modern teams</p>
      </div>
    `,
  };
}

export function payrollRejectedEmail(data: {
  orgName:   string;
  runLabel:  string;
  rejector:  string;
  note:      string;
  runId:     string;
  orgId:     string;
  appUrl:    string;
}): { subject: string; html: string } {
  return {
    subject: `[NovaPay] Payroll "${data.runLabel}" was rejected`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#ef4444">NovaPay — Payroll Rejected</h2>
        <p>Hi,</p>
        <p>The payroll run <strong>${data.runLabel}</strong> for <strong>${data.orgName}</strong> was rejected by <strong>${data.rejector}</strong>.</p>
        <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin:16px 0">
          <strong>Reason:</strong><br/>${data.note || 'No reason provided.'}
        </div>
        <p>Please review the payroll and re-submit after making corrections.</p>
        <a href="${data.appUrl}/org/${data.orgId}/payroll/${data.runId}"
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          View Payroll Run →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">NovaPay · On-chain payroll for modern teams</p>
      </div>
    `,
  };
}

export function payrollExecutedEmail(data: {
  orgName:    string;
  runLabel:   string;
  txHash:     string;
  explorerUrl: string;
  total:      string;
  token:      string;
}): { subject: string; html: string } {
  return {
    subject: `[NovaPay] Payroll "${data.runLabel}" executed on-chain ✅`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#10b981">NovaPay — Payroll Complete 🎉</h2>
        <p>Hi,</p>
        <p>The payroll run <strong>${data.runLabel}</strong> for <strong>${data.orgName}</strong> has been successfully executed on-chain.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#64748b">Total disbursed</td><td style="padding:8px"><strong>${data.total} ${data.token}</strong></td></tr>
          <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Tx Hash</td><td style="padding:8px;font-family:monospace;font-size:12px">${data.txHash.slice(0, 20)}...</td></tr>
        </table>
        <a href="${data.explorerUrl}"
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          View on Morph Explorer →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">NovaPay · On-chain payroll for modern teams</p>
      </div>
    `,
  };
}

export function employeePayslipEmail(data: {
  employeeName:  string;
  orgName:       string;
  runLabel:      string;
  amount:        string;
  token:         string;
  executedAt:    string;
  walletAddress: string;
  explorerUrl:   string;
}): { subject: string; html: string } {
  const firstName  = data.employeeName.split(' ')[0] || data.employeeName;
  const formattedAmount = `${Number(data.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${data.token}`;
  const formattedDate   = new Date(data.executedAt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const shortWallet = `${data.walletAddress.slice(0, 6)}…${data.walletAddress.slice(-4)}`;

  return {
    subject: `You've been paid — ${formattedAmount} from ${data.orgName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px 32px 24px">
          <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.02em">✦ NovaPay</div>
          <div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px">On-chain payroll for modern teams</div>
        </div>

        <!-- Body -->
        <div style="padding:32px">
          <p style="margin:0 0 8px;color:#374151;font-size:15px">Hi ${firstName},</p>

          <!-- Big paid callout -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin:20px 0;text-align:center">
            <div style="color:#15803d;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Payment received</div>
            <div style="color:#10b981;font-size:32px;font-weight:800;letter-spacing:-0.03em">${formattedAmount}</div>
            <div style="color:#6b7280;font-size:13px;margin-top:6px">sent to your wallet on ${formattedDate}</div>
          </div>

          <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 20px">
            <strong>${data.orgName}</strong> has successfully processed your payment as part of the
            <strong>${data.runLabel}</strong> payroll run. The funds have been transferred directly
            to your wallet on the Morph blockchain.
          </p>

          <!-- Details table -->
          <table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px">
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#9ca3af;width:40%">Paid by</td>
              <td style="padding:10px 0;color:#111827;font-weight:500">${data.orgName}</td>
            </tr>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#9ca3af">Payroll run</td>
              <td style="padding:10px 0;color:#111827;font-weight:500">${data.runLabel}</td>
            </tr>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#9ca3af">Amount</td>
              <td style="padding:10px 0;color:#10b981;font-weight:700">${formattedAmount}</td>
            </tr>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#9ca3af">Paid to</td>
              <td style="padding:10px 0;color:#111827;font-family:monospace;font-size:12px">${shortWallet}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#9ca3af">Date</td>
              <td style="padding:10px 0;color:#111827;font-weight:500">${formattedDate}</td>
            </tr>
          </table>

          <!-- CTA -->
          <a href="${data.explorerUrl}"
             style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
            View My Payment on Explorer →
          </a>

          <p style="color:#9ca3af;font-size:12px;text-align:center;margin:20px 0 0;line-height:1.6">
            This payment was executed on-chain and is permanently recorded.<br/>
            You can verify it at any time using the link above.
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center">
          <span style="color:#9ca3af;font-size:12px">✦ NovaPay · On-chain payroll for modern teams</span>
        </div>

      </div>
    `,
  };
}

export function invitationEmail(data: {
  orgName:   string;
  role:      string;
  inviter:   string;
  token:     string;
  appUrl:    string;
}): { subject: string; html: string } {
  return {
    subject: `You've been invited to join ${data.orgName} on NovaPay`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#6366f1">You're invited to NovaPay 🚀</h2>
        <p>Hi,</p>
        <p><strong>${data.inviter}</strong> has invited you to join <strong>${data.orgName}</strong> on NovaPay as a <strong>${data.role}</strong>.</p>
        <p>NovaPay is a Web3 payroll platform for on-chain batch payments.</p>
        <a href="${data.appUrl}/invite?token=${data.token}"
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Accept Invitation →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">This invitation expires in 7 days. NovaPay · On-chain payroll for modern teams</p>
      </div>
    `,
  };
}
