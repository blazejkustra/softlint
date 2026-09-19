export const logger = {
  info: (message: string, fields: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: "info", message, ...fields })),
  error: (message: string, fields: Record<string, unknown> = {}) => console.error(JSON.stringify({ level: "error", message, ...fields })),
};
