import { FastifyRequest, FastifyReply } from 'fastify';

export interface JwtPayload {
  sub: string;
  email: string;
  orgs: Array<{
    org_id: string;
    role:   string;
    slug:   string;
  }>;
  iat: number;
  exp: number;
}

// Tell @fastify/jwt what shape the decoded token has
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user:    JwtPayload;
  }
}

/**
 * Verifies the Bearer JWT on every authenticated route.
 * Attaches decoded payload to request.user
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}
