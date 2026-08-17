// src/middleware/asyncHandler.ts
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express route handler so a rejected promise (e.g. a Prisma call
 * that throws) is forwarded to next(err) instead of becoming an unhandled
 * rejection that crashes the process. Express 4 does not do this automatically
 * for async handlers.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
