import pinoHttp from "pino-http";
import logger from "../utils/logger";

const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => (req as any).url === "/health",
  },
  customLogLevel(_req, res, err) {
    if (err || (res.statusCode && res.statusCode >= 500)) return "error";
    if (res.statusCode && res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage(_req, res) {
    return `${res.statusCode} ${(res as any).req?.method} ${(res as any).req?.url}`;
  },
  customErrorMessage(_req, res) {
    return `${res.statusCode} ${(res as any).req?.method} ${(res as any).req?.url}`;
  },
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

export default requestLogger;
