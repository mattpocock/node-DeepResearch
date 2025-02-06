import { z } from 'zod';

export function createResponseSchema(config: {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    items?: any;
    maxItems?: number;
    minItems?: number;
  }>;
  required: string[];
}) {
  const properties: Record<string, any> = {};
  
  for (const [key, prop] of Object.entries(config.properties)) {
    if (prop.type === 'STRING') {
      properties[key] = z.string().describe(prop.description);
    } else if (prop.type === 'BOOLEAN') {
      properties[key] = z.boolean().describe(prop.description);
    } else if (prop.type === 'ARRAY') {
      const itemSchema = prop.items.type === 'STRING' ? z.string() : z.object({});
      properties[key] = z.array(itemSchema)
        .describe(prop.description)
        .max(prop.maxItems || Infinity)
        .min(prop.minItems || 0);
    }
  }
  
  return z.object(properties);
}
