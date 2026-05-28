// ── Discord Webhook Notifications ─────────────────────────────────────────────
// Fire-and-forget: posts a rich embed to an org's Discord channel.
// Each org pastes their own webhook URL in Org Settings (no Discord OAuth needed).

interface DiscordEmbed {
  title:        string;
  description:  string;
  color:        number;      // decimal colour int (e.g. 0x6366f1)
  fields?:      { name: string; value: string; inline?: boolean }[];
  footer?:      { text: string };
  timestamp?:   string;      // ISO-8601
}

const COLORS = {
  indigo: 0x6366f1,
  green:  0x10b981,
  red:    0xef4444,
  amber:  0xf59e0b,
} as const;

export async function sendDiscordWebhook(
  webhookUrl: string,
  embed: DiscordEmbed,
): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      console.error(`[DiscordService] Webhook responded ${res.status}`);
    }
  } catch (err) {
    console.error('[DiscordService] Failed to deliver webhook:', err);
  }
}

// ── Per-event helpers ─────────────────────────────────────────────────────────

export function discordPayrollSubmitted(data: {
  orgName:   string;
  runLabel:  string;
  submitter: string;
  total:     string;
  token:     string;
  appUrl:    string;
  orgId:     string;
  runId:     string;
}): DiscordEmbed {
  return {
    title:       `🔔 Payroll Needs Approval`,
    description: `**${data.submitter}** submitted **"${data.runLabel}"** and it needs your approval.`,
    color:       COLORS.indigo,
    fields: [
      { name: 'Organisation', value: data.orgName,              inline: true },
      { name: 'Total',        value: `${data.total} ${data.token}`, inline: true },
      { name: 'Review',       value: `[Open in NovaPay](${data.appUrl}/org/${data.orgId}/payroll/${data.runId})` },
    ],
    footer:    { text: 'NovaPay · On-chain payroll' },
    timestamp: new Date().toISOString(),
  };
}

export function discordPayrollApproved(data: {
  orgName:  string;
  runLabel: string;
  approver: string;
  total:    string;
  token:    string;
  appUrl:   string;
  orgId:    string;
  runId:    string;
}): DiscordEmbed {
  return {
    title:       `✅ Payroll Approved — Ready to Execute`,
    description: `**"${data.runLabel}"** was approved by **${data.approver}** and is ready for on-chain execution.`,
    color:       COLORS.green,
    fields: [
      { name: 'Organisation', value: data.orgName,                  inline: true },
      { name: 'Total',        value: `${data.total} ${data.token}`, inline: true },
      { name: 'Execute',      value: `[Execute Now](${data.appUrl}/org/${data.orgId}/payroll/${data.runId}/execute)` },
    ],
    footer:    { text: 'NovaPay · On-chain payroll' },
    timestamp: new Date().toISOString(),
  };
}

export function discordPayrollRejected(data: {
  orgName:  string;
  runLabel: string;
  rejector: string;
  note:     string;
  appUrl:   string;
  orgId:    string;
  runId:    string;
}): DiscordEmbed {
  return {
    title:       `❌ Payroll Rejected`,
    description: `**"${data.runLabel}"** was rejected by **${data.rejector}**.`,
    color:       COLORS.red,
    fields: [
      { name: 'Organisation', value: data.orgName },
      { name: 'Reason',       value: data.note || 'No reason provided.' },
      { name: 'View',         value: `[See Details](${data.appUrl}/org/${data.orgId}/payroll/${data.runId})` },
    ],
    footer:    { text: 'NovaPay · On-chain payroll' },
    timestamp: new Date().toISOString(),
  };
}

export function discordPayrollExecuted(data: {
  orgName:    string;
  runLabel:   string;
  total:      string;
  token:      string;
  txHash:     string;
  explorerUrl: string;
  recipients: string[];
}): DiscordEmbed {
  // Build recipient list, truncate if too long for Discord's 1024-char field limit
  const MAX_CHARS = 1000;
  let recipientList = data.recipients.map((n) => `• ${n}`).join('\n');
  if (recipientList.length > MAX_CHARS) {
    const lines: string[] = [];
    let chars = 0;
    for (const name of data.recipients) {
      const line = `• ${name}\n`;
      if (chars + line.length > MAX_CHARS - 20) {
        const remaining = data.recipients.length - lines.length;
        lines.push(`_…and ${remaining} more_`);
        break;
      }
      lines.push(`• ${name}`);
      chars += line.length;
    }
    recipientList = lines.join('\n');
  }

  return {
    title:       `🎉 Payroll Executed On-chain`,
    description: `**"${data.runLabel}"** has been successfully disbursed on Morph.`,
    color:       COLORS.green,
    fields: [
      { name: 'Organisation',  value: data.orgName,                  inline: true },
      { name: 'Total',         value: `${data.total} ${data.token}`, inline: true },
      { name: 'Tx Hash',       value: `[${data.txHash.slice(0, 16)}…](${data.explorerUrl})` },
      { name: `Recipients (${data.recipients.length})`, value: recipientList || '—' },
    ],
    footer:    { text: 'NovaPay · On-chain payroll' },
    timestamp: new Date().toISOString(),
  };
}

export function discordPayrollFailed(data: {
  orgName:    string;
  runLabel:   string;
  txHash:     string;
  explorerUrl: string;
}): DiscordEmbed {
  return {
    title:       `💥 Payroll Transaction Failed`,
    description: `The on-chain transaction for **"${data.runLabel}"** was reverted or timed out.`,
    color:       COLORS.red,
    fields: [
      { name: 'Organisation', value: data.orgName },
      { name: 'Tx Hash',      value: `[${data.txHash.slice(0, 16)}…](${data.explorerUrl})` },
      { name: 'Action',       value: 'Please check the transaction on Morph Explorer and re-execute if needed.' },
    ],
    footer:    { text: 'NovaPay · On-chain payroll' },
    timestamp: new Date().toISOString(),
  };
}
