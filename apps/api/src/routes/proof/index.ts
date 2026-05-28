import { FastifyInstance } from 'fastify';
import prisma from '../../db/client';

export default async function proofRoutes(app: FastifyInstance) {

  // ── GET /proof/:txHash — public payroll verification page ─────────────────
  // No auth required — anyone can verify a completed payroll run on-chain.
  // Returns only public, non-sensitive fields.
  app.get('/:txHash', async (request: any, reply) => {
    const { txHash } = request.params as { txHash: string };

    const run = await prisma.payrollRun.findFirst({
      where:  { txHash, status: 'complete' },
      select: {
        id:             true,
        label:          true,
        token:          true,
        totalAmount:    true,
        recipientCount: true,
        executedAt:     true,
        txHash:         true,
        explorerUrl:    true,
        createdAt:      true,
        org: { select: { name: true, slug: true } },
      },
    });

    // Return 404 for anything that isn't a confirmed complete run —
    // don't leak that a run exists but is pending/failed
    if (!run) {
      return reply.code(404).send({
        error: 'No verified payroll found for this transaction hash',
      });
    }

    return reply.send({
      verified:       true,
      runId:          run.id,
      label:          run.label,
      token:          run.token,
      totalAmount:    run.totalAmount?.toString(),
      recipientCount: run.recipientCount,
      executedAt:     run.executedAt,
      txHash:         run.txHash,
      explorerUrl:    run.explorerUrl,
      org: {
        name: run.org.name,
        slug: run.org.slug,
      },
    });
  });
}
