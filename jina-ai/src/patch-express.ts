import { ApplicationError, RPC_CALL_ENVIRONMENT } from "civkit/civ-rpc";
import { marshalErrorLike } from "civkit/lang";
import { randomUUID } from "crypto";
import { once } from "events";
import type { NextFunction, Request, Response } from "express";

import { JinaEmbeddingsAuthDTO } from "./dto/jina-embeddings-auth";
import rateLimitControl, { API_CALL_STATUS, RateLimitDesc } from "./rate-limit";
import asyncLocalContext from "./lib/async-context";
import globalLogger from "./lib/logger";

globalLogger.serviceReady();
const logger = globalLogger.child({ service: 'BillingMiddleware' });

const appName = 'DEEPRESEARCH';
export const jinaAiBillingMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/ping') {
        res.status(200).end('pone');
        return;
    }
    if (req.method !== 'POST' && req.method !== 'GET') {
        next();
        return;
    }
    asyncLocalContext.run(async () => {
        const googleTraceId = req.get('x-cloud-trace-context')?.split('/')?.[0];
        const ctx = asyncLocalContext.ctx;
        ctx.traceId = req.get('x-request-id') || req.get('request-id') || googleTraceId || randomUUID();
        ctx.traceT0 = new Date();
        ctx.ip = req?.ip;

        try {
            const authDto = JinaEmbeddingsAuthDTO.from({
                [RPC_CALL_ENVIRONMENT]: { req, res }
            });

            const user = await authDto.assertUser();
            await rateLimitControl.serviceReady();
            const rateLimitPolicy = authDto.getRateLimits(appName) || [
                parseInt(user.metadata?.speed_level) >= 2 ?
                    RateLimitDesc.from({
                        occurrence: 30,
                        periodSeconds: 60
                    }) :
                    RateLimitDesc.from({
                        occurrence: 10,
                        periodSeconds: 60
                    })
            ];
            const criterions = rateLimitPolicy.map((c) => rateLimitControl.rateLimitDescToCriterion(c));
            await Promise.all(criterions.map(([pointInTime, n]) => rateLimitControl.assertUidPeriodicLimit(user._id, pointInTime, n, appName)));

            const apiRoll = rateLimitControl.record({ uid: user._id, tags: [appName] })
            apiRoll.save().catch((err) => logger.warn(`Failed to save rate limit record`, { err: marshalErrorLike(err) }));

            const pResClose = once(res, 'close');

            next();

            await pResClose;
            const chargeAmount = ctx.chargeAmount;
            if (chargeAmount) {
                authDto.reportUsage(chargeAmount, `reader-${appName}`).catch((err) => {
                    logger.warn(`Unable to report usage for ${user._id}`, { err: marshalErrorLike(err) });
                });
                apiRoll.chargeAmount = chargeAmount;
            }
            apiRoll.status = res.statusCode === 200 ? API_CALL_STATUS.SUCCESS : API_CALL_STATUS.ERROR;
            apiRoll.save().catch((err) => logger.warn(`Failed to save rate limit record`, { err: marshalErrorLike(err) }));
            logger.info(`HTTP ${res.statusCode} for request ${ctx.traceId} after ${Date.now() - ctx.traceT0.valueOf()}ms`, {
                uid: user._id,
                chargeAmount,
            });

        } catch (err: any) {
            if (!res.headersSent) {
                if (err instanceof ApplicationError) {
                    res.status(parseInt(err.code as string) || 500).json({ error: err.message });

                    return;
                }

                res.status(500).json({ error: 'Internal' });
            }

            logger.error(`Error in billing middleware`, { err: marshalErrorLike(err) });
            if (err.stack) {
                logger.error(err.stack);
            }
        }

    });
}