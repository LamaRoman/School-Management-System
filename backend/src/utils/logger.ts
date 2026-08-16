import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV === "development" && {
    transport: { target: "pino/file", options: { destination: 1 } },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  }),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
});

export default logger;
